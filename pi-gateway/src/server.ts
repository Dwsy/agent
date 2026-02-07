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
import { loadConfig, ensureDataDir, type Config, resolveConfigPath, watchConfig } from "./core/config.ts";
import { RpcPool } from "./core/rpc-pool.ts";
import { MessageQueueManager } from "./core/message-queue.ts";
import { resolveSessionKey, resolveRoleForSession, getCwdForRole } from "./core/session-router.ts";
import { createLogger as createConsoleLogger, type Logger, type InboundMessage, type SessionKey, type SessionState, type WsFrame } from "./core/types.ts";
import { SessionStore, getSessionDir } from "./core/session-store.ts";
import { initFileLogger, createFileLogger } from "./core/logger-file.ts";
import { CronEngine } from "./core/cron.ts";
import { TranscriptLogger } from "./core/transcript-logger.ts";
import { searchMemory, getMemoryStats, getRoleInfo, listRoles } from "./core/memory-access.ts";
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
}

export class Gateway {
  private config: Config;
  private pool: RpcPool;
  private queue: MessageQueueManager;
  private registry: PluginRegistryState;
  private sessions: SessionStore;
  private transcripts: TranscriptLogger;
  private cron: CronEngine | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private configWatcher: (() => void) | null = null;
  private wsClients = new Map<string, ServerWebSocket<WsClientData>>();
  private server: Server<WsClientData> | null = null;
  private log: Logger;
  private nextClientId = 0;

  constructor(options: GatewayOptions = {}) {
    this.config = loadConfig(options.configPath);
    if (options.port) this.config.gateway.port = options.port;

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
    this.pool = new RpcPool(this.config);
    this.queue = new MessageQueueManager();
    this.registry = createPluginRegistry();
    this.sessions = new SessionStore(this.config.session.dataDir);
    this.transcripts = new TranscriptLogger(join(this.config.session.dataDir, "transcripts"));
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

    // Load plugins
    const loader = new PluginLoader(this.config, this.registry, (id, m) => this.createPluginApi(id, m));
    await loader.loadBuiltins();
    const { loaded, errors } = await loader.loadAll();
    this.log.info(`Plugins loaded: ${loaded.join(", ") || "(none)"}`);
    for (const { id, error } of errors) {
      this.log.error(`Plugin ${id} failed: ${error}`);
    }

    // Dispatch gateway_start hook
    await this.registry.hooks.dispatch("gateway_start", {});

    // Start channel plugins
    for (const [id, channel] of this.registry.channels) {
      try {
        await channel.start();
        this.log.info(`Channel started: ${id}`);
      } catch (err: any) {
        this.log.error(`Channel ${id} failed to start: ${err?.message}`);
      }
    }

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
      this.cron = new CronEngine(this.config.session.dataDir.replace(/\/sessions$/, ""), this);
      this.cron.start();
    }

    // Start HTTP + WebSocket server
    this.startServer();

    // WS tick keepalive (aligned with OpenClaw event:tick, 30s)
    this.tickTimer = setInterval(() => {
      this.broadcastToWs("tick", { ts: Date.now() });
    }, 30_000);

    // Config file watcher (hot reload)
    this.configWatcher = watchConfig(resolveConfigPath(), (newConfig) => {
      this.log.info("Config file changed, reloading...");
      this.config = newConfig;
    });

    this.log.info(`Gateway listening on ${this.config.gateway.bind}:${this.config.gateway.port}`);
    this.log.info(`Web UI: http://localhost:${this.config.gateway.port}`);
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

    // Persist sessions
    this.sessions.dispose();

    // Stop RPC pool
    await this.pool.stop();

    this.log.info("Gateway stopped");
  }

  // ==========================================================================
  // Message Dispatch (core pipeline)
  // ==========================================================================

  /**
   * Dispatch an inbound message to the agent pipeline.
   * Called by channel plugins and WebChat.
   */
  async dispatch(msg: InboundMessage): Promise<void> {
    // Hook: message_received
    await this.registry.hooks.dispatch("message_received", { message: msg });

    const { sessionKey } = msg;

    // Enqueue for serial processing
    const enqueued = this.queue.enqueue(sessionKey, async () => {
      await this.processMessage(msg);
    });

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

  private async processMessage(msg: InboundMessage): Promise<void> {
    const { sessionKey, text, images, respond, setTyping, source } = msg;
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

    // Resolve role → CWD for RPC process
    const role = session.role ?? "default";
    const cwd = getCwdForRole(role, this.config);

    // Acquire RPC process
    let rpc;
    try {
      rpc = await this.pool.acquire(sessionKey, cwd);
    } catch (err: any) {
      const errMsg = `Failed to acquire RPC process: ${err?.message ?? String(err)}`;
      this.log.error(errMsg);
      this.transcripts.logError(sessionKey, errMsg);
      await respond(`Error: ${errMsg}`);
      return;
    }
    session.rpcProcessId = rpc.id;
    session.isStreaming = true;
    this.transcripts.logMeta(sessionKey, "rpc_acquired", { rpcId: rpc.id, cwd });

    // Typing indicator
    await setTyping(true);

    // Collect response
    let fullText = "";
    let toolLabels: string[] = [];
    let agentEndMessages: unknown[] = [];
    let agentEndStopReason = "stop";
    let eventCount = 0;

    const unsub = rpc.onEvent((event) => {
      eventCount++;

      // Transcript: log every agent event
      this.transcripts.logEvent(sessionKey, event as Record<string, unknown>);

      // Stream text deltas
      if (event.type === "message_update") {
        const ame = (event as any).assistantMessageEvent;
        if (ame?.type === "text_delta" && ame.delta) {
          fullText += ame.delta;
          msg.onStreamDelta?.(fullText, ame.delta);
        }
      }

      // Tool execution labels
      if (event.type === "tool_execution_start") {
        const eventAny = event as any;
        const label = (eventAny.args as any)?.label || eventAny.toolName;
        if (label) toolLabels.push(label);
        msg.onToolStart?.(eventAny.toolName, eventAny.args, eventAny.toolCallId);
      }

      // Capture agent_end data for hooks
      if (event.type === "agent_end") {
        agentEndMessages = (event as any).messages ?? [];
      }

      // Capture stop reason from message_end
      if (event.type === "message_end") {
        const msg = event as any;
        if (msg.message?.role === "assistant" && msg.message?.stopReason) {
          agentEndStopReason = msg.message.stopReason;
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
      await this.registry.hooks.dispatch("before_agent_start", { sessionKey, message: text });

      // Send prompt to pi agent
      this.log.info(`[processMessage] Sending prompt to ${rpc.id} for ${sessionKey}: "${text.slice(0, 80)}"`);
      await rpc.prompt(text, images);
      await rpc.waitForIdle(timeoutMs);

      // Fallback: some runs may produce no text_delta events even with a final assistant message.
      if (!fullText.trim()) {
        this.transcripts.logMeta(sessionKey, "fallback_get_last_text", { eventCount });
        try {
          const lastAssistantText = await rpc.getLastAssistantText();
          if (lastAssistantText?.trim()) {
            fullText = lastAssistantText;
          }
        } catch (err: any) {
          this.log.warn(`Failed to read last assistant text for ${sessionKey}: ${err?.message ?? String(err)}`);
        }
      }

      // Hook: agent_end with real messages from the RPC event stream
      await this.registry.hooks.dispatch("agent_end", {
        sessionKey,
        messages: agentEndMessages,
        stopReason: agentEndStopReason,
      });
    } catch (err: any) {
      const errMsg = err?.message ?? "Unknown error";
      fullText = fullText || `Error: ${errMsg}`;
      this.log.error(`Agent error for ${sessionKey}: ${errMsg}`);
      this.transcripts.logError(sessionKey, errMsg, { eventCount, abortAttempted, textLen: fullText.length });
    } finally {
      clearTimeout(abortTimer);
      unsub();
      session.isStreaming = false;
      await setTyping(false);
    }

    // Hook: message_sending
    if (!fullText.trim()) {
      this.log.warn(`Empty assistant response for ${sessionKey}; sending fallback text.`);
      fullText = "我这次没有生成可发送的文本，请再发一次或换个问法。";
    }

    // Transcript: log final response
    this.transcripts.logResponse(sessionKey, fullText, Date.now() - startTime);
    this.transcripts.logMeta(sessionKey, "process_end", {
      durationMs: Date.now() - startTime,
      eventCount,
      textLength: fullText.length,
      toolCount: toolLabels.length,
      tools: toolLabels,
      abortAttempted,
    });

    const outbound = { channel: source.channel, target: source.chatId, text: fullText };
    await this.registry.hooks.dispatch("message_sending", { message: outbound });

    // Send response
    await respond(fullText);

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
      this.queue.enqueue(sessionKey, async () => {
        const rpc = await this.pool.acquire(sessionKey);
        await rpc.prompt(`[WEBHOOK] ${body.text}`);
        await rpc.waitForIdle();
      });

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
        return Response.json({ error: "Invalid 'to' format. Use 'channel:target' (e.g. 'telegram:123456')" }, { status: 400 });
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

      // Resolve role + CWD
      const role = this.sessions.get(sessionKey)?.role ?? "default";
      const cwd = getCwdForRole(role, this.config);

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
      const rpc = await this.pool.acquire(sessionKey, cwd);
      session.rpcProcessId = rpc.id;
      session.isStreaming = true;

      // Collect response
      let fullText = "";
      const unsub = rpc.onEvent((event) => {
        if (event.type === "message_update") {
          const ame = (event as any).assistantMessageEvent;
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

    // Resolve role + CWD
    const role = this.sessions.get(sessionKey)?.role ?? "default";
    const cwd = getCwdForRole(role, this.config);

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
          rpc = await self.pool.acquire(sessionKey, cwd);
        } catch (err: any) {
          send({ type: "error", error: err?.message ?? "Pool acquire failed" });
          controller.close();
          return;
        }

        session.rpcProcessId = rpc.id;
        session.isStreaming = true;

        const unsub = rpc.onEvent((event) => {
          if (event.type === "message_update") {
            const ame = (event as any).assistantMessageEvent;
            if (ame?.type === "text_delta" && ame.delta) {
              fullText += ame.delta;
              send({ type: "delta", text: ame.delta });
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
      const cwd = getCwdForRole(role, this.config);

      if (!this.sessions.has(sessionKey)) {
        this.sessions.getOrCreate(sessionKey, {
          role: null, isStreaming: false, lastActivity: Date.now(), messageCount: 0, rpcProcessId: null,
        });
      }

      const session = this.sessions.get(sessionKey)!;
      session.lastActivity = Date.now();
      session.messageCount++;

      const rpc = await this.pool.acquire(sessionKey, cwd);
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
              if (event.type === "message_update") {
                const ame = (event as any).assistantMessageEvent;
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
          const ame = (event as any).assistantMessageEvent;
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
    const webDir = new URL("./web", import.meta.url).pathname;

    // Map paths
    let filePath: string;
    if (pathname === "/" || pathname === "/index.html") {
      filePath = `${webDir}/index.html`;
    } else if (pathname.startsWith("/web/")) {
      filePath = `${webDir}/${pathname.slice(5)}`;
    } else {
      return new Response("Not Found", { status: 404 });
    }

    // Serve file
    const file = Bun.file(filePath);
    if (!file.size) {
      return new Response("Not Found", { status: 404 });
    }

    // Content-type mapping
    const ext = filePath.split(".").pop() ?? "";
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "application/javascript; charset=utf-8",
      json: "application/json",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
    };

    return new Response(file, {
      headers: {
        "content-type": types[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
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

          await this.dispatch({
            source: { channel: "webchat", chatType: "dm", chatId: "default", senderId: ws.data.clientId },
            sessionKey,
            text,
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
          const cRpc = this.pool.getForSession(cKey);
          if (cRpc) {
            try {
              await cRpc.compact(params?.instructions as string);
              respond(true, { ok: true });
            } catch (err: any) {
              respond(false, undefined, err?.message);
            }
          } else {
            respond(false, undefined, "No active session");
          }
          break;
        }

        case "sessions.delete": {
          const dKey = (params?.sessionKey as string);
          if (!dKey) { respond(false, undefined, "sessionKey required"); break; }
          this.pool.release(dKey);
          this.sessions.delete(dKey);
          respond(true, { ok: true });
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
      logger: pluginLogger,

      registerChannel(channel: ChannelPlugin) {
        if (self.registry.channels.has(channel.id)) {
          pluginLogger.warn(`Channel ${channel.id} already registered, skipping`);
          return;
        }
        channel.init(this).catch((err) => pluginLogger.error(`Channel ${channel.id} init error:`, err));
        self.registry.channels.set(channel.id, channel);
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
        self.registry.commands.set(name, { pluginId, handler });
        pluginLogger.info(`Registered command: /${name}`);
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

      async compactSession(sessionKey: SessionKey, instructions?: string) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.compact(instructions);
        }
      },

      async abortSession(sessionKey: SessionKey) {
        const rpc = self.pool.getForSession(sessionKey);
        if (rpc) {
          await rpc.abort();
        }
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
