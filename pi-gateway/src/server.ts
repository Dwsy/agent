/**
 * Gateway Server — HTTP + WebSocket on a single port.
 *
 * Aligned with OpenClaw Gateway architecture:
 * - HTTP serves static Web UI + API endpoints + health
 * - WebSocket serves req/res/event protocol
 * - Single port multiplexed (default :18789)
 */

import type { Server, ServerWebSocket } from "bun";
import { join } from "node:path";
import { existsSync, renameSync } from "node:fs";

import { safeTokenCompare, resolveAuthConfig, authenticateRequest, buildAuthExemptPrefixes } from "./core/auth.ts";
import { serveStaticFile } from "./core/static-server.ts";
import { handleWebhookWake, handleWebhookEvent } from "./api/webhook-api.ts";
import { handleOpenAiChat } from "./api/openai-compat.ts";
import type { GatewayContext, TelegramMessageMode, WsClientData } from "./gateway/types.ts";
import { tryHandleCommand, registerBuiltinCommands } from "./gateway/command-handler.ts";
import { listAvailableRoles, setSessionRole } from "./gateway/role-manager.ts";
import { executeRegisteredTool, handleToolsList, handleToolCall } from "./gateway/tool-executor.ts";
import { handleSessionReset, handleSessionThink, handleSessionModel, handleModelsList, handleSessionUsage, handleSessionsList, handleSessionDetail } from "./api/session-api.ts";
import { loadConfig, ensureDataDir, type Config, type CronJob, resolveConfigPath, watchConfig } from "./core/config.ts";
import { RpcPool } from "./core/rpc-pool.ts";
import type { RpcClient } from "./core/rpc-client.ts";
import { MessageQueueManager, type PrioritizedWork } from "./core/message-queue.ts";
import { resolveSessionKey, resolveAgentId, getCwdForRole } from "./core/session-router.ts";
import { createLogger as createConsoleLogger, type Logger, type InboundMessage, type SessionKey, type SessionState, type WsFrame, type ImageContent, type MessageSource } from "./core/types.ts";
import { SessionStore, encodeSessionDir, getSessionDir } from "./core/session-store.ts";
import { initFileLogger, createFileLogger } from "./core/logger-file.ts";
import { CronEngine } from "./core/cron.ts";
import { handleCronApi } from "./core/cron-api.ts";
import { TranscriptLogger } from "./core/transcript-logger.ts";
import { searchMemory, getMemoryStats, getRoleInfo, listRoles } from "./core/memory-access.ts";
import { buildCapabilityProfile } from "./core/capability-profile.ts";
import { ExtensionUIForwarder } from "./core/extension-ui-forwarder.ts";

import { DeduplicationCache } from "./core/dedup-cache.ts";
import { MetricsCollector, type MetricsDataSource } from "./core/metrics.ts";
import { DelegateExecutor } from "./core/delegate-executor.ts";
import { HeartbeatExecutor } from "./core/heartbeat-executor.ts";
import { SystemEventsQueue } from "./core/system-events.ts";
import { handleMediaServe } from "./api/media-routes.ts";
import { createWsRouter, dispatchWsFrame } from "./ws/ws-router.ts";
import { handleMediaSendRequest } from "./api/media-send.ts";
import { processMessage } from "./gateway/message-pipeline.ts";
import {
  createPluginRegistry,
  PluginLoader,
  type PluginRegistryState,
} from "./plugins/loader.ts";
import type {
  GatewayPluginApi,
  PluginManifest,
} from "./plugins/types.ts";
import { createPluginApi } from "./plugins/plugin-api-factory.ts";

// ============================================================================
// Gateway Class
// ============================================================================

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
  private cron: CronEngine | null = null;
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
  private delegateExecutor: DelegateExecutor | null = null;
  private heartbeatExecutor: HeartbeatExecutor | null = null;
  private systemEvents = new SystemEventsQueue();
  private noGui: boolean;
  private wsRouter: Map<string, import("./ws/ws-router.ts").WsMethodFn> | null = null;
  /** 缓存每个 channel 注册时的 api 引用，供 init 调用 */
  private _channelApis = new Map<string, GatewayPluginApi>();

  constructor(options: GatewayOptions = {}) {
    this.config = loadConfig(options.configPath);
    if (options.port) this.config.gateway.port = options.port;
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
    this.metrics = new MetricsCollector();
    this.pool = new RpcPool(this.config, this.metrics);
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
    this.transcripts = new TranscriptLogger(join(this.config.session.dataDir, "transcripts"));

    // Initialize v3 delegate executor if multi-agent config exists
    if (this.config.agents && this.config.agents.list.length > 0) {
      this.delegateExecutor = new DelegateExecutor(this.config, this.pool, this.log, this.metrics);
    }

    // Initialize heartbeat executor (v3.1) with system events
    this.heartbeatExecutor = new HeartbeatExecutor(this.config, this.pool, {
      onHeartbeatStart: (agentId) => {
        this.log.debug(`Heartbeat started for agent: ${agentId}`);
      },
      onHeartbeatComplete: (agentId, result) => {
        this.log.debug(`Heartbeat completed for agent ${agentId}: ${result.status}`);
        if (result.status === "alert" && result.response) {
          this.deliverHeartbeatAlert(agentId, result.response);
        }
      },
      onHeartbeatSkip: (agentId, reason) => {
        this.log.debug(`Heartbeat skipped for agent ${agentId}: ${reason}`);
      },
    }, this.systemEvents);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

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

    // Dispatch gateway_start hook
    await this.registry.hooks.dispatch("gateway_start", {});

    // Breaking-change migration: add telegram account dimension to legacy session keys.
    this.migrateTelegramSessionKeys();

    // Init channel plugins (确保 init 完成后再 start)
    for (const [id, channel] of this.registry.channels) {
      try {
        const api = this._channelApis.get(id);
        if (api) await channel.init(api);
      } catch (err: any) {
        this.log.error(`Channel ${id} init failed: ${err?.message}`);
      }
    }

    // Start channel plugins
    for (const [id, channel] of this.registry.channels) {
      try {
        await channel.start();
        this.log.info(`Channel started: ${id}`);
      } catch (err: any) {
        this.log.error(`Channel ${id} failed to start: ${err?.message}`);
      }
    }

    // Register built-in commands
    registerBuiltinCommands(this.ctx);

    // Start background services
    for (const service of this.registry.services) {
      try {
        await service.start(createPluginApi(service.name, { id: service.name, name: service.name, main: "" }, this.ctx));
        this.log.info(`Service started: ${service.name}`);
      } catch (err: any) {
        this.log.error(`Service ${service.name} failed to start: ${err?.message}`);
      }
    }

    // Start cron engine
    if (this.config.cron.enabled) {
      this.cron = new CronEngine(
        this.config.session.dataDir.replace(/\/sessions$/, ""),
        this,
        this.config,
        undefined, // announcer - TODO: implement if needed
        this.systemEvents,
        (agentId) => this.heartbeatExecutor?.requestNow(agentId),
      );
      this.cron.start();
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

    // Stop cron
    this.cron?.stop();

    // Stop heartbeat executor (v3.1)
    this.heartbeatExecutor?.stop();

    // Dispatch session_end for persisted sessions
    for (const session of this.sessions.toArray()) {
      await this.registry.hooks.dispatch("session_end", { sessionKey: session.sessionKey });
    }
    this.sessionMessageModeOverrides.clear();

    // Persist sessions
    this.sessions.dispose();

    // Stop RPC pool
    await this.pool.stop();

    // Stop metrics collector
    this.metrics.stop();

    this.log.info("Gateway stopped");
  }

  private migrateTelegramSessionKeys(): void {
    const migrations: Array<{ oldKey: string; newKey: string }> = [];
    for (const session of this.sessions.toArray()) {
      const oldKey = session.sessionKey;
      let newKey: string | null = null;
      if (oldKey.startsWith("agent:main:telegram:group:")) {
        newKey = oldKey.replace(
          "agent:main:telegram:",
          "agent:main:telegram:account:default:",
        );
      } else if (oldKey.startsWith("agent:main:telegram:dm:")) {
        newKey = oldKey.replace(
          "agent:main:telegram:",
          "agent:main:telegram:account:default:",
        );
      }
      if (!newKey || newKey === oldKey) continue;
      if (this.sessions.has(newKey)) {
        this.log.warn(`Skip session migration (target exists): ${oldKey} -> ${newKey}`);
        continue;
      }
      migrations.push({ oldKey, newKey });
    }

    if (migrations.length === 0) return;
    const transcriptDir = join(this.config.session.dataDir, "transcripts");
    for (const migration of migrations) {
      const state = this.sessions.get(migration.oldKey);
      if (!state) continue;
      this.sessions.delete(migration.oldKey);
      state.sessionKey = migration.newKey;
      this.sessions.set(migration.newKey, state);

      const oldSessionDir = getSessionDir(this.config.session.dataDir, migration.oldKey);
      const newSessionDir = getSessionDir(this.config.session.dataDir, migration.newKey);
      if (existsSync(oldSessionDir) && !existsSync(newSessionDir)) {
        try {
          renameSync(oldSessionDir, newSessionDir);
        } catch (err: any) {
          this.log.warn(`Session dir migration failed ${migration.oldKey}: ${err?.message ?? String(err)}`);
        }
      }

      const oldTranscript = join(transcriptDir, `${encodeSessionDir(migration.oldKey)}.jsonl`);
      const newTranscript = join(transcriptDir, `${encodeSessionDir(migration.newKey)}.jsonl`);
      if (existsSync(oldTranscript) && !existsSync(newTranscript)) {
        try {
          renameSync(oldTranscript, newTranscript);
        } catch (err: any) {
          this.log.warn(`Transcript migration failed ${migration.oldKey}: ${err?.message ?? String(err)}`);
        }
      }
      this.log.info(`Migrated Telegram session key: ${migration.oldKey} -> ${migration.newKey}`);
    }
    this.sessions.flushIfDirty();
  }

  private normalizeTelegramMessageMode(value: unknown): TelegramMessageMode | null {
    return value === "steer" || value === "follow-up" || value === "interrupt"
      ? value
      : null;
  }

  /**
   * Deliver heartbeat alert to agent's bound channel.
   * Looks up agent bindings to find target channel for delivery.
   */
  private async deliverHeartbeatAlert(agentId: string, alertText: string): Promise<void> {
    // Find binding for this agent
    const binding = this.config.agents?.bindings?.find(b => b.agentId === agentId);
    if (!binding) {
      this.log.warn(`No binding found for agent ${agentId}, cannot deliver heartbeat alert`);
      return;
    }

    const channelName = binding.match.channel;
    if (!channelName) {
      this.log.warn(`No channel specified in binding for agent ${agentId}`);
      return;
    }

    // Get channel plugin
    const channel = this.registry.channels.get(channelName);
    if (!channel) {
      this.log.warn(`Channel ${channelName} not available for heartbeat alert delivery`);
      return;
    }

    // Construct target from binding match
    let target: string;
    if (binding.match.peer?.id) {
      target = binding.match.peer.id;
    } else if (binding.match.guildId) {
      target = binding.match.guildId;
    } else {
      this.log.warn(`Cannot determine target for agent ${agentId} heartbeat alert`);
      return;
    }

    try {
      await channel.outbound.sendText(
        target,
        `🔔 **Heartbeat Alert** (${agentId}):\n${alertText.slice(0, 1000)}`,
        { parseMode: "Markdown" },
      );
      this.log.info(`Heartbeat alert delivered to ${channelName}:${target}`);
    } catch (err: any) {
      this.log.error(`Failed to deliver heartbeat alert: ${err?.message}`);
    }
  }

  private extractTelegramAccountId(sessionKey: SessionKey, sourceAccountId?: string): string {
    if (sourceAccountId?.trim()) return sourceAccountId.trim();
    const matched = sessionKey.match(/^agent:[^:]+:telegram:account:([^:]+):/);
    return matched?.[1] ?? "default";
  }

  private resolveTelegramMessageMode(sessionKey: SessionKey, sourceAccountId?: string): TelegramMessageMode {
    const override = this.sessionMessageModeOverrides.get(sessionKey);
    if (override) return override;

    const tg = this.config.channels.telegram;
    const accountId = this.extractTelegramAccountId(sessionKey, sourceAccountId);
    const accountMode = this.normalizeTelegramMessageMode(tg?.accounts?.[accountId]?.messageMode);
    const channelMode = this.normalizeTelegramMessageMode(tg?.messageMode);
    return accountMode ?? channelMode ?? "steer";
  }

  /**
   * Compute numeric priority for an inbound message.
   * Higher = more urgent. DM=10, group=5, webhook=3, allowlist=+2.
   */
  private computePriority(msg: InboundMessage): number {
    const pc = this.config.queue.priority;
    let p = msg.source.chatType === "dm" ? pc.dm : pc.group;
    // Allowlist bonus
    const channelCfg = this.config.channels[msg.source.channel] as Record<string, unknown> | undefined;
    const allowFrom = channelCfg?.allowFrom as Array<string | number> | undefined;
    if (allowFrom?.some(id => String(id) === msg.source.senderId)) p += pc.allowlistBonus;
    return p;
  }

  // ==========================================================================
  // Message Mode Resolution
  // ==========================================================================

  /**
   * Resolve message handling mode for any channel.
   * Channel-specific config overrides global default.
   */
  private resolveMessageMode(sessionKey: SessionKey, source: MessageSource): TelegramMessageMode {
    // Check for session-level override first
    const override = this.sessionMessageModeOverrides.get(sessionKey);
    if (override) return override;

    // Channel-specific config
    if (source.channel === "telegram") {
      return this.resolveTelegramMessageMode(sessionKey, source.accountId);
    }

    // WebChat and other channels: use global default
    return this.config.agent.messageMode ?? "steer";
  }

  // ==========================================================================
  // Message Dispatch (core pipeline)
  // ==========================================================================

  /**
   * Dispatch an inbound message to the agent pipeline.
   * Called by channel plugins and WebChat.
   */
  async dispatch(msg: InboundMessage): Promise<void> {
    // Layer 0: Deduplication
    if (this.config.queue.dedup.enabled && this.dedup.isDuplicate(msg)) {
      this.log.debug(`Dedup: skipping duplicate message from ${msg.source.senderId} on ${msg.source.channel}`);
      return;
    }

    // Hook: message_received
    await this.registry.hooks.dispatch("message_received", { message: msg });

    const { sessionKey, source } = msg;
    const session = this.sessions.get(sessionKey);
    const rpc = this.pool.getForSession(sessionKey);

    // Check if session is active (streaming) and we should handle injection/interrupt
    if (session?.isStreaming && rpc) {
      const mode = this.resolveMessageMode(sessionKey, source);

      if (mode === "interrupt") {
        // INTERRUPT MODE: abort current run + clear queue + re-dispatch
        await this.handleInterruptMode(sessionKey, rpc, msg);
        return;
      } else {
        // STEER/FOLLOW-UP MODE: inject message into active run
        const handled = await this.handleInjectionMode(sessionKey, rpc, msg, mode);
        if (handled) return;
      }
    }

    // Normal enqueue flow (no active streaming or injection failed)
    await this.enqueueMessage(msg);
  }

  /**
   * Handle interrupt mode: abort current run, clear queue, re-dispatch.
   */
  private async handleInterruptMode(
    sessionKey: SessionKey,
    rpc: RpcClient,
    msg: InboundMessage,
  ): Promise<void> {
    this.log.info(`[INTERRUPT] ${sessionKey}: Starting interrupt sequence`);

    // 1. Clear collect buffer and pending queue first
    const bufferCleared = this.queue.clearCollectBuffer(sessionKey);
    if (bufferCleared > 0) {
      this.log.info(`[INTERRUPT] ${sessionKey}: Cleared ${bufferCleared} items from collect buffer`);
    }

    // 2. Abort current RPC run
    try {
      await rpc.abort();
      this.log.info(`[INTERRUPT] ${sessionKey}: RPC abort sent`);
    } catch (err: any) {
      this.log.warn(`[INTERRUPT] ${sessionKey}: Failed to abort RPC: ${err?.message ?? String(err)}`);
    }

    // 3. Reset session state
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.isStreaming = false;
    }

    // 4. Log interrupt event
    this.transcripts.logMeta(sessionKey, "interrupt", {
      textLen: msg.text.length,
      hasImages: (msg.images?.length ?? 0) > 0,
      bufferCleared,
    });

    // 5. Re-dispatch as new message (will enqueue normally)
    this.log.info(`[INTERRUPT] ${sessionKey}: Re-dispatching message after interrupt`);
    await this.enqueueMessage(msg);
  }

  /**
   * Handle steer/follow-up mode: inject message into active run.
   */
  private async handleInjectionMode(
    sessionKey: SessionKey,
    rpc: RpcClient,
    msg: InboundMessage,
    mode: "steer" | "follow-up",
  ): Promise<boolean> {
    const rpcMode = mode === "follow-up" ? "followUp" : "steer";

    this.transcripts.logMeta(sessionKey, "inbound_injected", {
      mode,
      textLen: msg.text.length,
      hasImages: (msg.images?.length ?? 0) > 0,
    });

    try {
      await rpc.prompt(msg.text, msg.images, rpcMode);
      this.log.info(`[INJECT] ${sessionKey}: Message injected with mode=${mode}`);
      return true;
    } catch (err: any) {
      this.log.warn(`[INJECT] ${sessionKey}: Failed to inject: ${err?.message}. Falling back to enqueue.`);
      return false;
    }
  }

  /**
   * Enqueue message for normal serial processing.
   */
  private async enqueueMessage(msg: InboundMessage): Promise<void> {
    const { sessionKey } = msg;
    const item: PrioritizedWork = {
      work: async () => { await processMessage(msg, this.ctx, item); },
      priority: this.computePriority(msg),
      enqueuedAt: Date.now(),
      ttl: 0,
      source: msg.source,
      text: msg.text,
      summaryLine: msg.text.slice(0, 140) || undefined,
      images: msg.images,
      onBeforeCollectWork: async (batch) => {
        // Trigger typing from the first message's context
        const firstMsg = batch[0] as PrioritizedWork & { _msg?: InboundMessage };
        if (firstMsg._msg?.setTyping) {
          await firstMsg._msg.setTyping(true);
        }
        // Concat all images from the batch into the last item's msg
        const allImages: ImageContent[] = [];
        for (const b of batch) {
          if (b.images?.length) allImages.push(...b.images);
        }
        if (allImages.length > 0) {
          msg.images = allImages;
        }
      },
    };
    // Stash msg reference for onBeforeCollectWork to access setTyping
    (item as PrioritizedWork & { _msg?: InboundMessage })._msg = msg;
    const enqueued = this.queue.enqueue(sessionKey, item);

    if (!enqueued) {
      await msg.respond("Too many messages queued. Please wait.");
    }
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

  // ==========================================================================
  // HTTP + WebSocket Server
  // ==========================================================================

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
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "res", id: "?", ok: false, error: err?.message }));
          }
        },
      },
    });
  }

  // ==========================================================================
  // HTTP Handlers
  // ==========================================================================

  private async handleHttp(req: Request, url: URL): Promise<Response> {
    // Health endpoint (aligned with OpenClaw /health)
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        uptime: process.uptime(),
        pool: this.pool.getStats(),
        queue: this.queue.getStats(),
        sessions: this.sessions.size,
        channels: Array.from(this.registry.channels.keys()),
      });
    }

    // Metrics endpoint (JSON snapshot — pool/queue/latency/counters)
    if (url.pathname === "/api/metrics" && req.method === "GET") {
      const snapshot = this.metrics.getSnapshot();
      return new Response(JSON.stringify(snapshot, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      });
    }

    // Send message via API (used by CLI `pi-gw send`)
    if (url.pathname === "/api/send" && req.method === "POST") {
      return await this.handleApiSend(req);
    }

    // ---- Chat APIs ----

    // Sync chat: send message, wait for full reply
    if (url.pathname === "/api/chat" && req.method === "POST") {
      return await this.handleApiChat(req);
    }

    // Streaming chat: SSE stream of deltas
    if (url.pathname === "/api/chat/stream" && req.method === "POST") {
      return await this.handleApiChatStream(req);
    }

    // ---- Session APIs ----

    // Sessions list
    if (url.pathname === "/api/sessions" && req.method === "GET") {
      return await handleSessionsList(req, url, this.ctx);
    }

    // Single session detail (GET /api/sessions/agent:main:main:main)
    if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") {
      return await handleSessionDetail(req, url, this.ctx);
    }

    // Session transcript (GET /api/transcript/agent:main:main:main?last=100)
    if (url.pathname.startsWith("/api/transcript/") && req.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/api/transcript/".length));
      const lastN = parseInt(url.searchParams.get("last") ?? "100", 10);
      const entries = this.transcripts.readTranscript(key, lastN);
      return Response.json({ sessionKey: key, count: entries.length, entries });
    }

    // List all transcripts (GET /api/transcripts)
    if (url.pathname === "/api/transcripts" && req.method === "GET") {
      const sessions = this.transcripts.listSessions();
      return Response.json({ sessions });
    }

    // Reset session
    if (url.pathname === "/api/session/reset" && req.method === "POST") {
      return await handleSessionReset(req, url, this.ctx);
    }

    // Set thinking level
    if (url.pathname === "/api/session/think" && req.method === "POST") {
      return await handleSessionThink(req, url, this.ctx);
    }

    // Set model
    if (url.pathname === "/api/session/model" && req.method === "POST") {
      return await handleSessionModel(req, url, this.ctx);
    }

    // Models list
    if (url.pathname === "/api/models" && req.method === "GET") {
      return await handleModelsList(req, url, this.ctx);
    }

    // Session usage/stats
    if (url.pathname === "/api/session/usage" && req.method === "GET") {
      return await handleSessionUsage(req, url, this.ctx);
    }

    // ---- Cron API ----

    if (url.pathname.startsWith("/api/cron/")) {
      const cronResponse = handleCronApi(req, url, this.cron!, this.config);
      if (cronResponse instanceof Promise) return await cronResponse;
      if (cronResponse) return cronResponse;
    }

    // ---- Memory APIs ----

    if (url.pathname === "/api/memory/search" && req.method === "GET") {
      const role = url.searchParams.get("role") ?? "default";
      const query = url.searchParams.get("q") ?? "";
      const max = parseInt(url.searchParams.get("max") ?? "20", 10);
      if (!query) return Response.json({ error: "q parameter required" }, { status: 400 });
      const results = searchMemory(role, query, { maxResults: max });
      return Response.json({ role, query, results });
    }

    if (url.pathname === "/api/memory/stats" && req.method === "GET") {
      const role = url.searchParams.get("role") ?? "default";
      const stats = getMemoryStats(role);
      if (!stats) return Response.json({ error: "Role not found" }, { status: 404 });
      return Response.json(stats);
    }

    if (url.pathname === "/api/memory/roles" && req.method === "GET") {
      const roles = listRoles().map((r) => getRoleInfo(r)).filter(Boolean);
      return Response.json({ roles });
    }

    // OpenAI compatible API
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      return await handleOpenAiChat(req, this.ctx);
    }

    // ---- Pool API ----

    // RPC process pool details
    if (url.pathname === "/api/pool" && req.method === "GET") {
      const clients = this.pool.getAllClients();
      return Response.json({
        stats: this.pool.getStats(),
        processes: clients.map((c) => ({
          id: c.id,
          sessionKey: c.sessionKey,
          isAlive: c.isAlive,
          isIdle: c.isIdle,
          lastActivity: c.lastActivity,
        })),
      });
    }

    // Plugins list
    if (url.pathname === "/api/plugins") {
      return Response.json({
        channels: Array.from(this.registry.channels.keys()),
        tools: Array.from(this.registry.tools.keys()),
        commands: Array.from(this.registry.commands.keys()),
        hooks: this.registry.hooks.getRegistered(),
      });
    }

    // Registered gateway tools
    if (url.pathname === "/api/tools" && req.method === "GET") {
      return await handleToolsList(req, url, this.ctx);
    }

    // Invoke registered gateway tool
    if (url.pathname === "/api/tools/call" && req.method === "POST") {
      return await handleToolCall(req, url, this.ctx);
    }

    // Webhook endpoints (aligned with OpenClaw POST /hooks/*)
    const hooksBase = this.config.hooks.path ?? "/hooks";
    if (url.pathname === `${hooksBase}/wake` && req.method === "POST") {
      return await handleWebhookWake(req, this.ctx);
    }
    if (url.pathname === `${hooksBase}/event` && req.method === "POST") {
      return await handleWebhookEvent(req, this.ctx);
    }

    // Media serving via signed token (F3: WebChat images)
    if (url.pathname.startsWith("/api/media/") && req.method === "GET") {
      return handleMediaServe(url, this.config);
    }

    // Media send API (v3.3: direct delivery via channel plugins)
    if (url.pathname === "/api/media/send" && req.method === "POST") {
      return await handleMediaSendRequest(req, {
        config: this.config,
        pool: this.pool,
        registry: this.registry,
        sessions: this.sessions,
        log: this.log,
      });
    }

    // Static files for Web UI
    if (url.pathname === "/" || url.pathname.startsWith("/web/")) {
      return serveStaticFile(url.pathname, this.noGui);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleApiSend(req: Request): Promise<Response> {
    try {
      const body = await req.json() as { to?: string; message?: string };
      if (!body.to || !body.message) {
        return Response.json({ error: "Both 'to' and 'message' are required" }, { status: 400 });
      }

      // Parse "channel:target" format
      const colonIdx = body.to.indexOf(":");
      if (colonIdx === -1) {
        return Response.json({ error: "Invalid 'to' format. Use 'channel:target' (e.g. 'telegram:123456' or 'telegram:default:123456:topic:1')" }, { status: 400 });
      }

      const channel = body.to.slice(0, colonIdx);
      const target = body.to.slice(colonIdx + 1);

      const ch = this.registry.channels.get(channel);
      if (!ch) {
        return Response.json({ error: `Channel not found: ${channel}` }, { status: 404 });
      }

      await ch.outbound.sendText(target, body.message);
      return Response.json({ ok: true });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Send failed" }, { status: 500 });
    }
  }

  /**
   * POST /api/chat — Synchronous chat. Sends message, waits for full reply.
   * Curl-friendly: `curl -X POST localhost:18789/api/chat -d '{"message":"hi"}'`
   */
  private async handleApiChat(req: Request): Promise<Response> {
    try {
      const body = await req.json() as {
        message?: string;
        sessionKey?: string;
        images?: Array<{
          type: "image";
          data?: string;
          mimeType?: string;
          source?: { type: "base64"; mediaType: string; data: string };
        }>;
      };

      // Normalize images: accept both flat { data, mimeType } and nested { source: { data, mediaType } }
      const normalizedImages: import("./core/types.ts").ImageContent[] | undefined = body.images?.map((img) => {
        if (img.data && img.mimeType) {
          return { type: "image" as const, data: img.data, mimeType: img.mimeType };
        }
        if (img.source) {
          return { type: "image" as const, data: img.source.data, mimeType: img.source.mediaType };
        }
        return { type: "image" as const, data: "", mimeType: "image/png" };
      });
      if (!body.message) {
        return Response.json({ error: "message is required" }, { status: 400 });
      }

      const sessionKey = body.sessionKey ?? "agent:main:main:main";
      const startTime = Date.now();

      const role = this.sessions.get(sessionKey)?.role ?? "default";
      const profile = this.buildSessionProfile(sessionKey, role);

      // Ensure session exists
      if (!this.sessions.has(sessionKey)) {
        this.sessions.getOrCreate(sessionKey, {
          role: null,
          isStreaming: false,
          lastActivity: Date.now(),
          messageCount: 0,
          rpcProcessId: null,
        });
      }

      const session = this.sessions.get(sessionKey)!;
      session.lastActivity = Date.now();
      session.messageCount++;

      // Acquire RPC process
      const rpc = await this.pool.acquire(sessionKey, profile);
      session.rpcProcessId = rpc.id;
      session.isStreaming = true;

      // Collect response
      let fullText = "";
      const unsub = rpc.onEvent((event) => {
        // Ignore events if this RPC process has been rebound to a different session
        if (rpc.sessionKey !== sessionKey) return;

        if (event.type === "message_update") {
          const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
          if (ame?.type === "text_delta" && ame.delta) {
            fullText += ame.delta;
          }
        }
      });

      try {
        const imgCount = normalizedImages?.length ?? 0;
        this.log.info(`/api/chat: sending prompt (${body.message.length} chars, ${imgCount} images) to ${rpc.id}`);
        if (imgCount > 0) {
          this.log.info(`/api/chat: first image mimeType=${normalizedImages![0].mimeType}, data.length=${normalizedImages![0].data.length}`);
        }
        await rpc.prompt(body.message, normalizedImages);
        await rpc.waitForIdle();
      } catch (err: any) {
        fullText = `Error: ${err?.message ?? "Unknown error"}`;
      } finally {
        unsub();
        session.isStreaming = false;
      }

      return Response.json({
        ok: true,
        reply: fullText,
        sessionKey,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Chat failed" }, { status: 500 });
    }
  }

  /**
   * POST /api/chat/stream — SSE streaming chat.
   * Curl-friendly: `curl -N -X POST localhost:18789/api/chat/stream -d '{"message":"hi"}'`
   */
  private async handleApiChatStream(req: Request): Promise<Response> {
    let body: { message?: string; sessionKey?: string; images?: unknown[] };
    try {
      body = await req.json() as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.message) {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const sessionKey = body.sessionKey ?? "agent:main:main:main";
    const startTime = Date.now();

    const role = this.sessions.get(sessionKey)?.role ?? "default";
    const profile = this.buildSessionProfile(sessionKey, role);

    // Ensure session exists
    if (!this.sessions.has(sessionKey)) {
      this.sessions.getOrCreate(sessionKey, {
        role: null,
        isStreaming: false,
        lastActivity: Date.now(),
        messageCount: 0,
        rpcProcessId: null,
      });
    }

    const session = this.sessions.get(sessionKey)!;
    session.lastActivity = Date.now();
    session.messageCount++;

    const self = this;

    // SSE response via ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        };

        let fullText = "";

        let rpc: Awaited<ReturnType<typeof self.pool.acquire>>;
        try {
          rpc = await self.pool.acquire(sessionKey, profile);
        } catch (err: any) {
          send({ type: "error", error: err?.message ?? "Pool acquire failed" });
          controller.close();
          return;
        }

        session.rpcProcessId = rpc.id;
        session.isStreaming = true;

        const unsub = rpc.onEvent((event) => {
          // Ignore events if this RPC process has been rebound to a different session
          if (rpc.sessionKey !== sessionKey) return;

          if (event.type === "message_update") {
            const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
            if (ame?.type === "text_delta" && ame.delta) {
              fullText += ame.delta;
              send({ type: "delta", text: ame.delta });
            }
            // Handle thinking events
            if (ame?.type === "thinking_start") {
              send({ type: "delta", text: "\n<think>\n" });
            }
            if (ame?.type === "thinking_delta" && ame.delta) {
              send({ type: "delta", text: ame.delta });
            }
            if (ame?.type === "thinking_end") {
              send({ type: "delta", text: "\n</think>\n" });
            }
          }
          if (event.type === "tool_execution_start") {
            const label = ((event as any).args as any)?.label || (event as any).toolName;
            send({ type: "tool", name: (event as any).toolName, label });
          }
          if (event.type === "tool_execution_end") {
            send({ type: "tool_end", name: (event as any).toolName, isError: (event as any).isError });
          }
        });

        try {
          await rpc.prompt(body.message!, body.images as any);
          await rpc.waitForIdle();
        } catch (err: any) {
          send({ type: "error", error: err?.message ?? "Agent error" });
        } finally {
          unsub();
          session.isStreaming = false;
        }

        send({ type: "done", reply: fullText, duration: Date.now() - startTime });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  }

  // ==========================================================================
  // WebSocket Handlers
  // ==========================================================================

  private broadcastToWs(event: string, payload: unknown): void {
    const frame = JSON.stringify({ type: "event", event, payload });
    for (const ws of this.wsClients.values()) {
      try { ws.send(frame); } catch {}
    }
  }

  // ==========================================================================
  // Gateway Context (for sub-module injection)
  // ==========================================================================

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
      cron: this.cron,
      heartbeat: this.heartbeatExecutor,
      delegateExecutor: this.delegateExecutor,
      log: this.log,
      wsClients: this.wsClients,
      noGui: this.noGui,
      sessionMessageModeOverrides: this.sessionMessageModeOverrides,
      channelApis: this._channelApis,
      resolveTelegramMessageMode: (sk, accountId) => this.resolveTelegramMessageMode(sk, accountId),
      broadcastToWs: (event, payload) => this.broadcastToWs(event, payload),
      buildSessionProfile: (sk, role) => this.buildSessionProfile(sk, role),
      dispatch: (msg) => this.dispatch(msg),
      compactSessionWithHooks: (sk, inst) => this.compactSessionWithHooks(sk, inst),
      listAvailableRoles: () => listAvailableRoles(this.ctx),
      setSessionRole: (sk, role) => setSessionRole(this.ctx, sk, role),
      reloadConfig: () => { this.config = loadConfig(); },
    };
  }

  // ==========================================================================
  // Metrics Data Source
  // ==========================================================================

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
