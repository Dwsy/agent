/**
 * WebSocket method handlers — grouped by domain.
 *
 * Each register* function populates the method map with handlers
 * extracted from server.ts handleWsFrame cases.
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext, WsClientData } from "../gateway/types.ts";
import type { ServerWebSocket } from "bun";
import type { CronJob } from "../core/config.ts";
import { loadConfig } from "../core/config.ts";
import type { ImageContent, SessionKey } from "../core/types.ts";
import { redactConfig } from "../core/auth.ts";
import { searchMemory, getMemoryStats, getRoleInfo, listRoles } from "../core/memory-access.ts";
import { getRegisteredToolSpecs, executeRegisteredTool } from "../gateway/tool-executor.ts";
import { processWebChatMediaDirectives } from "../api/media-routes.ts";
import type { WsMethodFn } from "./ws-router.ts";

// ============================================================================
// Chat Methods
// ============================================================================

export function registerChatMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("chat.send", async (params, _ctx, ws) => {
    const text = (params?.text as string) ?? "";
    const sessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
    const images = Array.isArray(params?.images) ? params.images as ImageContent[] : undefined;

    await ctx.dispatch({
      source: { channel: "webchat", chatType: "dm", chatId: "default", senderId: ws.data.clientId },
      sessionKey,
      text,
      images,
      respond: async (reply) => {
        const processed = processWebChatMediaDirectives(reply, sessionKey, ctx.config);
        ws.send(JSON.stringify({ type: "event", event: "chat.reply", payload: { text: processed.text, images: processed.images, sessionKey } }));
      },
      setTyping: async (typing) => {
        ws.send(JSON.stringify({ type: "event", event: "chat.typing", payload: { typing, sessionKey } }));
      },
    });
    return { ok: true };
  });

  methods.set("chat.abort", async (params) => {
    const sessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
    const rpc = ctx.pool.getForSession(sessionKey);
    if (rpc) await rpc.abort();
    return { ok: true };
  });

  methods.set("chat.history", async (params) => {
    const sessionKey = (params?.sessionKey as string) ?? "agent:main:webchat:default";
    const rpc = ctx.pool.getForSession(sessionKey);
    if (rpc) {
      const messages = await rpc.getMessages();
      return { messages };
    }
    return { messages: [] };
  });
}

// ============================================================================
// Session Methods
// ============================================================================

export function registerSessionMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("sessions.list", async () => {
    return ctx.sessions.toArray();
  });

  methods.set("sessions.get", async (params) => {
    const sKey = params?.sessionKey as string;
    if (!sKey) throw new Error("sessionKey is required");
    const state = ctx.sessions.get(sKey);
    if (!state) throw new Error("Session not found");
    return state;
  });

  methods.set("sessions.delete", async (params) => {
    const dKey = params?.sessionKey as string;
    if (!dKey) throw new Error("sessionKey required");
    await ctx.registry.hooks.dispatch("session_end", { sessionKey: dKey });
    ctx.pool.release(dKey);
    ctx.sessionMessageModeOverrides.delete(dKey);
    ctx.sessions.delete(dKey);
    return { ok: true };
  });

  methods.set("sessions.compact", async (params) => {
    const cKey = params?.sessionKey as string;
    if (!cKey) throw new Error("sessionKey required");
    await ctx.compactSessionWithHooks(cKey, params?.instructions as string);
    return { ok: true };
  });
  // Role management handled by role-persona extension via RPC
}

// ============================================================================
// Cron Methods
// ============================================================================

export function registerCronMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("cron.list", async () => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const jobs = ctx.cron.listJobs().map((j) => ({
      ...j,
      status: j.paused ? "paused" : j.enabled === false ? "disabled" : "active",
      lastRun: ctx.cron!.getRunHistory(j.id, 1)[0] ?? null,
    }));
    return { jobs };
  });

  methods.set("cron.add", async (params) => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const cId = params?.id as string;
    const cSchedule = params?.schedule as CronJob["schedule"];
    const cTask = params?.task as string;
    if (!cId || !cSchedule || !cTask) throw new Error("id, schedule, and task required");
    const existing = ctx.cron.listJobs().find((j) => j.id === cId);
    if (existing) throw new Error(`job "${cId}" already exists`);
    const newJob: CronJob = {
      id: cId,
      schedule: cSchedule,
      payload: { text: cTask },
      agentId: params?.agentId as string | undefined,
      delivery: (params?.delivery as "announce" | "silent") ?? undefined,
      deleteAfterRun: params?.deleteAfterRun as boolean | undefined,
    };
    ctx.cron.addJob(newJob);
    return { job: newJob };
  });

  methods.set("cron.remove", async (params) => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const id = params?.id as string;
    if (!id) throw new Error("id required");
    if (!ctx.cron.removeJob(id)) throw new Error("not found");
    return { ok: true };
  });

  methods.set("cron.pause", async (params) => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const id = params?.id as string;
    if (!id) throw new Error("id required");
    if (!ctx.cron.pauseJob(id)) throw new Error("not found");
    return { status: "paused" };
  });

  methods.set("cron.resume", async (params) => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const id = params?.id as string;
    if (!id) throw new Error("id required");
    if (!ctx.cron.resumeJob(id)) throw new Error("not found or not paused");
    return { status: "active" };
  });

  methods.set("cron.run", async (params) => {
    if (!ctx.cron) throw new Error("Cron not enabled");
    const id = params?.id as string;
    if (!id) throw new Error("id required");
    if (!ctx.cron.runJob(id)) throw new Error("not found");
    return { message: "triggered" };
  });
}

// ============================================================================
// Config & Model Methods
// ============================================================================

export function registerConfigMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("config.get", async () => {
    return redactConfig(ctx.config);
  });

  methods.set("config.reload", async () => {
    if (ctx.reloadConfig) {
      ctx.reloadConfig();
    } else {
      // Fallback: reload and update via mutable reference
      const newConfig = loadConfig();
      Object.assign(ctx.config, newConfig);
    }
    return { ok: true };
  });

  methods.set("models.list", async (params) => {
    const sessionKey = (params?.sessionKey as string) ?? "agent:main:main:main";
    const rpc = ctx.pool.getForSession(sessionKey);
    if (!rpc) throw new Error("No active session");
    const models = await rpc.getAvailableModels();
    return { models };
  });

  methods.set("usage.status", async (params) => {
    const sessionKey = (params?.sessionKey as string) ?? "agent:main:main:main";
    const rpc = ctx.pool.getForSession(sessionKey);
    if (!rpc) throw new Error("No active session");
    const stats = await rpc.getSessionStats();
    return { sessionKey, stats };
  });
}

// ============================================================================
// Tool Methods
// ============================================================================

export function registerToolMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("tools.list", async () => {
    return { tools: getRegisteredToolSpecs(ctx) };
  });

  methods.set("tools.call", async (params) => {
    const toolName = String((params?.toolName ?? params?.tool ?? "")).trim();
    if (!toolName) throw new Error("toolName is required");
    const sessionKey = (params?.sessionKey as string ?? "agent:main:main:main") as SessionKey;
    const tParams = params?.params && typeof params.params === "object"
      ? (params.params as Record<string, unknown>)
      : {};
    const result = await executeRegisteredTool(toolName, tParams, sessionKey, ctx);
    return { toolName, sessionKey, result };
  });
}

// ============================================================================
// Memory Methods
// ============================================================================

export function registerMemoryMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  methods.set("memory.search", async (params) => {
    const role = (params?.role as string) ?? "default";
    const query = (params?.query as string) ?? "";
    const maxResults = (params?.maxResults as number) ?? 20;
    if (!query) throw new Error("query is required");
    return { role, results: searchMemory(role, query, { maxResults }) };
  });

  methods.set("memory.stats", async (params) => {
    const role = (params?.role as string) ?? "default";
    const stats = getMemoryStats(role);
    if (!stats) throw new Error("Role not found");
    return stats;
  });

  methods.set("memory.roles", async () => {
    return { roles: listRoles().map((r) => getRoleInfo(r)).filter(Boolean) };
  });
}

// ============================================================================
// Channel & Plugin Methods
// ============================================================================

export function registerChannelMethods(
  methods: Map<string, WsMethodFn>,
  ctx: GatewayContext,
): void {
  methods.set("channels.status", async () => {
    return Array.from(ctx.registry.channels.entries()).map(([cId, ch]) => ({
      id: cId,
      label: ch.meta.label,
      capabilities: ch.capabilities,
    }));
  });

  methods.set("plugins.list", async () => {
    return {
      channels: Array.from(ctx.registry.channels.keys()),
      tools: Array.from(ctx.registry.tools.keys()),
      commands: Array.from(ctx.registry.commands.keys()),
      cliRegistrars: ctx.registry.cliRegistrars.length,
    };
  });
}
