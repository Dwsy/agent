/**
 * POST /api/message/send — Direct text message delivery via channel plugins (v3.4 T1)
 *
 * Called by the gateway-tools extension's send_message tool.
 * Supports plain text and reply-to-message modes.
 *
 * Auth: internalToken (HMAC-SHA256, per-process) OR active sessionKey.
 */

import type { Config } from "../core/config.ts";
import type { SessionKey, Logger } from "../core/types.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";
import { getGatewayInternalToken } from "./media-send.ts";

export interface MessageSendContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
  broadcastToWs?: (event: string, payload: unknown) => void;
  /** Called after successful delivery — used to track cron self-delivery. */
  onDelivered?: (sessionKey: string) => void;
}

export async function handleMessageSendRequest(
  req: Request,
  ctx: MessageSendContext,
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
  const text = typeof body.text === "string" ? body.text : "";
  const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : undefined;
  const parseMode = typeof body.parseMode === "string" ? body.parseMode as "Markdown" | "HTML" | "plain" : undefined;

  if (!text) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  // Auth: verify via active session OR internal token
  if (sessionKey) {
    if (!ctx.pool.getForSession(sessionKey as SessionKey)) {
      return Response.json({ error: "Invalid or inactive session" }, { status: 403 });
    }
  } else if (internalToken) {
    const expected = getGatewayInternalToken(ctx.config);
    if (internalToken !== expected) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }
    // Resolve session key from caller PID
    if (callerPid > 0) {
      const client = ctx.pool.getByPid(callerPid);
      if (client?.sessionKey) {
        sessionKey = client.sessionKey;
        ctx.log.info(`[message-send] resolved session from PID ${callerPid}: ${sessionKey}`);
      } else {
        ctx.log.warn(`[message-send] PID ${callerPid} not found in pool — cannot resolve session`);
      }
    }
  } else {
    return Response.json({ error: "Missing sessionKey or token" }, { status: 400 });
  }

  // Resolve channel + chatId from session
  const session = sessionKey ? ctx.sessions.get(sessionKey as SessionKey) : undefined;
  const channel = session?.lastChannel || (sessionKey ? sessionKey.split(":")[2] : undefined);
  const chatId = session?.lastChatId;

  if (!channel) {
    ctx.log.warn(`[message-send] no channel: sessionKey=${sessionKey} lastChannel=${session?.lastChannel} sessionExists=${!!session}`);
    return Response.json({ error: "Cannot resolve channel from session" }, { status: 400 });
  }
  if (!chatId) {
    return Response.json({ error: "Cannot resolve chatId — no messages received in this session yet" }, { status: 400 });
  }

  // Find channel plugin
  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) {
    return Response.json({ error: `Channel plugin not found: ${channel}` }, { status: 404 });
  }

  ctx.log.info(`[message-send] channel=${channel} chatId=${chatId} text=${text.length} chars replyTo=${replyTo ?? "none"}`);

  try {
    // WebChat: broadcast via WS (sendText is no-op for webchat plugin)
    if (channel === "webchat" && ctx.broadcastToWs) {
      ctx.broadcastToWs("message_event", {
        sessionKey,
        type: "text",
        text,
        replyTo: replyTo ?? null,
        parseMode: parseMode ?? null,
        timestamp: Date.now(),
      });
      ctx.log.info(`[message-send] WebChat message_event broadcast for ${sessionKey}`);
      return Response.json({ ok: true, channel, textLength: text.length, delivered: true });
    }

    await channelPlugin.outbound.sendText(chatId, text, { replyTo, parseMode });

    if (sessionKey) ctx.onDelivered?.(sessionKey);

    return Response.json({
      ok: true,
      channel,
      textLength: text.length,
      replyTo: replyTo ?? null,
    });
  } catch (err: unknown) {
    ctx.log.error(`[message-send] delivery failed: ${(err instanceof Error ? err.message : String(err))}`);
    return Response.json({ error: err instanceof Error ? err.message : "Message delivery failed" }, { status: 500 });
  }
}
