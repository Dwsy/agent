/**
 * HTTP Router — declarative route table replacing handleHttp's if-else chain.
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext } from "../gateway/types.ts";
import { serveStaticFile } from "../core/static-server.ts";
import { handleWebhookWake, handleWebhookEvent } from "./webhook-api.ts";
import { handleOpenAiChat } from "./openai-compat.ts";
import { handleSessionReset, handleSessionThink, handleSessionModel, handleModelsList, handleSessionUsage, handleSessionStatus, handleSessionsList, handleSessionDetail } from "./session-api.ts";
import { handleToolsList, handleToolCall } from "../gateway/tool-executor.ts";
import { handleCronApi } from "../core/cron-api.ts";
import { searchMemory, getMemoryStats, getRoleInfo, listRoles } from "../core/memory-access.ts";
import { handleMediaServe } from "./media-routes.ts";
import { handleMediaSendRequest } from "./media-send.ts";
import { handleMessageSendRequest } from "./message-send.ts";
import { handleMessageAction } from "./message-action.ts";
import { handleApiChat, handleApiChatStream } from "./chat-api.ts";
import { handleApiSend } from "./send-api.ts";
import { redactConfig } from "../core/auth.ts";
import { loadConfig } from "../core/config.ts";

/**
 * Route an HTTP request to the appropriate handler.
 * Plugin routes are checked in server.ts before calling this.
 */
export async function routeHttp(req: Request, url: URL, ctx: GatewayContext): Promise<Response> {
  const { pathname } = url;
  const method = req.method;

  // --- Health ---
  if (pathname === "/health" || pathname === "/api/health") {
    return Response.json({
      status: "ok",
      uptime: process.uptime(),
      pool: ctx.pool.getStats(),
      queue: ctx.queue.getStats(),
      sessions: ctx.sessions.size,
      channels: Array.from(ctx.registry.channels.keys()),
    });
  }

  // --- Metrics ---
  if (pathname === "/api/metrics" && method === "GET") {
    const snapshot = ctx.metrics.getSnapshot();
    return new Response(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    });
  }

  // --- Send ---
  if (pathname === "/api/send" && method === "POST") return handleApiSend(req, ctx);

  // --- Chat ---
  if (pathname === "/api/chat" && method === "POST") return handleApiChat(req, ctx);
  if (pathname === "/api/chat/stream" && method === "POST") return handleApiChatStream(req, ctx);

  // --- Sessions ---
  if (pathname === "/api/sessions" && method === "GET") return handleSessionsList(req, url, ctx);
  if (pathname.startsWith("/api/sessions/") && method === "GET") return handleSessionDetail(req, url, ctx);

  if (pathname.startsWith("/api/transcript/") && method === "GET") {
    const key = decodeURIComponent(pathname.slice("/api/transcript/".length));
    const lastN = parseInt(url.searchParams.get("last") ?? "100", 10);
    const entries = ctx.transcripts.readTranscript(key, lastN);
    return Response.json({ sessionKey: key, count: entries.length, entries });
  }

  if (pathname === "/api/transcripts" && method === "GET") {
    return Response.json({ sessions: ctx.transcripts.listSessions() });
  }

  if (pathname === "/api/session/reset" && method === "POST") return handleSessionReset(req, url, ctx);
  if (pathname === "/api/session/think" && method === "POST") return handleSessionThink(req, url, ctx);
  if (pathname === "/api/session/model" && method === "POST") return handleSessionModel(req, url, ctx);
  if (pathname === "/api/models" && method === "GET") return handleModelsList(req, url, ctx);
  if (pathname === "/api/session/usage" && method === "GET") return handleSessionUsage(req, url, ctx);
  if (pathname === "/api/session/status" && method === "GET") return handleSessionStatus(req, url, ctx);

  // --- Cron ---
  if (pathname.startsWith("/api/cron/") && ctx.cron) {
    const cronResponse = handleCronApi(req, url, ctx.cron, ctx.config);
    if (cronResponse instanceof Promise) return await cronResponse;
    if (cronResponse) return cronResponse;
  }

  // --- Wake (inject system event into main session) ---
  if (pathname === "/api/wake" && method === "POST") {
    return handleWake(req, ctx);
  }

  // --- Memory ---
  if (pathname === "/api/memory/search" && method === "GET") {
    const role = url.searchParams.get("role") ?? "default";
    const query = url.searchParams.get("q") ?? "";
    const max = parseInt(url.searchParams.get("max") ?? "20", 10);
    if (!query) return Response.json({ error: "q parameter required" }, { status: 400 });
    return Response.json({ role, query, results: searchMemory(role, query, { maxResults: max }) });
  }
  if (pathname === "/api/memory/stats" && method === "GET") {
    const role = url.searchParams.get("role") ?? "default";
    const stats = getMemoryStats(role);
    if (!stats) return Response.json({ error: "Role not found" }, { status: 404 });
    return Response.json(stats);
  }
  if (pathname === "/api/memory/roles" && method === "GET") {
    return Response.json({ roles: listRoles().map((r) => getRoleInfo(r)).filter(Boolean) });
  }

  // --- OpenAI compat ---
  if (pathname === "/v1/chat/completions" && method === "POST") return handleOpenAiChat(req, ctx);

  // --- Pool ---
  if (pathname === "/api/pool" && method === "GET") {
    const clients = ctx.pool.getAllClients();
    return Response.json({
      stats: ctx.pool.getStats(),
      processes: clients.map((c) => ({
        id: c.id, sessionKey: c.sessionKey, isAlive: c.isAlive,
        isIdle: c.isIdle, lastActivity: c.lastActivity,
      })),
    });
  }

  // --- Plugins ---
  if (pathname === "/api/plugins") {
    return Response.json({
      channels: Array.from(ctx.registry.channels.keys()),
      tools: Array.from(ctx.registry.tools.keys()),
      commands: Array.from(ctx.registry.commands.keys()),
      hooks: ctx.registry.hooks.getRegistered(),
    });
  }

  // --- Gateway management ---
  if (pathname === "/api/gateway/config" && method === "GET") {
    return Response.json(redactConfig(ctx.config as unknown as Record<string, any>));
  }
  if (pathname === "/api/gateway/reload" && method === "POST") {
    if (ctx.reloadConfig) {
      ctx.reloadConfig();
      return Response.json({ ok: true, message: "Config reloaded" });
    }
    const newConfig = loadConfig();
    Object.assign(ctx.config, newConfig);
    return Response.json({ ok: true, message: "Config reloaded (fallback)" });
  }
  if (pathname === "/api/gateway/restart" && method === "POST") {
    if (!ctx.config.gateway.commands?.restart) {
      return Response.json({ error: "Restart is disabled. Set gateway.commands.restart: true in config." }, { status: 403 });
    }
    // Respond before exiting — process manager (launchd/systemd/docker) will restart
    const response = Response.json({ ok: true, message: "Gateway restarting..." });
    setTimeout(() => process.exit(0), 500);
    return response;
  }

  // --- Tools ---
  if (pathname === "/api/tools" && method === "GET") return handleToolsList(req, url, ctx);
  if (pathname === "/api/tools/call" && method === "POST") return handleToolCall(req, url, ctx);

  // --- Webhooks ---
  const hooksBase = ctx.config.hooks.path ?? "/hooks";
  if (pathname === `${hooksBase}/wake` && method === "POST") return handleWebhookWake(req, ctx);
  if (pathname === `${hooksBase}/event` && method === "POST") return handleWebhookEvent(req, ctx);

  // --- Media ---
  if (pathname.startsWith("/api/media/") && method === "GET") return handleMediaServe(url, ctx.config);
  if (pathname === "/api/media/send" && method === "POST") {
    return handleMediaSendRequest(req, {
      config: ctx.config, pool: ctx.pool, registry: ctx.registry,
      sessions: ctx.sessions, log: ctx.log, broadcastToWs: ctx.broadcastToWs,
      onDelivered: ctx.onCronDelivered,
    });
  }

  // Message send API (v3.4: direct text delivery via channel plugins)
  if (pathname === "/api/message/send" && method === "POST") {
    return handleMessageSendRequest(req, {
      config: ctx.config, pool: ctx.pool, registry: ctx.registry,
      sessions: ctx.sessions, log: ctx.log, broadcastToWs: ctx.broadcastToWs,
      onDelivered: ctx.onCronDelivered,
    });
  }

  // Message action API (v3.6: react/edit/delete via channel plugins)
  if (pathname === "/api/message/action" && method === "POST") {
    return handleMessageAction(req, {
      config: ctx.config, pool: ctx.pool, registry: ctx.registry,
      sessions: ctx.sessions, log: ctx.log,
    });
  }

  // --- Static files ---
  if (pathname === "/" || pathname.startsWith("/web/")) {
    return serveStaticFile(pathname, ctx.noGui);
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================================
// Wake handler — inject system event into main session
// ============================================================================

async function handleWake(req: Request, ctx: GatewayContext): Promise<Response> {
  try {
    const body = (await req.json()) as { text?: string; mode?: string };
    if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    const text = body.text.trim();
    const mode = body.mode === "now" ? "now" : "next-heartbeat";
    const agentId = ctx.config.agents?.default ?? "default";
    const sessionKey = `agent:${agentId}:main`;

    // Inject event into system events queue
    ctx.systemEvents.inject(sessionKey, `[WAKE] ${text}`);

    // If mode=now, trigger immediate heartbeat
    if (mode === "now" && ctx.heartbeat) {
      ctx.heartbeat.requestNow(agentId);
    }

    return Response.json({ ok: true, mode, sessionKey });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
