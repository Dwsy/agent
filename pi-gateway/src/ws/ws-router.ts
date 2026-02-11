/**
 * WebSocket Method Router — replaces handleWsFrame's switch/case with a method registry.
 *
 * Design: spec §4.2 (docs/SERVER-REFACTOR-SPEC.md)
 *
 * @owner MintHawk (KeenUnion)
 */

import type { ServerWebSocket } from "bun";
import type { GatewayContext, WsClientData } from "../gateway/types.ts";
import type { ExtensionUIResponse } from "../core/extension-ui-types.ts";
import type { WsFrame } from "../core/types.ts";
import { safeTokenCompare } from "../core/auth.ts";
import {
  registerChatMethods,
  registerSessionMethods,
  registerCronMethods,
  registerConfigMethods,
  registerToolMethods,
  registerMemoryMethods,
  registerChannelMethods,
} from "./ws-methods.ts";

// ============================================================================
// Types
// ============================================================================

export type WsMethodFn = (
  params: Record<string, unknown>,
  ctx: GatewayContext,
  ws: ServerWebSocket<WsClientData>,
) => Promise<unknown>;

// Re-export WsFrame from core/types for convenience
export type { WsFrame } from "../core/types.ts";

// ============================================================================
// Router
// ============================================================================

export function createWsRouter(ctx: GatewayContext): Map<string, WsMethodFn> {
  const methods = new Map<string, WsMethodFn>();

  registerChatMethods(methods, ctx);
  registerSessionMethods(methods, ctx);
  registerCronMethods(methods, ctx);
  registerConfigMethods(methods, ctx);
  registerToolMethods(methods, ctx);
  registerMemoryMethods(methods, ctx);
  registerChannelMethods(methods, ctx);

  // --- Special methods that need ws/extensionUI access ---

  methods.set("connect", async (params, _ctx, ws) => {
    const authMode = ctx.config.gateway.auth.mode;
    if (authMode === "token" && ctx.config.gateway.auth.token) {
      const connectToken = (params?.auth as any)?.token ?? params?.token;
      if (!connectToken || !safeTokenCompare(connectToken, ctx.config.gateway.auth.token)) {
        ws.close(4001, "Unauthorized");
        throw new Error("Invalid auth token");
      }
    }
    return { protocol: 1, server: { name: "pi-gateway", version: "0.2.0" } };
  });

  methods.set("health", async () => {
    return {
      pool: ctx.pool.getStats(),
      queue: ctx.queue.getStats(),
      sessions: ctx.sessions.size,
    };
  });

  methods.set("extension_ui_response", async (params, _ctx, ws) => {
    const uiResponse: ExtensionUIResponse = {
      type: "extension_ui_response",
      id: (params?.id as string) ?? "",
      value: params?.value as string | string[] | undefined,
      confirmed: params?.confirmed as boolean | undefined,
      cancelled: params?.cancelled as boolean | undefined,
      timestamp: Date.now(),
    };
    return ctx.extensionUI.handleResponse(uiResponse, ctx.wsClients, ws.data.clientId);
  });

  return methods;
}

/**
 * Dispatch a parsed WS frame to the registered method handler.
 * Falls back to plugin-registered methods, then returns error for unknown methods.
 */
export async function dispatchWsFrame(
  router: Map<string, WsMethodFn>,
  frame: WsFrame,
  ctx: GatewayContext,
  ws: ServerWebSocket<WsClientData>,
): Promise<void> {
  if (frame.type !== "req") return;

  const { id, method, params } = frame;
  const respond = (ok: boolean, payload?: unknown, error?: string) => {
    ws.send(JSON.stringify({ type: "res", id, ok, payload, error }));
  };

  try {
    // Plugin-registered gateway methods first
    const pluginMethod = ctx.registry.gatewayMethods.get(method);
    if (pluginMethod) {
      const result = await pluginMethod.handler(params ?? {}, { clientId: ws.data.clientId });
      respond(true, result);
      return;
    }

    // Built-in methods via router
    const handler = router.get(method);
    if (handler) {
      const result = await handler(params ?? {}, ctx, ws);
      respond(true, result);
      return;
    }

    respond(false, undefined, `Unknown method: ${method}`);
  } catch (err: any) {
    respond(false, undefined, err?.message ?? String(err));
  }
}
