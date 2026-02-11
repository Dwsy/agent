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
import { timingSafeEqual } from "node:crypto";
import { existsSync, renameSync } from "node:fs";

// Web asset embedding: populated at build time, empty in dev (falls back to filesystem)
import { WEB_ASSETS } from "./_web-assets.ts";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
};
import { loadConfig, ensureDataDir, type Config, resolveConfigPath, watchConfig } from "./core/config.ts";
import { RpcPool } from "./core/rpc-pool.ts";
import type { RpcClient } from "./core/rpc-client.ts";
import { MessageQueueManager, type PrioritizedWork } from "./core/message-queue.ts";
import { resolveSessionKey, resolveAgentId, resolveRoleForSession, getCwdForRole } from "./core/session-router.ts";
import { createLogger as createConsoleLogger, type Logger, type InboundMessage, type SessionKey, type SessionState, type WsFrame, type ImageContent, type MessageSource } from "./core/types.ts";
import { SessionStore, encodeSessionDir, getSessionDir } from "./core/session-store.ts";
import { initFileLogger, createFileLogger } from "./core/logger-file.ts";
import { CronEngine } from "./core/cron.ts";
import { TranscriptLogger } from "./core/transcript-logger.ts";
import { searchMemory, getMemoryStats, getRoleInfo, listRoles } from "./core/memory-access.ts";
import { buildCapabilityProfile } from "./core/capability-profile.ts";
import { ExtensionUIForwarder } from "./core/extension-ui-forwarder.ts";
import type { ExtensionUIResponse } from "./core/extension-ui-types.ts";
import { DeduplicationCache } from "./core/dedup-cache.ts";
import { MetricsCollector, type MetricsDataSource } from "./core/metrics.ts";
import { DelegateExecutor } from "./core/delegate-executor.ts";
import { HeartbeatExecutor } from "./core/heartbeat-executor.ts";
import { SystemEventsQueue } from "./core/system-events.ts";
import { DELEGATE_TO_AGENT_TOOL_NAME, validateDelegateParams } from "./tools/delegate-to-agent.ts";
import {
  createPluginRegistry,
  PluginLoader,
  type PluginRegistryState,
} from "./plugins/loader.ts";
import type {
  GatewayPluginApi,
  PluginManifest,
  PluginHookName,
  HookHandler,
  ChannelPlugin,
  ToolPlugin,
  BackgroundService,
  CommandHandler,
  HttpHandler,
  WsMethodHandler,
} from "./plugins/types.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Timing-safe token comparison (prevents timing attacks, aligned with OpenClaw auth.ts) */
function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** Redact sensitive fields from config for safe exposure via API */
function redactConfig(config: Config): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(config)) as Record<string, any>;

  // Gateway auth
  if (json.gateway?.auth?.token) json.gateway.auth.token = "***";
  if (json.gateway?.auth?.password) json.gateway.auth.password = "***";

  // Channel tokens
  if (json.channels?.telegram?.botToken) json.channels.telegram.botToken = "***";
  if (json.channels?.telegram?.webhookSecret) json.channels.telegram.webhookSecret = "***";
  if (json.channels?.telegram?.accounts && typeof json.channels.telegram.accounts === "object") {
    for (const account of Object.values(json.channels.telegram.accounts as Record<string, any>)) {
      if (!account || typeof account !== "object") continue;
      if (account.botToken) account.botToken = "***";
      if (account.webhookSecret) account.webhookSecret = "***";
      if (account.tokenFile) account.tokenFile = "***";
    }
  }
  if (json.channels?.discord?.token) json.channels.discord.token = "***";

  // Hooks token
  if (json.hooks?.token) json.hooks.token = "***";

  return json;
}

// ============================================================================
// Gateway Class
// ============================================================================

export interface GatewayOptions {
  configPath?: string;
  port?: number;
  verbose?: boolean;
  noGui?: boolean;
}

type TelegramMessageMode = "steer" | "follow-up" | "interrupt";

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
  private log: Logger;
  private nextClientId = 0;
  private dedup: DeduplicationCache;
  private sessionMessageModeOverrides = new Map<SessionKey, TelegramMessageMode>();
  private delegateExecutor: DelegateExecutor | null = null;
  private heartbeatExecutor: HeartbeatExecutor | null = null;
  private systemEvents = new SystemEventsQueue();
  private noGui: boolean;
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
    const loader = new PluginLoader(this.config, this.registry, (id, m) => this.createPluginApi(id, m));
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
    this.registerBuiltinCommands();

    // Start background services
    for (const service of this.registry.services) {
      try {
        await service.start(this.createPluginApi(service.name, { id: service.name, name: service.name, main: "" }));
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
      work: async () => { await this.processMessage(msg, item); },
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

  // Commands that use ctx.ui.custom() TUI and will hang in RPC mode
  private static readonly TUI_BLOCKED_COMMANDS = new Set([
    "/role info", "/role create", "/role map", "/role list",
    "/memories", "/memory-fix", "/memory-tidy", "/memory-tidy-llm",
    "/plan",
  ]);

  private buildSessionProfile(sessionKey: SessionKey, role: string) {
    const cwd = getCwdForRole(role, this.config);
    return buildCapabilityProfile({
      config: this.config,
      role,
      cwd,
      sessionKey,
    });
  }

  private parseSlashCommand(text: string): { name: string; args: string } | null {
    const trimmed = text.trim();
    const match = trimmed.match(/^\/([a-zA-Z0-9._-]+)(?:\s+([\s\S]*))?$/);
    if (!match) return null;
    return {
      name: match[1].toLowerCase(),
      args: (match[2] ?? "").trim(),
    };
  }

  private normalizeOutgoingText(value: unknown, fallback: string): string {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  }

  private async tryHandleRegisteredCommand(msg: InboundMessage, startedAt: number, rpc?: RpcClient): Promise<boolean> {
    const parsed = this.parseSlashCommand(msg.text);
    if (!parsed) {
      this.log.debug(`[SLASH-CMD] ${msg.sessionKey} not a slash command: ${msg.text.slice(0, 50)}`);
      return false;
    }

    this.log.info(`[SLASH-CMD] ${msg.sessionKey} parsed: name=${parsed.name}, args=${parsed.args}, hasRPC=${!!rpc}`);

    const registered = this.registry.commands.get(parsed.name);
    this.log.info(`[SLASH-CMD] ${msg.sessionKey} local command found: ${!!registered}, registry size=${this.registry.commands.size}`);
    
    // Gateway 本地命令优先
    if (registered) {
      this.log.info(`[SLASH-CMD] ${msg.sessionKey} executing local command /${parsed.name}`);
      const sendCommandReply = async (rawText: string) => {
        const outbound = {
          channel: msg.source.channel,
          target: msg.source.chatId,
          text: this.normalizeOutgoingText(rawText, ""),
        };

        await this.registry.hooks.dispatch("message_sending", { message: outbound });
        outbound.text = this.normalizeOutgoingText(outbound.text, "");
        await msg.respond(outbound.text);
        await this.registry.hooks.dispatch("message_sent", { message: outbound });
        this.transcripts.logResponse(msg.sessionKey, outbound.text, Date.now() - startedAt);
      };

      try {
        await registered.handler({
          sessionKey: msg.sessionKey,
          senderId: msg.source.senderId,
          channel: msg.source.channel,
          args: parsed.args,
          respond: sendCommandReply,
        });
        this.log.info(`[SLASH-CMD] ${msg.sessionKey} local command /${parsed.name} executed successfully`);
      } catch (err: any) {
        const errMsg = err?.message ?? String(err);
        this.log.error(`[SLASH-CMD] ${msg.sessionKey} local command /${parsed.name} failed: ${errMsg}`);
        await sendCommandReply(`Command /${parsed.name} failed: ${errMsg}`);
      }
      return true;
    }

    // 如果没有本地命令，但有 RPC 客户端，将斜杠命令发送给 pi 处理
    if (rpc) {
      // Strip pi_ prefix for RPC forwarding (Telegram registers as /pi_compact, pi expects /compact)
      const rpcCmdName = parsed.name.startsWith("pi_") ? parsed.name.slice(3) : parsed.name;
      const rpcText = `/${rpcCmdName}${parsed.args ? " " + parsed.args : ""}`;
      this.log.info(`[SLASH-CMD] ${msg.sessionKey} forwarding /${parsed.name} → ${rpcText} to pi RPC`);
      try {
        // 设置临时事件监听器来捕获命令响应
        let cmdResponse = "";
        let cmdEventCount = 0;
        const cmdUnsub = rpc.onEvent((event) => {
          if (rpc.sessionKey !== msg.sessionKey) return;
          cmdEventCount++;
          this.log.debug(`[SLASH-CMD-EVENT] ${msg.sessionKey} type=${(event as any).type} count=${cmdEventCount}`);
          
          // 收集文本响应
          if ((event as any).type === "message_update") {
            const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
            if (ame?.type === "text_delta" && ame.delta) {
              cmdResponse += ame.delta;
            }
          }
          // 命令结束
          if ((event as any).type === "agent_end" || (event as any).type === "message_end") {
            this.log.info(`[SLASH-CMD] ${msg.sessionKey} command completed, events=${cmdEventCount}, response=${cmdResponse.length} chars`);
          }
        });
        
        await rpc.prompt(rpcText);
        this.log.info(`[SLASH-CMD] ${msg.sessionKey} forwarded ${rpcText}, waiting for completion...`);
        
        // 等待命令完成（最多 30 秒）
        await rpc.waitForIdle(30000);
        
        // 清理监听器
        cmdUnsub();
        
        // 发送响应
        if (cmdResponse.trim()) {
          await msg.respond(cmdResponse.trim());
        } else {
          await msg.respond(`Command /${parsed.name} executed.`);
        }
        this.log.info(`[SLASH-CMD] ${msg.sessionKey} completed with ${cmdResponse.length} chars response`);
      } catch (err: any) {
        this.log.error(`[SLASH-CMD] ${msg.sessionKey} failed to execute /${parsed.name}: ${err?.message ?? String(err)}`);
        await msg.respond(`Failed to execute command: ${err?.message ?? String(err)}`);
      }
      return true;
    }

    this.log.warn(`[SLASH-CMD] ${msg.sessionKey} no RPC available for /${parsed.name}`);
    return false;
  }

  private getRegisteredToolSpecs() {
    return Array.from(this.registry.tools.values()).map((tool) => ({
      plugin: tool.name,
      description: tool.description,
      tools: tool.tools.map((def) => ({
        name: def.name,
        description: def.description,
        parameters: def.parameters ?? {},
        optional: def.optional ?? false,
      })),
    }));
  }

  private resolveToolPlugin(toolName: string): ToolPlugin | null {
    for (const plugin of this.registry.tools.values()) {
      if (plugin.tools.some((def) => def.name === toolName)) {
        return plugin;
      }
    }
    return null;
  }

  private async executeRegisteredTool(
    toolName: string,
    params: Record<string, unknown>,
    sessionKey: SessionKey,
  ) {
    // v3: Intercept delegate_to_agent tool call
    if (toolName === DELEGATE_TO_AGENT_TOOL_NAME && this.delegateExecutor) {
      const validation = validateDelegateParams(params);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: `Invalid delegation: ${validation.error}` }],
          isError: true,
        };
      }

      const result = await this.delegateExecutor.executeDelegation(sessionKey, validation.data);

      // Format result as tool response
      if (result.status === "completed") {
        return {
          content: [{ type: "text", text: result.response ?? "Task completed" }],
        };
      } else {
        return {
          content: [{ type: "text", text: result.error ?? `Delegation ${result.status}` }],
          isError: true,
        };
      }
    }

    const plugin = this.resolveToolPlugin(toolName);
    if (!plugin) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const beforePayload = {
      sessionKey,
      toolName,
      args: { ...params },
    };
    await this.registry.hooks.dispatch("before_tool_call", beforePayload);

    const toolLogger = this.config.logging.file
      ? createFileLogger(`tool:${toolName}`)
      : createConsoleLogger(`tool:${toolName}`);

    try {
      const result = await plugin.execute(toolName, beforePayload.args, {
        sessionKey,
        logger: toolLogger,
      });

      const afterPayload = {
        sessionKey,
        toolName,
        result,
        isError: Boolean(result?.isError),
      };
      await this.registry.hooks.dispatch("after_tool_call", afterPayload);

      const persistPayload = {
        sessionKey,
        toolName,
        result: afterPayload.result,
      };
      await this.registry.hooks.dispatch("tool_result_persist", persistPayload);

      return persistPayload.result;
    } catch (err: any) {
      const errorResult = {
        content: [{ type: "text", text: `Tool error: ${err?.message ?? String(err)}` }],
        isError: true,
      };
      await this.registry.hooks.dispatch("after_tool_call", {
        sessionKey,
        toolName,
        result: errorResult,
        isError: true,
      });
      throw err;
    }
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

  private async processMessage(msg: InboundMessage, queueItem?: PrioritizedWork): Promise<void> {
    // If collect mode merged multiple messages, use the merged text
    const effectiveText = queueItem?.collectMergedText ?? msg.text;
    const { sessionKey, images, respond, setTyping, source } = msg;
    const text = effectiveText;
    const startTime = Date.now();

    // Transcript: log inbound prompt
    this.transcripts.logPrompt(sessionKey, text, images?.length ?? 0);
    this.transcripts.logMeta(sessionKey, "process_start", {
      source: { channel: source.channel, chatType: source.chatType, chatId: source.chatId },
    });

    // Guard: intercept pi extension commands that use TUI (would hang in RPC mode)
    const trimmedCmd = text.trim().toLowerCase();
    for (const blocked of Gateway.TUI_BLOCKED_COMMANDS) {
      if (trimmedCmd === blocked || trimmedCmd.startsWith(blocked + " ")) {
        const reply = `Command "${text.trim()}" requires interactive TUI and is not available in gateway mode. Use the pi CLI directly for this command.`;
        this.transcripts.logResponse(sessionKey, reply, Date.now() - startTime);
        await respond(reply);
        return;
      }
    }

    // Hook: session_start (if new session)
    const isNew = !this.sessions.has(sessionKey);
    const session = this.sessions.getOrCreate(sessionKey, {
      role: resolveRoleForSession(source, this.config),
      isStreaming: false,
      lastActivity: Date.now(),
      messageCount: 0,
      rpcProcessId: null,
    });
    if (isNew) {
      this.transcripts.logMeta(sessionKey, "session_created", { role: session.role });
      await this.registry.hooks.dispatch("session_start", { sessionKey });
    }
    session.lastActivity = Date.now();
    session.messageCount++;

    // Resolve role → capability profile for RPC process
    const role = session.role ?? "default";
    const profile = this.buildSessionProfile(sessionKey, role);

    // Acquire RPC process
    let rpc;
    try {
      rpc = await this.pool.acquire(sessionKey, profile);
    } catch (err: any) {
      const errMsg = `Failed to acquire RPC process: ${err?.message ?? String(err)}`;
      this.log.error(errMsg);
      this.transcripts.logError(sessionKey, errMsg);
      await respond(`Error: ${errMsg}`);
      return;
    }
    session.rpcProcessId = rpc.id;
    session.isStreaming = true;

    // Wire Extension UI forwarding to WebChat clients
    rpc.extensionUIHandler = (data, writeToRpc) =>
      this.extensionUI.forward(data, this.wsClients, writeToRpc);
    this.transcripts.logMeta(sessionKey, "rpc_acquired", {
      rpcId: rpc.id,
      cwd: profile.cwd,
      role: profile.role,
      signature: profile.signature.slice(0, 12),
      capabilities: profile.resourceCounts,
    });

    // Typing indicator
    await setTyping(true);

    // Plugin slash commands bypass LLM (forward to pi RPC if not handled locally)
    if (await this.tryHandleRegisteredCommand(msg, startTime, rpc)) {
      return;
    }

    // Collect response
    let fullText = "";
    let thinkingText = "";
    let toolLabels: string[] = [];
    let agentEndMessages: unknown[] = [];
    let agentEndStopReason = "stop";
    let eventCount = 0;

    const unsub = rpc.onEvent((event) => {
      // Ignore events if this RPC process has been rebound to a different session
      if (rpc.sessionKey !== sessionKey) return;

      eventCount++;

      // Log every RPC event received
      this.log.info(`[RPC-EVENT] ${sessionKey} type=${(event as any).type} eventCount=${eventCount}`);
      this.log.debug(`[RPC-EVENT] ${sessionKey} full event: ${JSON.stringify(event).slice(0, 1000)}`);

      // Transcript: log every agent event
      this.transcripts.logEvent(sessionKey, event as Record<string, unknown>);

      // Helper: extract partial text exactly like dev branch
      const extractPartialText = (partial: unknown): { text?: string; thinking?: string } => {
        this.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText input: ${JSON.stringify(partial).slice(0, 500)}`);
        if (!partial || typeof partial !== 'object') {
          this.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText: no partial or not object`);
          return {}
        }
        const record = partial as Record<string, unknown>
        let content = record.content
        if (!Array.isArray(content) && record.message && typeof record.message === 'object') {
          const message = record.message as Record<string, unknown>
          if (Array.isArray(message.content)) {
            content = message.content
          }
        }
        let text: string | undefined
        let thinking: string | undefined
        if (Array.isArray(content)) {
          for (const part of content) {
            if (!part || typeof part !== 'object') continue
            const p = part as Record<string, unknown>
            const partType = typeof p.type === 'string' ? p.type : ''
            if (partType === 'text' && typeof p.text === 'string') {
              text = p.text
            }
            if (partType === 'thinking' && typeof p.thinking === 'string') {
              thinking = p.thinking
            }
          }
        } else {
          if (typeof record.text === 'string') {
            text = record.text
          }
          if (typeof record.thinking === 'string') {
            thinking = record.thinking
          }
        }
        this.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText result: text=${text?.length ?? 0} chars, thinking=${thinking?.length ?? 0} chars`);
        return { text, thinking }
      }

      // Stream text and thinking deltas - aligned with dev branch usePiRPC
      if (event.type === "message_update") {
        const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
        this.log.debug(`[RPC-EVENT] ${sessionKey} message_update ame.type=${ame?.type} ame.delta=${ame?.delta?.length ?? 0} chars`);
        this.log.debug(`[RPC-EVENT] ${sessionKey} ame.full: ${JSON.stringify(ame).slice(0, 800)}`);
        
        const partial = extractPartialText(ame?.partial);
        this.log.debug(`[RPC-EVENT] ${sessionKey} partial extracted: text=${partial.text?.length ?? 0} chars, thinking=${partial.thinking?.length ?? 0} chars`);

        const beforeFullText = fullText;
        switch (ame?.type) {
          case 'text_delta':
            if (ame.delta) {
              fullText += ame.delta;
              this.log.debug(`[RPC-EVENT] ${sessionKey} text_delta: added ${ame.delta.length} chars, total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, ame.delta);
            } else if (partial.text) {
              fullText = partial.text;
              this.log.debug(`[RPC-EVENT] ${sessionKey} text_delta (from partial): total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, partial.text);
            } else {
              this.log.warn(`[RPC-EVENT] ${sessionKey} text_delta: no delta and no partial.text`);
            }
            break;
          case 'text_start':
            fullText = '';
            if (partial.text) {
              fullText = partial.text;
              this.log.info(`[RPC-EVENT] ${sessionKey} text_start: total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, partial.text);
            } else {
              this.log.info(`[RPC-EVENT] ${sessionKey} text_start: empty`);
            }
            break;
          case 'text_end':
            if (ame.content) {
              const content = Array.isArray(ame.content)
                ? ame.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
                : String(ame.content);
              fullText = content;
              this.log.info(`[RPC-EVENT] ${sessionKey} text_end: total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, content);
            } else if (partial.text) {
              fullText = partial.text;
              this.log.info(`[RPC-EVENT] ${sessionKey} text_end (from partial): total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, partial.text);
            } else {
              this.log.warn(`[RPC-EVENT] ${sessionKey} text_end: no content and no partial.text`);
            }
            break;
          case 'thinking_delta': {
            const thinkDelta = ame.delta || ame.thinking || '';
            if (thinkDelta) {
              thinkingText += thinkDelta;
              msg.onThinkingDelta?.(thinkingText, thinkDelta);
            }
            this.log.debug(`[RPC-EVENT] ${sessionKey} thinking_delta: ${thinkDelta.length} chars`);
            break;
          }
          case 'thinking_start':
            thinkingText = '';
            this.log.info(`[RPC-EVENT] ${sessionKey} thinking_start`);
            break;
          case 'thinking_end':
            this.log.info(`[RPC-EVENT] ${sessionKey} thinking_end (${thinkingText.length} chars total)`);
            break;
          case 'start':
            if (partial.text) {
              fullText = partial.text;
              this.log.info(`[RPC-EVENT] ${sessionKey} start (text): total=${fullText.length}`);
              msg.onStreamDelta?.(fullText, partial.text);
            }
            // Ignore partial.thinking - don't render it
            break;
          default:
            this.log.warn(`[RPC-EVENT] ${sessionKey} unhandled ame.type: ${ame?.type}`);
        }
        this.log.debug(`[RPC-EVENT] ${sessionKey} fullText changed: ${beforeFullText.length} -> ${fullText.length} chars`);
      }

      // Tool execution labels
      if (event.type === "tool_execution_start") {
        const eventAny = event as any;
        this.log.info(`[RPC-EVENT] ${sessionKey} tool_execution_start: ${eventAny.toolName}`);
        const label = (eventAny.args as any)?.label || eventAny.toolName;
        if (label) toolLabels.push(label);
        msg.onToolStart?.(eventAny.toolName, eventAny.args, eventAny.toolCallId);
      }

      // Capture agent_end data for hooks
      if (event.type === "agent_end") {
        this.log.info(`[RPC-EVENT] ${sessionKey} agent_end`);
        agentEndMessages = (event as any).messages ?? [];
      }

      // Capture stop reason from message_end
      if (event.type === "message_end") {
        const msgEnd = event as any;
        this.log.info(`[RPC-EVENT] ${sessionKey} message_end: role=${msgEnd.message?.role}, stopReason=${msgEnd.message?.stopReason}`);
        if (msgEnd.message?.role === "assistant" && msgEnd.message?.stopReason) {
          agentEndStopReason = msgEnd.message.stopReason;
        }
      }

      // Broadcast to WebSocket clients observing this session
      this.broadcastToWs("agent", { sessionKey, ...event });
    });

    // Timeout protection (aligned with OpenClaw abortTimer)
    const timeoutMs = this.config.agent.timeoutMs ?? 120_000;
    let abortAttempted = false;
    const abortTimer = setTimeout(() => {
      this.log.warn(`Agent timeout for ${sessionKey} (${timeoutMs}ms), aborting`);
      this.transcripts.logError(sessionKey, `Agent timeout after ${timeoutMs}ms`, { eventCount, textLen: fullText.length });
      this.metrics?.incRpcTimeout();
      abortAttempted = true;
      rpc.abort().catch(() => {});
      // If abort doesn't unstick within 5s (e.g. TUI hang), force-kill the process
      setTimeout(() => {
        if (session.isStreaming) {
          this.log.warn(`Force-killing hung RPC process ${rpc.id} for ${sessionKey}`);
          this.transcripts.logError(sessionKey, `Force-killing hung RPC process ${rpc.id}`);
          rpc.stop().catch(() => {});
          this.pool.release(sessionKey);
        }
      }, 5000);
    }, timeoutMs);

    try {
      // Hook: before_agent_start
      const beforeAgentPayload = { sessionKey, message: text };
      await this.registry.hooks.dispatch("before_agent_start", beforeAgentPayload);
      const promptText = this.normalizeOutgoingText(beforeAgentPayload.message, text);

      // Send prompt to pi agent
      this.log.info(`[processMessage] Sending prompt to ${rpc.id} for ${sessionKey}: "${promptText.slice(0, 80)}"`);
      await rpc.prompt(promptText, images);
      await rpc.waitForIdle(timeoutMs);

      // Hook: agent_end with real messages from the RPC event stream
      await this.registry.hooks.dispatch("agent_end", {
        sessionKey,
        messages: agentEndMessages,
        stopReason: agentEndStopReason,
      });
    } catch (err: any) {
      const errMsg = err?.message ?? "Unknown error";
      fullText = typeof fullText === 'string' && fullText.trim() ? fullText : `Error: ${errMsg}`;
      this.log.error(`Agent error for ${sessionKey}: ${errMsg}`);
      this.transcripts.logError(sessionKey, errMsg, { eventCount, abortAttempted, textLen: fullText.length });
    } finally {
      clearTimeout(abortTimer);
      unsub();
      session.isStreaming = false;
      await setTyping(false);
    }

    this.log.info(`[RPC-EVENT] ${sessionKey} Final fullText: ${fullText.length} chars, eventCount=${eventCount}`);
    this.log.debug(`[RPC-EVENT] ${sessionKey} Final fullText content: ${fullText.slice(0, 500)}`);

    // Hook: message_sending
    if (!fullText.trim()) {
      this.log.warn(`Empty assistant response for ${sessionKey}; sending fallback text.`);
      fullText = "我这次没有生成可发送的文本，请再发一次或换个问法。";
    }

    const outbound = { channel: source.channel, target: source.chatId, text: fullText };
    await this.registry.hooks.dispatch("message_sending", { message: outbound });
    outbound.text = this.normalizeOutgoingText(outbound.text, fullText);

    // Transcript: log final response (after message_sending mutations)
    const durationMs = Date.now() - startTime;
    this.transcripts.logResponse(sessionKey, outbound.text, durationMs);
    this.transcripts.logMeta(sessionKey, "process_end", {
      durationMs,
      eventCount,
      textLength: outbound.text.length,
      toolCount: toolLabels.length,
      tools: toolLabels,
      abortAttempted,
    });

    // Metrics: record message processed and latency
    this.metrics?.incMessageProcessed();
    this.metrics?.recordLatency(durationMs);

    // Send response
    await respond(outbound.text);

    // Hook: message_sent
    await this.registry.hooks.dispatch("message_sent", { message: outbound });
  }

  // ==========================================================================
  // HTTP + WebSocket Server
  // ==========================================================================

  private startServer(): void {
    const self = this;

    this.server = Bun.serve<WsClientData>({
      port: this.config.gateway.port,
      hostname: this.config.gateway.bind === "loopback" ? "127.0.0.1" : "0.0.0.0",

      async fetch(req, server) {
        const url = new URL(req.url);

        // Auth check (skip for static assets and health)
        const authMode = self.config.gateway.auth.mode;
        if (authMode === "token" && url.pathname !== "/health" && !url.pathname.startsWith("/web/") && url.pathname !== "/") {
          const token = self.config.gateway.auth.token;
          if (token) {
            const provided = req.headers.get("authorization")?.replace("Bearer ", "")
              ?? url.searchParams.get("token");
            if (!provided || !safeTokenCompare(provided, token)) {
              return new Response("Unauthorized", { status: 401 });
            }
          }
        }

        // WebSocket upgrade — Bun requires returning `undefined` on success
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const clientId = `ws-${++self.nextClientId}`;
          self.log.debug(`WS upgrade request from ${clientId}`);
          // WS auth: token in query param for browser WebSocket
          if (authMode === "token" && self.config.gateway.auth.token) {
            const wsToken = url.searchParams.get("token");
            if (!wsToken || !safeTokenCompare(wsToken, self.config.gateway.auth.token)) {
              return new Response("Unauthorized", { status: 401 });
            }
          }
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
            await self.handleWsFrame(ws, frame);
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
      return Response.json(this.sessions.toArray());
    }

    // Single session detail (GET /api/sessions/agent:main:main:main)
    if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/api/sessions/".length));
      const session = this.sessions.get(key);
      if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
      return Response.json(session);
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
      return await this.handleApiSessionReset(req);
    }

    // Set thinking level
    if (url.pathname === "/api/session/think" && req.method === "POST") {
      return await this.handleApiSessionThink(req);
    }

    // Set model
    if (url.pathname === "/api/session/model" && req.method === "POST") {
      return await this.handleApiSessionModel(req);
    }

    // Models list
    if (url.pathname === "/api/models" && req.method === "GET") {
      return await this.handleApiModels(url);
    }

    // Session usage/stats
    if (url.pathname === "/api/session/usage" && req.method === "GET") {
      return await this.handleApiUsage(url);
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
      return await this.handleOpenAiChat(req);
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
      return Response.json({ tools: this.getRegisteredToolSpecs() });
    }

    // Invoke registered gateway tool
    if (url.pathname === "/api/tools/call" && req.method === "POST") {
      return await this.handleApiToolCall(req);
    }

    // Webhook endpoints (aligned with OpenClaw POST /hooks/*)
    const hooksBase = this.config.hooks.path ?? "/hooks";
    if (url.pathname === `${hooksBase}/wake` && req.method === "POST") {
      return await this.handleWebhookWake(req);
    }
    if (url.pathname === `${hooksBase}/event` && req.method === "POST") {
      return await this.handleWebhookEvent(req);
    }

    // Static files for Web UI
    if (url.pathname === "/" || url.pathname.startsWith("/web/")) {
      return this.serveStaticFile(url.pathname);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleWebhookWake(req: Request): Promise<Response> {
    if (!this.config.hooks.enabled) {
      return new Response("Webhooks disabled", { status: 403 });
    }

    // Token auth
    if (this.config.hooks.token) {
      const auth = req.headers.get("authorization")?.replace("Bearer ", "");
      if (!auth || !safeTokenCompare(auth, this.config.hooks.token)) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    try {
      const body = await req.json() as { text?: string; sessionKey?: string; mode?: "now" | "next-heartbeat" };
      if (!body.text) {
        return Response.json({ error: "text is required" }, { status: 400 });
      }

      const sessionKey = body.sessionKey ?? "agent:main:main:main";
      const webhookItem: PrioritizedWork = {
        work: async () => {
          const role = this.sessions.get(sessionKey)?.role ?? "default";
          const profile = this.buildSessionProfile(sessionKey, role);
          const rpc = await this.pool.acquire(sessionKey, profile);
          await rpc.prompt(`[WEBHOOK] ${body.text}`);
          await rpc.waitForIdle();
        },
        priority: this.config.queue.priority.webhook,
        enqueuedAt: Date.now(),
        ttl: 30000,
        text: body.text,
        summaryLine: `[WEBHOOK] ${body.text.slice(0, 120)}`,
      };
      const enqueued = this.queue.enqueue(sessionKey, webhookItem);

      if (!enqueued) {
        return Response.json({ error: "Queue full", sessionKey }, { status: 429 });
      }

      return Response.json({ ok: true, sessionKey });
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  private async handleWebhookEvent(req: Request): Promise<Response> {
    if (!this.config.hooks.enabled) {
      return new Response("Webhooks disabled", { status: 403 });
    }

    if (this.config.hooks.token) {
      const auth = req.headers.get("authorization")?.replace("Bearer ", "");
      if (!auth || !safeTokenCompare(auth, this.config.hooks.token)) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    try {
      const body = await req.json() as { event: string; payload?: unknown };
      if (!body.event) {
        return Response.json({ error: "event is required" }, { status: 400 });
      }

      // Broadcast to all WS clients as a custom event
      this.broadcastToWs(`hook:${body.event}`, body.payload ?? {});

      return Response.json({ ok: true, event: body.event });
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
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

  private async handleApiToolCall(req: Request): Promise<Response> {
    try {
      const body = await req.json() as {
        tool?: string;
        toolName?: string;
        params?: Record<string, unknown>;
        sessionKey?: string;
      };

      const toolName = (body.toolName ?? body.tool ?? "").trim();
      if (!toolName) {
        return Response.json({ error: "toolName is required" }, { status: 400 });
      }

      const sessionKey = body.sessionKey ?? "agent:main:main:main";
      const params = body.params && typeof body.params === "object" ? body.params : {};
      const result = await this.executeRegisteredTool(toolName, params, sessionKey);
      return Response.json({ ok: true, toolName, sessionKey, result });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Tool call failed" }, { status: 500 });
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

  /**
   * POST /api/session/reset — Reset a session.
   */
  private async handleApiSessionReset(req: Request): Promise<Response> {
    try {
      const body = await req.json() as { sessionKey?: string };
      const sessionKey = body.sessionKey ?? "agent:main:main:main";

      const rpc = this.pool.getForSession(sessionKey);
      if (rpc) {
        await rpc.newSession();
      }

      const session = this.sessions.get(sessionKey);
      if (session) {
        session.messageCount = 0;
        session.lastActivity = Date.now();
        this.sessions.touch(sessionKey);
      }

      return Response.json({ ok: true, sessionKey });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Reset failed" }, { status: 500 });
    }
  }

  /**
   * POST /api/session/think — Set thinking level for a session.
   * Aligned with OpenClaw /think command.
   */
  private async handleApiSessionThink(req: Request): Promise<Response> {
    try {
      const body = await req.json() as { sessionKey?: string; level?: string };
      const sessionKey = body.sessionKey ?? "agent:main:main:main";
      const level = body.level ?? "medium";

      const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      if (!validLevels.includes(level)) {
        return Response.json({ error: `Invalid level. Use: ${validLevels.join(", ")}` }, { status: 400 });
      }

      const rpc = this.pool.getForSession(sessionKey);
      if (!rpc) {
        return Response.json({ error: "No active RPC process for this session" }, { status: 404 });
      }

      await rpc.setThinkingLevel(level);
      return Response.json({ ok: true, sessionKey, level });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Failed" }, { status: 500 });
    }
  }

  /**
   * POST /api/session/model — Set model for a session.
   * Aligned with OpenClaw /model command.
   */
  private async handleApiSessionModel(req: Request): Promise<Response> {
    try {
      const body = await req.json() as { sessionKey?: string; provider?: string; modelId?: string; model?: string };
      const sessionKey = body.sessionKey ?? "agent:main:main:main";

      let provider = body.provider;
      let modelId = body.modelId;

      // Support "provider/modelId" shorthand
      if (body.model && body.model.includes("/")) {
        const idx = body.model.indexOf("/");
        provider = body.model.slice(0, idx);
        modelId = body.model.slice(idx + 1);
      }

      if (!provider || !modelId) {
        return Response.json({ error: "Provide 'model' as 'provider/modelId' or separate 'provider' + 'modelId'" }, { status: 400 });
      }

      const rpc = this.pool.getForSession(sessionKey);
      if (!rpc) {
        return Response.json({ error: "No active RPC process for this session" }, { status: 404 });
      }

      await rpc.setModel(provider, modelId);
      return Response.json({ ok: true, sessionKey, provider, modelId });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? "Failed" }, { status: 500 });
    }
  }

  /** GET /api/models — list available models from RPC */
  private async handleApiModels(url: URL): Promise<Response> {
    const sessionKey = url.searchParams.get("sessionKey") ?? "agent:main:main:main";
    const rpc = this.pool.getForSession(sessionKey);
    if (!rpc) {
      return Response.json({ error: "No active session. Send a message first." }, { status: 404 });
    }
    try {
      const models = await rpc.getAvailableModels();
      return Response.json({ models });
    } catch (err: any) {
      return Response.json({ error: err?.message }, { status: 500 });
    }
  }

  /** GET /api/session/usage — token usage stats from RPC */
  private async handleApiUsage(url: URL): Promise<Response> {
    const sessionKey = url.searchParams.get("sessionKey") ?? "agent:main:main:main";
    const rpc = this.pool.getForSession(sessionKey);
    if (!rpc) {
      return Response.json({ error: "No active session" }, { status: 404 });
    }
    try {
      const stats = await rpc.getSessionStats();
      return Response.json({ sessionKey, stats });
    } catch (err: any) {
      return Response.json({ error: err?.message }, { status: 500 });
    }
  }

  /**
   * POST /v1/chat/completions — OpenAI compatible API.
   * Lets any OpenAI SDK client (Python openai, curl, ChatBox, etc.) connect directly.
   */
  private async handleOpenAiChat(req: Request): Promise<Response> {
    try {
      const body = await req.json() as {
        model?: string;
        messages?: Array<{ role: string; content: string }>;
        stream?: boolean;
      };

      if (!body.messages || body.messages.length === 0) {
        return Response.json({ error: { message: "messages is required", type: "invalid_request_error" } }, { status: 400 });
      }

      // Extract the last user message as the prompt
      const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
      const prompt = lastUser?.content ?? "";
      if (!prompt) {
        return Response.json({ error: { message: "No user message found", type: "invalid_request_error" } }, { status: 400 });
      }

      const sessionKey = "agent:main:main:main";
      const role = this.sessions.get(sessionKey)?.role ?? "default";
      const profile = this.buildSessionProfile(sessionKey, role);

      if (!this.sessions.has(sessionKey)) {
        this.sessions.getOrCreate(sessionKey, {
          role: null, isStreaming: false, lastActivity: Date.now(), messageCount: 0, rpcProcessId: null,
        });
      }

      const session = this.sessions.get(sessionKey)!;
      session.lastActivity = Date.now();
      session.messageCount++;

      const rpc = await this.pool.acquire(sessionKey, profile);
      session.rpcProcessId = rpc.id;

      const modelName = body.model ?? this.config.agent.model ?? "pi-gateway";
      const requestId = `chatcmpl-${Date.now()}`;

      if (body.stream) {
        // SSE streaming in OpenAI format
        session.isStreaming = true;
        const self = this;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) => {
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            };

            let fullText = "";
            const unsub = rpc.onEvent((event) => {
              // Ignore events if this RPC process has been rebound to a different session
              if (rpc.sessionKey !== sessionKey) return;

              if (event.type === "message_update") {
                const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
                if (ame?.type === "text_delta" && ame.delta) {
                  fullText += ame.delta;
                  send({
                    id: requestId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelName,
                    choices: [{ index: 0, delta: { content: ame.delta }, finish_reason: null }],
                  });
                }
                // Handle thinking events
                if (ame?.type === "thinking_start") {
                  send({
                    id: requestId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelName,
                    choices: [{ index: 0, delta: { content: "\n<think>\n" }, finish_reason: null }],
                  });
                }
                if (ame?.type === "thinking_delta" && ame.delta) {
                  send({
                    id: requestId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelName,
                    choices: [{ index: 0, delta: { content: ame.delta }, finish_reason: null }],
                  });
                }
                if (ame?.type === "thinking_end") {
                  send({
                    id: requestId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelName,
                    choices: [{ index: 0, delta: { content: "\n</think>\n" }, finish_reason: null }],
                  });
                }
              }
            });

            try {
              await rpc.prompt(prompt);
              await rpc.waitForIdle(self.config.agent.timeoutMs ?? 120_000);
            } catch {}

            unsub();
            session.isStreaming = false;

            send({
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
            controller.enqueue("data: [DONE]\n\n");
            controller.close();
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
        });
      }

      // Non-streaming: wait for full reply
      session.isStreaming = true;
      let fullText = "";
      const startTime = Date.now();
      const unsub = rpc.onEvent((event) => {
        if (event.type === "message_update") {
          const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
          if (ame?.type === "text_delta" && ame.delta) fullText += ame.delta;
        }
      });

      try {
        await rpc.prompt(prompt);
        await rpc.waitForIdle(this.config.agent.timeoutMs ?? 120_000);
      } catch {} finally {
        unsub();
        session.isStreaming = false;
      }

      return Response.json({
        id: requestId,
        object: "chat.completion",
        created: Math.floor(startTime / 1000),
        model: modelName,
        choices: [{
          index: 0,
          message: { role: "assistant", content: fullText },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } catch (err: any) {
      return Response.json({ error: { message: err?.message ?? "Internal error", type: "server_error" } }, { status: 500 });
    }
  }

  private serveStaticFile(pathname: string): Response {
    if (this.noGui) {
      return Response.json({ error: "Web UI disabled (--no-gui mode)" }, { status: 404 });
    }

    let filename: string;
    if (pathname === "/" || pathname === "/index.html") {
      filename = "index.html";
    } else if (pathname.startsWith("/web/")) {
      filename = pathname.slice(5);
    } else {
      return new Response("Not Found", { status: 404 });
    }

    const ext = filename.split(".").pop() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    // Compiled binary: serve from embedded assets
    const embedded = WEB_ASSETS[filename];
    if (embedded) {
      return new Response(embedded, {
        headers: { "content-type": contentType, "cache-control": "no-cache" },
      });
    }

    // Dev mode fallback: serve from filesystem
    const webDir = new URL("./web", import.meta.url).pathname;
    const file = Bun.file(`${webDir}/${filename}`);
    if (!file.size) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file, {
      headers: { "content-type": contentType, "cache-control": "no-cache" },
    });
  }

  // ==========================================================================
  // WebSocket Handlers
  // ==========================================================================

  private async handleWsFrame(ws: ServerWebSocket<WsClientData>, frame: WsFrame): Promise<void> {
    if (frame.type !== "req") return;

    const { id, method, params } = frame;
    const respond = (ok: boolean, payload?: unknown, error?: string) => {
      ws.send(JSON.stringify({ type: "res", id, ok, payload, error }));
    };

    try {
      // Plugin-registered gateway methods
      const pluginMethod = this.registry.gatewayMethods.get(method);
      if (pluginMethod) {
        const result = await pluginMethod.handler(params ?? {}, { clientId: ws.data.clientId });
        respond(true, result);
        return;
      }

      // Built-in methods (aligned with OpenClaw)
      switch (method) {
        case "extension_ui_response": {
          const uiResponse: ExtensionUIResponse = {
            type: "extension_ui_response",
            id: (params?.id as string) ?? "",
            value: params?.value as string | string[] | undefined,
            confirmed: params?.confirmed as boolean | undefined,
            cancelled: params?.cancelled as boolean | undefined,
            timestamp: Date.now(),
          };
          const handled = this.extensionUI.handleResponse(uiResponse, this.wsClients, ws.data.clientId);
          respond(handled);
          break;
        }

        case "connect": {
          // Validate token in connect params if auth is enabled
          const authMode = this.config.gateway.auth.mode;
          if (authMode === "token" && this.config.gateway.auth.token) {
            const connectToken = (params?.auth as any)?.token ?? params?.token;
            if (!connectToken || !safeTokenCompare(connectToken, this.config.gateway.auth.token)) {
              respond(false, undefined, "Invalid auth token");
              ws.close(4001, "Unauthorized");
              return;
            }
          }
          respond(true, {
            protocol: 1,
            server: { name: "pi-gateway", version: "0.2.0" },
          });
          break;
        }

        case "health":
          respond(true, {
            pool: this.pool.getStats(),
            queue: this.queue.getStats(),
            sessions: this.sessions.size,
          });
          break;

        case "chat.send": {
          const text = (params?.text as string) ?? "";
          const role = (params?.role as string) ?? undefined;
          const sessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
          const images = Array.isArray(params?.images) ? params.images as ImageContent[] : undefined;

          await this.dispatch({
            source: { channel: "webchat", chatType: "dm", chatId: "default", senderId: ws.data.clientId },
            sessionKey,
            text,
            images,
            respond: async (reply) => {
              ws.send(JSON.stringify({ type: "event", event: "chat.reply", payload: { text: reply, sessionKey } }));
            },
            setTyping: async (typing) => {
              ws.send(JSON.stringify({ type: "event", event: "chat.typing", payload: { typing, sessionKey } }));
            },
          });

          respond(true);
          break;
        }

        case "chat.abort": {
          const sessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
          const rpc = this.pool.getForSession(sessionKey);
          if (rpc) await rpc.abort();
          respond(true);
          break;
        }

        case "chat.history": {
          const hSessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
          const hRpc = this.pool.getForSession(hSessionKey);
          if (hRpc) {
            try {
              const messages = await hRpc.getMessages();
              respond(true, { messages });
            } catch (err: any) {
              respond(false, undefined, err?.message);
            }
          } else {
            respond(true, { messages: [] });
          }
          break;
        }

        case "sessions.list":
          respond(true, this.sessions.toArray());
          break;

        case "sessions.get": {
          const sKey = params?.sessionKey as string;
          if (!sKey) {
            respond(false, undefined, "sessionKey is required");
            break;
          }
          const state = this.sessions.get(sKey);
          respond(state ? true : false, state ?? undefined, state ? undefined : "Session not found");
          break;
        }

        case "config.get":
          respond(true, redactConfig(this.config));
          break;

        case "config.reload": {
          try {
            this.config = loadConfig();
            respond(true, { ok: true });
          } catch (err: any) {
            respond(false, undefined, err?.message);
          }
          break;
        }

        case "models.list": {
          const mSessionKey = (params?.sessionKey as string) ?? "agent:main:main:main";
          const mRpc = this.pool.getForSession(mSessionKey);
          if (mRpc) {
            try {
              const models = await mRpc.getAvailableModels();
              respond(true, { models });
            } catch (err: any) {
              respond(false, undefined, err?.message);
            }
          } else {
            respond(false, undefined, "No active session");
          }
          break;
        }

        case "usage.status": {
          const uSessionKey = (params?.sessionKey as string) ?? "agent:main:main:main";
          const uRpc = this.pool.getForSession(uSessionKey);
          if (uRpc) {
            try {
              const stats = await uRpc.getSessionStats();
              respond(true, { sessionKey: uSessionKey, stats });
            } catch (err: any) {
              respond(false, undefined, err?.message);
            }
          } else {
            respond(false, undefined, "No active session");
          }
          break;
        }

        case "sessions.compact": {
          const cKey = (params?.sessionKey as string);
          if (!cKey) { respond(false, undefined, "sessionKey required"); break; }
          try {
            await this.compactSessionWithHooks(cKey, params?.instructions as string);
            respond(true, { ok: true });
          } catch (err: any) {
            respond(false, undefined, err?.message ?? "Compaction failed");
          }
          break;
        }

        case "sessions.delete": {
          const dKey = (params?.sessionKey as string);
          if (!dKey) { respond(false, undefined, "sessionKey required"); break; }
          await this.registry.hooks.dispatch("session_end", { sessionKey: dKey });
          this.pool.release(dKey);
          this.sessionMessageModeOverrides.delete(dKey);
          this.sessions.delete(dKey);
          respond(true, { ok: true });
          break;
        }

        case "session.listRoles": {
          respond(true, { roles: this.listAvailableRoles() });
          break;
        }

        case "session.setRole": {
          const srSessionKey = (params?.sessionKey as string);
          const srRole = (params?.role as string);
          if (!srSessionKey) { respond(false, undefined, "sessionKey required"); break; }
          if (!srRole) { respond(false, undefined, "role required"); break; }
          try {
            const changed = await this.setSessionRole(srSessionKey, srRole);
            respond(true, { changed, role: srRole });
          } catch (err: any) {
            respond(false, undefined, err?.message ?? "Failed to set role");
          }
          break;
        }

        case "memory.search": {
          const mRole = (params?.role as string) ?? "default";
          const mQuery = (params?.query as string) ?? "";
          const mMax = (params?.maxResults as number) ?? 20;
          if (!mQuery) { respond(false, undefined, "query is required"); break; }
          respond(true, { role: mRole, results: searchMemory(mRole, mQuery, { maxResults: mMax }) });
          break;
        }

        case "memory.stats": {
          const sRole = (params?.role as string) ?? "default";
          const sStats = getMemoryStats(sRole);
          if (sStats) {
            respond(true, sStats);
          } else {
            respond(false, undefined, "Role not found");
          }
          break;
        }

        case "memory.roles":
          respond(true, { roles: listRoles().map((r) => getRoleInfo(r)).filter(Boolean) });
          break;

        case "channels.status":
          respond(true, Array.from(this.registry.channels.entries()).map(([cId, ch]) => ({
            id: cId,
            label: ch.meta.label,
            capabilities: ch.capabilities,
          })));
          break;

        case "plugins.list":
          respond(true, {
            channels: Array.from(this.registry.channels.keys()),
            tools: Array.from(this.registry.tools.keys()),
            commands: Array.from(this.registry.commands.keys()),
            cliRegistrars: this.registry.cliRegistrars.length,
          });
          break;

        case "tools.list":
          respond(true, { tools: this.getRegisteredToolSpecs() });
          break;

        case "tools.call": {
          const toolName = String((params?.toolName ?? params?.tool ?? "")).trim();
          if (!toolName) {
            respond(false, undefined, "toolName is required");
            break;
          }
          const tSessionKey = (params?.sessionKey as string) ?? "agent:main:main:main";
          const tParams = params?.params && typeof params.params === "object"
            ? (params.params as Record<string, unknown>)
            : {};
          try {
            const result = await this.executeRegisteredTool(toolName, tParams, tSessionKey);
            respond(true, { toolName, sessionKey: tSessionKey, result });
          } catch (err: any) {
            respond(false, undefined, err?.message ?? "Tool call failed");
          }
          break;
        }

        default:
          respond(false, undefined, `Unknown method: ${method}`);
      }
    } catch (err: any) {
      respond(false, undefined, err?.message ?? "Internal error");
    }
  }

  private broadcastToWs(event: string, payload: unknown): void {
    const frame = JSON.stringify({ type: "event", event, payload });
    for (const ws of this.wsClients.values()) {
      try { ws.send(frame); } catch {}
    }
  }

  // ==========================================================================
  // Plugin API Factory
  // ==========================================================================

  private createPluginApi(pluginId: string, manifest: PluginManifest): GatewayPluginApi {
    const self = this;
    const pluginLogger = this.config.logging.file
      ? createFileLogger(`plugin:${pluginId}`)
      : createConsoleLogger(`plugin:${pluginId}`);

    return {
      id: pluginId,
      name: manifest.name,
      source: "gateway",
      config: self.config,
      pluginConfig: self.config.plugins.config?.[pluginId],
      logger: pluginLogger,

      registerChannel(channel: ChannelPlugin) {
        if (self.registry.channels.has(channel.id)) {
          pluginLogger.warn(`Channel ${channel.id} already registered, skipping`);
          return;
        }
        self.registry.channels.set(channel.id, channel);
        // 保存 api 引用，供后续 init 调用使用
        self._channelApis.set(channel.id, this);
        pluginLogger.info(`Registered channel: ${channel.id}`);
      },

      registerTool(tool: ToolPlugin) {
        self.registry.tools.set(tool.name, tool);
        pluginLogger.info(`Registered tool: ${tool.name}`);
      },

      registerHook(events: PluginHookName[], handler: HookHandler) {
        self.registry.hooks.register(pluginId, events, handler);
      },

      registerHttpRoute(method: string, path: string, handler: HttpHandler) {
        self.registry.httpRoutes.push({ method: method.toUpperCase(), path, handler, pluginId });
        pluginLogger.info(`Registered HTTP route: ${method} ${path}`);
      },

      registerGatewayMethod(method: string, handler: WsMethodHandler) {
        if (self.registry.gatewayMethods.has(method)) {
          pluginLogger.warn(`Gateway method ${method} already registered, skipping`);
          return;
        }
        self.registry.gatewayMethods.set(method, { handler, pluginId });
        pluginLogger.info(`Registered gateway method: ${method}`);
      },

      registerCommand(name: string, handler: CommandHandler) {
        const normalized = name.replace(/^\//, "").trim().toLowerCase();
        if (!normalized) {
          pluginLogger.warn("Skipped empty command registration");
          return;
        }
        self.registry.commands.set(normalized, { pluginId, handler });
        pluginLogger.info(`Registered command: /${normalized}`);
      },

      registerService(service: BackgroundService) {
        self.registry.services.push(service);
        pluginLogger.info(`Registered service: ${service.name}`);
      },

      registerCli(registrar: (program: unknown) => void) {
        self.registry.cliRegistrars.push({ pluginId, registrar: registrar as any });
        pluginLogger.info("Registered CLI commands");
      },

      on<T extends PluginHookName>(hook: T, handler: HookHandler<T>) {
        self.registry.hooks.register(pluginId, [hook], handler);
      },

      async dispatch(msg: InboundMessage) {
        await self.dispatch(msg);
      },

      async sendToChannel(channel: string, target: string, text: string) {
        const ch = self.registry.channels.get(channel);
        if (!ch) throw new Error(`Channel not found: ${channel}`);
        await ch.outbound.sendText(target, text);
      },

      getSessionState(sessionKey: SessionKey) {
        return self.sessions.get(sessionKey) ?? null;
      },

      async resetSession(sessionKey: SessionKey) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.newSession();
        }
        const session = self.sessions.get(sessionKey);
        if (session) {
          session.messageCount = 0;
          session.lastActivity = Date.now();
          self.sessions.touch(sessionKey);
        }
      },

      async setThinkingLevel(sessionKey: SessionKey, level: string) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.setThinkingLevel(level);
        }
      },

      async setModel(sessionKey: SessionKey, provider: string, modelId: string) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.setModel(provider, modelId);
        }
      },

      async getAvailableModels(sessionKey: SessionKey) {
        const rpc = self.pool.getForSession(sessionKey);
        if (!rpc) return [];
        const models = await rpc.getAvailableModels();
        return Array.isArray(models) ? models : [];
      },

      async getSessionMessageMode(sessionKey: SessionKey) {
        return self.resolveTelegramMessageMode(sessionKey);
      },

      async setSessionMessageMode(sessionKey: SessionKey, mode: "steer" | "follow-up" | "interrupt") {
        self.sessionMessageModeOverrides.set(sessionKey, mode);
      },

      async compactSession(sessionKey: SessionKey, instructions?: string) {
        await self.compactSessionWithHooks(sessionKey, instructions);
      },

      async abortSession(sessionKey: SessionKey) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.abort();
        }
      },

      async forwardCommand(sessionKey: SessionKey, command: string, args: string) {
        const rpc = self.pool.getForSession(sessionKey);
        if (!rpc) {
          throw new Error(`No RPC process for session ${sessionKey}`);
        }
        self.log.info(`[forwardCommand] ${sessionKey}: ${command} ${args}`);
        
        // Map slash commands to RPC methods
        switch (command) {
          case "/compact":
            await rpc.compact(args || undefined);
            break;
          case "/stop":
            await rpc.abort();
            break;
          case "/think": {
            const level = args || "medium";
            await rpc.setThinkingLevel(level);
            break;
          }
          case "/model": {
            if (!args || !args.includes("/")) {
              throw new Error("Usage: /model provider/modelId");
            }
            const slash = args.indexOf("/");
            const provider = args.slice(0, slash);
            const modelId = args.slice(slash + 1);
            await rpc.setModel(provider, modelId);
            break;
          }
          default:
            // For unknown commands, send as prompt
            const fullCommand = args ? `${command} ${args}` : command;
            await rpc.prompt(fullCommand);
        }
      },

      async getPiCommands(_sessionKey: SessionKey): Promise<{ name: string; description?: string }[]> {
        // KeenUnion's approach: pi commands are global, use any idle RPC
        // Find first idle client without acquiring (lightweight, no session binding)
        const pool = self.pool as any;
        let rpc: RpcClient | null = null;
        if (pool.clients) {
          for (const client of pool.clients.values()) {
            if (client.isIdle && client.isAlive) {
              rpc = client;
              break;
            }
          }
        }
        if (!rpc) {
          self.log.debug(`[getPiCommands] no idle RPC available`);
          return [];
        }
        try {
          const commands = await rpc.getCommands();
          self.log.info(`[getPiCommands] got ${commands.length} commands from ${rpc.id}`);
          return commands;
        } catch (err) {
          self.log.warn(`[getPiCommands] failed to get commands: ${err}`);
          return [];
        }
      },
    };
  }

  // ==========================================================================
  // Built-in Commands
  // ==========================================================================

  /**
   * Register built-in slash commands.
   */
  private registerBuiltinCommands(): void {
    // /role <name> — Switch session role
    this.registry.commands.set("role", {
      pluginId: "builtin",
      handler: async ({ sessionKey, args, respond }) => {
        const roleName = args.trim();
        if (!roleName) {
          const availableRoles = this.listAvailableRoles();
          await respond(`Usage: /role <name>\nAvailable roles: ${availableRoles.join(", ")}`);
          return;
        }

        const availableRoles = this.listAvailableRoles();
        if (!availableRoles.includes(roleName)) {
          await respond(`Unknown role: ${roleName}\nAvailable: ${availableRoles.join(", ")}`);
          return;
        }

        try {
          const changed = await this.setSessionRole(sessionKey, roleName);
          if (changed) {
            await respond(`Role switched to: ${roleName}`);
          } else {
            await respond(`Already using role: ${roleName}`);
          }
        } catch (err: any) {
          await respond(`Failed to switch role: ${err?.message ?? String(err)}`);
        }
      },
    });

    this.log.info("Registered built-in command: /role");
  }

  // ==========================================================================
  // Role Management
  // ==========================================================================

  /**
   * Get all available roles from config (workspaceDirs + capabilities keys).
   */
  private listAvailableRoles(): string[] {
    const workspaceRoles = Object.keys(this.config.roles.workspaceDirs ?? {});
    const capabilityRoles = Object.keys(this.config.roles.capabilities ?? {});
    const allRoles = new Set([...workspaceRoles, ...capabilityRoles, "default"]);
    return Array.from(allRoles).sort();
  }

  /**
   * Set role for a session and respawn RPC process.
   * Returns true if successful, false if role not changed.
   */
  private async setSessionRole(sessionKey: SessionKey, newRole: string): Promise<boolean> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error(`Session not found: ${sessionKey}`);
    }

    const currentRole = session.role ?? "default";
    if (currentRole === newRole) {
      return false; // No change needed
    }

    // Release current RPC process
    this.pool.release(sessionKey);

    // Update session role
    session.role = newRole;
    session.lastActivity = Date.now();
    this.sessions.touch(sessionKey);

    // Pre-warm new RPC process with new role (optional, for faster response)
    try {
      const profile = this.buildSessionProfile(sessionKey, newRole);
      await this.pool.acquire(sessionKey, profile);
    } catch (err) {
      this.log.warn(`Failed to pre-warm RPC for role ${newRole}: ${err}`);
      // Non-fatal: process will be acquired on next message
    }

    this.log.info(`Role changed for ${sessionKey}: ${currentRole} -> ${newRole}`);
    return true;
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

// ============================================================================
// Types
// ============================================================================

interface WsClientData {
  clientId: string;
}
