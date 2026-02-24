/**
 * POST /api/message/edit — Edit an existing message via channel plugins (v3.4 T1)
 *
 * Called by the gateway-tools extension's send_message tool for streaming updates.
 * Supports editing messages previously sent by the bot.
 *
 * Auth: internalToken (HMAC-SHA256, per-process) OR active sessionKey.
 */

import type { Config } from "../core/config.ts";
import type { SessionKey, Logger } from "../core/types.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";
import { getGatewayInternalToken } from "./media-send.ts";

export interface MessageEditContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
}

export async function handleMessageEditRequest(
  req: Request,
  ctx: MessageEditContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const internalToken = typeof body.token === "string" ? body.token.trim() : "";
  const callerPid = typeof body.pid === "number" ? body.pid : 0;
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const parseMode = typeof body.parseMode === "string" ? body.parseMode as "Markdown" | "HTML" | "plain" : undefined;

  if (!messageId) {
    return Response.json({ error: "Missing messageId" }, { status: 400 });
  }

  if (!text) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  // Auth check
  if (sessionKey) {
    if (!ctx.pool.getForSession(sessionKey as SessionKey)) {
      return Response.json({ error: "Invalid or inactive session" }, { status: 403 });
    }
  } else if (internalToken) {
    const expected = getGatewayInternalToken(ctx.config);
    if (internalToken !== expected) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }
    
    if (callerPid > 0) {
      const client = ctx.pool.getByPid(callerPid);
      if (client?.sessionKey) {
        sessionKey = client.sessionKey;
      }
    }
  } else {
    return Response.json({ error: "Missing sessionKey or token" }, { status: 400 });
  }

  // Resolve channel and chat
  const session = sessionKey ? ctx.sessions.get(sessionKey as SessionKey) : undefined;
  const channel = session?.lastChannel || (sessionKey ? sessionKey.split(":")[2] : undefined);
  const chatId = session?.lastChatId;

  if (!channel) {
    return Response.json({ error: "Cannot resolve channel from session" }, { status: 400 });
  }
  if (!chatId) {
    return Response.json({ error: "Cannot resolve chatId" }, { status: 400 });
  }

  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) {
    return Response.json({ error: `Channel plugin not found: ${channel}` }, { status: 404 });
  }

  // Check if channel supports message editing
  if (!channelPlugin.outbound.editMessage) {
    ctx.log.warn(`[message-edit] channel ${channel} does not support message editing`);
    return Response.json({ error: `Channel ${channel} does not support message editing` }, { status: 400 });
  }

  ctx.log.debug(`[message-edit] channel=${channel} chatId=${chatId} messageId=${messageId} text=${text.length} chars`);

  try {
    await channelPlugin.outbound.editMessage(chatId, messageId, text);

    return Response.json({
      ok: true,
      channel,
      messageId,
      textLength: text.length,
    });
  } catch (err: unknown) {
    ctx.log.error(`[message-edit] failed: ${(err instanceof Error ? err.message : String(err))}`);
    return Response.json({ error: err instanceof Error ? err.message : "Message edit failed" }, { status: 500 });
  }
}
