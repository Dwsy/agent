/**
 * WebSocket Method Router — replaces handleWsFrame's switch/case with a method registry.
 *
 * Design: spec §4.2 (docs/SERVER-REFACTOR-SPEC.md)
 * Phase: P1 (skeleton now, implementation after P0 lands)
 *
 * @owner MintHawk (KeenUnion)
 */

import type { ServerWebSocket } from "bun";
import type { GatewayContext } from "../gateway/types.ts";
import { registerChatMethods } from "./ws-methods.ts";
import { registerSessionMethods } from "./ws-methods.ts";
import { registerCronMethods } from "./ws-methods.ts";
import { registerConfigMethods } from "./ws-methods.ts";
import { registerToolMethods } from "./ws-methods.ts";
import { registerMemoryMethods } from "./ws-methods.ts";
import { registerChannelMethods } from "./ws-methods.ts";

// ============================================================================
// Types
// ============================================================================

export type WsMethodFn = (
  params: Record<string, unknown>,
  ctx: GatewayContext,
  ws: ServerWebSocket<any>,
) => Promise<unknown>;

export interface WsFrame {
  method: string;
  id?: string | number;
  params?: Record<string, unknown>;
}

// ============================================================================
// Router
// ============================================================================

export function createWsRouter(ctx: GatewayContext): Map<string, WsMethodFn> {
  const methods = new Map<string, WsMethodFn>();

  registerChatMethods(methods, ctx);       // chat.send, chat.abort, chat.history
  registerSessionMethods(methods, ctx);    // sessions.list, sessions.get, sessions.delete, sessions.compact, session.listRoles, session.setRole
  registerCronMethods(methods, ctx);       // cron.list, cron.add, cron.remove, cron.pause, cron.resume, cron.run
  registerConfigMethods(methods, ctx);     // config.get, config.reload, models.list, usage.status
  registerToolMethods(methods, ctx);       // tools.list, tools.call
  registerMemoryMethods(methods, ctx);     // memory.search, memory.stats, memory.roles
  registerChannelMethods(methods, ctx);    // channels.status, plugins.list

  return methods;
}

/**
 * Dispatch a parsed WS frame to the registered method handler.
 * Returns the result to be sent back as JSON-RPC response.
 */
export async function dispatchWsFrame(
  router: Map<string, WsMethodFn>,
  frame: WsFrame,
  ctx: GatewayContext,
  ws: ServerWebSocket<any>,
): Promise<{ id?: string | number; result?: unknown; error?: string }> {
  const handler = router.get(frame.method);
  if (!handler) {
    return { id: frame.id, error: `Unknown method: ${frame.method}` };
  }

  try {
    const result = await handler(frame.params ?? {}, ctx, ws);
    return { id: frame.id, result };
  } catch (err: any) {
    return { id: frame.id, error: err.message ?? String(err) };
  }
}
