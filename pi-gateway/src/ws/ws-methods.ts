/**
 * WebSocket method handlers — grouped by domain.
 *
 * Each register* function populates the method map with handlers
 * extracted from server.ts handleWsFrame cases.
 *
 * Phase: P1 (signatures now, implementation after P0 lands)
 *
 * @owner MintHawk (KeenUnion)
 */

import type { ServerWebSocket } from "bun";
import type { GatewayContext } from "../gateway/types.ts";
import type { WsMethodFn } from "./ws-router.ts";

// ============================================================================
// Chat Methods
// ============================================================================
// Source: server.ts lines ~2122-2168
//
// chat.send     — dispatch user message to agent (resolves session, enqueues)
// chat.abort    — abort current streaming response
// chat.history  — return message history for a session

export function registerChatMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame case "chat.send" / "chat.abort" / "chat.history"
}

// ============================================================================
// Session Methods
// ============================================================================
// Source: server.ts lines ~2170-2271
//
// sessions.list     — list all active sessions with metadata
// sessions.get      — get single session state by key
// sessions.delete   — terminate and clean up a session
// sessions.compact  — trigger compaction for a session
// session.listRoles — list available roles from config
// session.setRole   — switch session to a different role

export function registerSessionMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}

// ============================================================================
// Cron Methods
// ============================================================================
// Source: server.ts lines ~2299-2367
//
// cron.list    — list all cron jobs with status
// cron.add     — create a new cron job (schedule + task + optional agentId/mode)
// cron.remove  — delete a cron job by id
// cron.pause   — pause a cron job
// cron.resume  — resume a paused cron job
// cron.run     — manually trigger a cron job

export function registerCronMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}

// ============================================================================
// Config & Model Methods
// ============================================================================
// Source: server.ts lines ~2185-2229
//
// config.get    — return current gateway config (sanitized)
// config.reload — reload config from disk
// models.list   — list available models from RPC pool
// usage.status  — return context usage stats for a session

export function registerConfigMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}

// ============================================================================
// Tool Methods
// ============================================================================
// Source: server.ts lines ~2386-2400+
//
// tools.list — list registered tools from plugins
// tools.call — invoke a registered tool by name with params

export function registerToolMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}

// ============================================================================
// Memory Methods
// ============================================================================
// Source: server.ts lines ~2273-2297
//
// memory.search — search agent memory by query
// memory.stats  — return memory statistics
// memory.roles  — list available roles

export function registerMemoryMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}

// ============================================================================
// Channel & Plugin Methods
// ============================================================================
// Source: server.ts lines ~2369-2395
//
// channels.status — return status of all channels (telegram/discord/webchat)
// plugins.list    — list loaded plugins with metadata

export function registerChannelMethods(
  methods: Map<string, WsMethodFn>,
  _ctx: GatewayContext,
): void {
  // TODO: extract from server.ts handleWsFrame
}
