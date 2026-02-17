/**
 * Gateway Server — HTTP + WebSocket on a single port.
 *
 * Aligned with OpenClaw Gateway architecture:
 * - HTTP serves static Web UI + API endpoints + health
 * - WebSocket serves req/res/event protocol
 * - Single port multiplexed (default :52134)
 */

import type { Server, ServerWebSocket } from "bun";
import { join } from "node:path";

import { resolveAuthConfig, authenticateRequest, buildAuthExemptPrefixes } from "./core/auth.ts";
import type { GatewayContext, TelegramMessageMode, WsClientData, DispatchResult } from "./gateway/types.ts";
import { tryHandleCommand, registerBuiltinCommands } from "./gateway/command-handler.ts";
import { executeRegisteredTool } from "./gateway/tool-executor.ts";
import { loadConfig, ensureDataDir, type Config, type CronJob, resolveConfigPath, watchConfig } from "./core/config.ts";
import { RpcPool } from "./core/rpc-pool.ts";
import { MessageQueueManager, type PrioritizedWork } from "./core/message-queue.ts";
import { resolveSessionKey, resolveAgentId, getCwdForRole } from "./core/session-router.ts";
import { createLogger as createConsoleLogger, setLogLevel, type Logger, type InboundMessage, type SessionKey, type SessionState, type WsFrame } from "./core/types.ts";
import { SessionStore } from "./core/session-store.ts";
import { initFileLogger, createFileLogger } from "./core/logger-file.ts";
import { getCronEngine, markCronSelfDelivered } from "./plugins/builtin/cron/index.ts";
import { TranscriptLogger } from "./core/transcript-logger.ts";
import { buildCapabilityProfile } from "./core/capability-profile.ts";
import { ExtensionUIForwarder } from "./core/extension-ui-forwarder.ts";

import { DeduplicationCache } from "./core/dedup-cache.ts";
import { MetricsCollector, type MetricsDataSource } from "./core/metrics.ts";
import { DelegateExecutor } from "./core/delegate-executor.ts";
import { GatewayObservability } from "./core/gateway-observability.ts";
import { HeartbeatExecutor } from "./core/heartbeat-executor.ts";
import { SystemEventsQueue } from "./core/system-events.ts";
import { createWsRouter, dispatchWsFrame } from "./ws/ws-router.ts";
import { routeHttp } from "./api/http-router.ts";
import { processMessage } from "./gateway/message-pipeline.ts";
import { dispatchMessage, resolveTelegramMsgMode } from "./gateway/dispatch.ts";
import { migrateTelegramSessionKeys } from "./gateway/telegram-helpers.ts";
import {
  createPluginRegistry,
  PluginLoader,
  type PluginRegistryState,
} from "./plugins/loader.ts";
import type {
  GatewayPluginApi,
} from "./plugins/types.ts";
import { createPluginApi } from "./plugins/plugin-api-factory.ts";
import { ExecGuard } from "./core/exec-guard.ts";
import { ModelHealthTracker } from "./core/model-health.ts";


export interface GatewayOptions {
  configPath?: string;
  port?: number;
  verbose?: boolean;
  noGui?: boolean;
}

export class Gateway {
  private config: Config;
  private pool: RpcPool;
  private queue: MessageQueueManager;
  private registry: PluginRegistryState;
  private sessions: SessionStore;
  private transcripts: TranscriptLogger;
  private metrics: MetricsCollector;
  private extensionUI = new ExtensionUIForwarder();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private configWatcher: (() => void) | null = null;
  private wsClients = new Map<string, ServerWebSocket<WsClientData>>();
  private server: Server<WsClientData> | null = null;
  private resolvedToken?: string;
  private authExemptPrefixes: string[] = [];
  private log: Logger;
  private nextClientId = 0;
  private dedup: DeduplicationCache;
  private sessionMessageModeOverrides = new Map<SessionKey, TelegramMessageMode>();
  private activeInboundMessages = new Map<SessionKey, InboundMessage>();
  private delegateExecutor: DelegateExecutor | null = null;
  private heartbeatExecutor: HeartbeatExecutor | null = null;
  private execGuard: ExecGuard;
  private modelHealth: ModelHealthTracker | null = null;
  private systemEvents: SystemEventsQueue;
  private noGui: boolean;
  private wsRouter: Map<string, import("./ws/ws-router.ts").WsMethodFn> | null = null;
  /** 缓存每个 channel 注册时的 api 引用，供 init 调用 */
  private _channelApis = new Map<string, GatewayPluginApi>();
  private observability: GatewayObservability;

  constructor(options: GatewayOptions = {}) {
    this.config = loadConfig(options.configPath);
    if (options.port) this.config.gateway.port = options.port;
    if (this.config.gateway.logLevel) setLogLevel(this.config.gateway.logLevel);
    this.noGui = options.noGui ?? false;

    // Initialize file logging if configured
    const logDir = join(this.config.session.dataDir, "..", "logs");
    initFileLogger({
      dir: logDir,
      fileEnabled: this.config.logging.file,
      consoleEnabled: true,
      level: this.config.logging.level,
      retentionDays: this.config.logging.retentionDays,
    });
    this.log = this.config.logging.file ? createFileLogger("gateway") : createConsoleLogger("gateway");

    // Initialize exec guard (v3.4 S3) — before pool and metrics so spawn checks work
    this.execGuard = new ExecGuard();
    this.execGuard.validatePiCliPath(this.config.agent.piCliPath ?? "pi");

    // Initialize model health tracker (T10) if failover configured
    if (this.config.agent?.modelFailover) {
      this.modelHealth = new ModelHealthTracker(this.config.agent.modelFailover);
      this.log.info(`Model failover enabled: primary=${this.config.agent.modelFailover.primary ?? this.config.agent.model ?? "default"}, fallbacks=${(this.config.agent.modelFailover.fallbacks ?? []).join(",") || "none"}`);
    }

    this.metrics = new MetricsCollector(this.execGuard);

    this.pool = new RpcPool(this.config, this.metrics, this.execGuard, (sessionKey) => {
      this.registry.hooks.dispatch("session_end", { sessionKey }).catch(() => {});
    });
    const qc = this.config.queue;
    this.queue = new MessageQueueManager(
      qc.maxPerSession,
      { mode: qc.mode, collectDebounceMs: qc.collectDebounceMs },
      this.metrics,
      qc.globalMaxPending,
    );
    this.dedup = new DeduplicationCache({ cacheSize: qc.dedup.cacheSize, ttlMs: qc.dedup.ttlMs });
    this.registry = createPluginRegistry();
    this.sessions = new SessionStore(this.config.session.dataDir);
    this.systemEvents = new SystemEventsQueue(30_000, this.config.session.dataDir.replace(/\/sessions$/, ""));
    this.transcripts = new TranscriptLogger(join(this.config.session.dataDir, "transcripts"));
    this.observability = new GatewayObservability(500);

    // Initialize v3 delegate executor if multi-agent config exists
    if (this.config.agents && this.config.agents.list.length > 0) {
      this.delegateExecutor = new DelegateExecutor(this.config, this.pool, this.log, this.metrics);
    }

    // Initialize heartbeat executor (v3.1) with system events and delivery deps
    this.heartbeatExecutor = new HeartbeatExecutor(this.config, this.pool, {
      onHeartbeatStart: (agentId) => {
        this.log.debug(`Heartbeat started for agent: ${agentId}`);
      },
      onHeartbeatComplete: (agentId, result) => {
        this.log.debug(`Heartbeat completed for agent ${agentId}: ${result.status}`);
        // Delivery is now handled internally by HeartbeatExecutor.deliverAlert
      },
      onHeartbeatSkip: (agentId, reason) => {
        this.log.debug(`Heartbeat skipped for agent ${agentId}: ${reason}`);
      },
    }, this.systemEvents, undefined, {
      sessions: this.sessions,
      getChannels: () => this.registry.channels,
      bindings: this.config.agents?.bindings,
    });
  }


  async start(): Promise<void> {
    this.log.info("Starting pi-gateway...");

    // Ensure data directories exist
    ensureDataDir(this.config);

    // Start RPC pool
    await this.pool.start();

    // Start metrics collector
    this.metrics.start(this.createMetricsDataSource());

    // Load plugins
    const loader = new PluginLoader(this.config, this.registry, (id, m) => createPluginApi(id, m, this.ctx));
    // Precedence: external plugins first, builtins as fallback.
    const { errors } = await loader.loadAll();
    await loader.loadBuiltins();
    const loaded = loader.getLoadedPluginIds();
    this.log.info(`Plugins loaded: ${loaded.join(", ") || "(none)"}`);
    for (const { id, error } of errors) {
      this.log.error(`Plugin ${id} failed: ${error}`);
    }

    // BG-003: startup conflict summary
    const conflicts = this.registry.conflicts;
    if (conflicts.length > 0) {
      this.log.warn(`Plugin registration conflicts (${conflicts.length}):`);
      for (const c of conflicts) {
        this.log.warn(`  ${c.type} "${c.name}": ${c.existingPlugin} → ${c.newPlugin} (${c.resolution})`);
      }
    }

    // Dispatch gateway_start hook
    await this.registry.hooks.dispatch("gateway_start", {});

    // Breaking-change migration: add telegram account dimension to legacy session keys.
    this.migrateTelegramSessionKeys();

    // Init channel plugins (确保 init 完成后再 start)
    for (const [id, channel] of this.registry.channels) {
      try {
        const api = this._channelApis.get(id);
        if (api) await channel.init(api);
      } catch (err: unknown) {
        this.log.error(`Channel ${id} init failed: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    // Start channel plugins
    for (const [id, channel] of this.registry.channels) {
      try {
        await channel.start();
        this.log.info(`Channel started: ${id}`);
      } catch (err: unknown) {
        this.log.error(`Channel ${id} failed to start: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    // Register built-in commands
    registerBuiltinCommands(this.ctx);

    // Start background services
    for (const service of this.registry.services) {
      try {
        await service.start(createPluginApi(service.name, { id: service.name, name: service.name, main: "" }, this.ctx));
        this.log.info(`Service started: ${service.name}`);
      } catch (err: unknown) {
        this.log.error(`Service ${service.name} failed to start: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    // Start heartbeat executor (v3.1)
    this.heartbeatExecutor?.start();

    // Resolve auth config (fail-closed: v3.4 S1)
    const { resolvedToken } = resolveAuthConfig(this.config.gateway.auth, this.log);
    this.resolvedToken = resolvedToken;
    this.authExemptPrefixes = buildAuthExemptPrefixes(this.config);

    // Start HTTP + WebSocket server
    this.startServer();

    // WS tick keepalive (aligned with OpenClaw event:tick, 30s)
    this.tickTimer = setInterval(() => {
      this.broadcastToWs("tick", { ts: Date.now() });
      // Cleanup expired system events (v3.1)
      this.systemEvents.gc();
    }, 30_000);

    // Config file watcher (hot reload)
    this.configWatcher = watchConfig(resolveConfigPath(), (newConfig) => {
      this.log.info("Config file changed, reloading...");
      this.config = newConfig;
      this.pool.setConfig(newConfig);
    });

    this.log.info(`Gateway listening on ${this.config.gateway.bind}:${this.config.gateway.port}`);
    if (this.noGui) {
      this.log.info("Web UI disabled (--no-gui mode)");
    } else {
      this.log.info(`Web UI: http://localhost:${this.config.gateway.port}`);
    }
  }


  async stop(): Promise<void> {
    this.log.info("Stopping gateway...");

    // Dispatch gateway_stop hook
    await this.registry.hooks.dispatch("gateway_stop", {});

    // Stop channels
    for (const [id, channel] of this.registry.channels) {
      try { await channel.stop(); } catch {}
    }

    // Stop services
    for (const service of this.registry.services) {
      try { await service.stop(); } catch {}
    }

    // Stop server
    this.server?.stop(true);

    // Stop timers
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.configWatcher) { this.configWatcher(); this.configWatcher = null; }

    // Stop heartbeat executor (v3.1)
    this.heartbeatExecutor?.stop();

    // Dispatch session_end for persisted sessions
    for (const session of this.sessions.toArray()) {
      await this.registry.hooks.dispatch("session_end", { sessionKey: session.sessionKey });
    }
    this.sessionMessageModeOverrides.clear();

    // Persist sessions
    this.sessions.dispose();

    // Stop system events gc timer
    this.systemEvents.dispose();

    // Stop RPC pool
    await this.pool.stop();

    // Stop metrics collector
    this.metrics.stop();

    this.log.info("Gateway stopped");
  }

  private migrateTelegramSessionKeys(): void {
    migrateTelegramSessionKeys(this.sessions, this.config, this.log);
  }

  private resolveTelegramMessageMode(sessionKey: SessionKey, sourceAccountId?: string): TelegramMessageMode {
    return resolveTelegramMsgMode(sessionKey, this.ctx, sourceAccountId);
  }



  /**
   * Dispatch an inbound message to the agent pipeline.
   * Called by channel plugins and WebChat.
   */
  async dispatch(msg: InboundMessage): Promise<DispatchResult> {
    return dispatchMessage(msg, this.ctx);
  }

  private buildSessionProfile(sessionKey: SessionKey, role: string) {
    const cwd = getCwdForRole(role, this.config);
    return buildCapabilityProfile({
      config: this.config,
      role,
      cwd,
      sessionKey,
    });
  }

  private async compactSessionWithHooks(sessionKey: SessionKey, instructions?: string): Promise<void> {
    const rpc = this.pool.getForSession(sessionKey);
    if (!rpc) {
      throw new Error("No active session");
    }

    await this.registry.hooks.dispatch("before_compaction", { sessionKey });
    const result = await rpc.compact(instructions);
    const summary = (result && typeof result === "object" && "summary" in result && typeof (result as any).summary === "string")
      ? (result as any).summary as string
      : undefined;
    await this.registry.hooks.dispatch("after_compaction", { sessionKey, summary });
  }


  private startServer(): void {
    const self = this;

    // Initialize WS method router (ctx is fully ready at this point)
    this.wsRouter = createWsRouter(this.ctx);

    this.server = Bun.serve<WsClientData>({
      port: this.config.gateway.port,
      hostname: this.config.gateway.bind === "loopback" ? "127.0.0.1" : "0.0.0.0",

      async fetch(req, server) {
        const url = new URL(req.url);

        // Auth check — fail-closed (v3.4 S1)
        const authDenied = authenticateRequest(req, url, self.config.gateway.auth, self.resolvedToken, self.authExemptPrefixes);
        if (authDenied) return authDenied;

        // WebSocket upgrade — Bun requires returning `undefined` on success
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const clientId = `ws-${++self.nextClientId}`;
          self.log.debug(`WS upgrade request from ${clientId}`);
          if (server.upgrade(req, { data: { clientId } })) {
            return; // Must return undefined for Bun WS upgrade
          }
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Plugin HTTP routes
        for (const route of self.registry.httpRoutes) {
          if (req.method === route.method && url.pathname === route.path) {
            return route.handler(req);
          }
        }

        // Built-in HTTP routes
        return await self.handleHttp(req, url);
      },

      websocket: {
        open(ws) {
          self.wsClients.set(ws.data.clientId, ws);
          self.log.debug(`WS client connected: ${ws.data.clientId}`);
          // Re-send pending Extension UI requests to newly connected client
          self.extensionUI.resendPending(ws);
        },
        close(ws) {
          self.wsClients.delete(ws.data.clientId);
          self.log.debug(`WS client disconnected: ${ws.data.clientId}`);
        },
        async message(ws, raw) {
          try {
            const frame = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as WsFrame;
            await dispatchWsFrame(self.wsRouter!, frame, self.ctx, ws);
          } catch (err: unknown) {
            ws.send(JSON.stringify({ type: "res", id: "?", ok: false, error: (err instanceof Error ? err.message : String(err)) }));
          }
        },
      },
    });
  }


  private async handleHttp(req: Request, url: URL): Promise<Response> {
    return routeHttp(req, url, this.ctx);
  }


  private broadcastToWs(event: string, payload: unknown): void {
    const frame = JSON.stringify({ type: "event", event, payload });
    for (const ws of this.wsClients.values()) {
      try { ws.send(frame); } catch {}
    }
  }


  /** Proxy for extracted tool-executor — preserves public API for tests/plugins */
  async executeRegisteredTool(toolName: string, params: Record<string, unknown>, sessionKey: SessionKey) {
    return executeRegisteredTool(toolName, params, sessionKey, this.ctx);
  }

  /** Proxy for extracted message-pipeline — preserves public API for tests */
  async processMessage(msg: InboundMessage, queueItem?: PrioritizedWork) {
    return processMessage(msg, this.ctx, queueItem);
  }

  private get ctx(): GatewayContext {
    return {
      config: this.config,
      pool: this.pool,
      queue: this.queue,
      registry: this.registry,
      sessions: this.sessions,
      transcripts: this.transcripts,
      metrics: this.metrics,
      extensionUI: this.extensionUI,
      systemEvents: this.systemEvents,
      dedup: this.dedup,
      cron: getCronEngine(),
      heartbeat: this.heartbeatExecutor,
      delegateExecutor: this.delegateExecutor,
      execGuard: this.execGuard,
      modelHealth: this.modelHealth,
      log: this.log,
      wsClients: this.wsClients,
      noGui: this.noGui,
      sessionMessageModeOverrides: this.sessionMessageModeOverrides,
      activeInboundMessages: this.activeInboundMessages,
      channelApis: this._channelApis,
      observability: this.observability,
      resolveTelegramMessageMode: (sk, accountId) => this.resolveTelegramMessageMode(sk, accountId),
      broadcastToWs: (event, payload) => this.broadcastToWs(event, payload),
      buildSessionProfile: (sk, role) => this.buildSessionProfile(sk, role),
      dispatch: (msg) => this.dispatch(msg),
      compactSessionWithHooks: (sk, inst) => this.compactSessionWithHooks(sk, inst),
      listAvailableRoles: () => [],
      setSessionRole: async () => false,
      reloadConfig: () => { this.config = loadConfig(); },
      onCronDelivered: (sk) => {
        markCronSelfDelivered(sk);
      },
    };
  }


  private createMetricsDataSource(): MetricsDataSource {
    const self = this;
    return {
      getPoolStats() {
        return self.pool.getStats();
      },
      getQueueStats() {
        return self.queue.getStats();
      },
      getActiveSessionCount() {
        return self.sessions.size;
      },
      getRpcPids() {
        return self.pool
          .getAllClients()
          .map((c) => c.pid)
          .filter((pid): pid is number => pid !== null);
      },
    };
  }
}
