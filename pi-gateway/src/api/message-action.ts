/**
 * POST /api/message/action — Message actions (react/edit/delete) via channel plugins (v3.6)
 *
 * Called by the gateway-tools extension's `message` tool.
 * Supports react (emoji), edit (text), and delete actions on existing messages.
 *
 * Auth: internalToken (HMAC-SHA256, per-process) OR active sessionKey.
 */

import type { Config } from "../core/config.ts";
import type { SessionKey, Logger } from "../core/types.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";
import { getGatewayInternalToken } from "./media-send.ts";

export interface MessageActionContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
}

const VALID_ACTIONS = ["react", "edit", "delete", "pin", "read"] as const;
type ActionType = (typeof VALID_ACTIONS)[number];

export async function handleMessageAction(
  req: Request,
  ctx: MessageActionContext,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() as ActionType : "";
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  let sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const internalToken = typeof body.token === "string" ? body.token.trim() : "";
  const callerPid = typeof body.pid === "number" ? body.pid : 0;

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action)) {
    return Response.json(
      { error: `Invalid action: "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!messageId && action !== "read") {
    return Response.json({ error: "Missing messageId" }, { status: 400 });
  }

  // Action-specific validation
  if (action === "react") {
    const emoji = body.emoji;
    if (!emoji || (typeof emoji === "string" && !emoji.trim()) ||
        (Array.isArray(emoji) && emoji.length === 0)) {
      return Response.json({ error: "Missing emoji for react action" }, { status: 400 });
    }
  }

  if (action === "edit") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text) {
      return Response.json({ error: "Missing text for edit action" }, { status: 400 });
    }
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
    if (callerPid > 0) {
      const client = ctx.pool.getByPid(callerPid);
      if (client?.sessionKey) {
        sessionKey = client.sessionKey;
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
    return Response.json({ error: "Cannot resolve channel from session" }, { status: 400 });
  }
  if (!chatId) {
    return Response.json({ error: "Cannot resolve chatId from session" }, { status: 400 });
  }

  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) {
    return Response.json({ error: `Channel plugin not found: ${channel}` }, { status: 404 });
  }

  ctx.log.info(`[message-action] ${action} channel=${channel} chatId=${chatId} messageId=${messageId}`);

  try {
    if (action === "react") {
      if (!channelPlugin.outbound.sendReaction) {
        return Response.json({ error: `Channel "${channel}" does not support reactions` }, { status: 501 });
      }
      const emoji = Array.isArray(body.emoji)
        ? body.emoji.filter((e): e is string => typeof e === "string" && e.trim() !== "")
        : typeof body.emoji === "string" ? body.emoji.trim() : "";
      const remove = body.remove === true;
      const result = await channelPlugin.outbound.sendReaction(chatId, messageId, emoji, { remove });
      if (!result.ok) {
        return Response.json({ error: result.error ?? "Reaction failed" }, { status: 502 });
      }
      return Response.json({ ok: true, action, channel, messageId, emoji, remove });
    }

    if (action === "edit") {
      if (!channelPlugin.outbound.editMessage) {
        return Response.json({ error: `Channel "${channel}" does not support message editing` }, { status: 501 });
      }
      const text = typeof body.text === "string" ? body.text : "";
      const result = await channelPlugin.outbound.editMessage(chatId, messageId, text);
      if (!result.ok) {
        return Response.json({ error: result.error ?? "Edit failed" }, { status: 502 });
      }
      return Response.json({ ok: true, action, channel, messageId, textLength: text.length });
    }

    if (action === "delete") {
      if (!channelPlugin.outbound.deleteMessage) {
        return Response.json({ error: `Channel "${channel}" does not support message deletion` }, { status: 501 });
      }
      const result = await channelPlugin.outbound.deleteMessage(chatId, messageId);
      if (!result.ok) {
        return Response.json({ error: result.error ?? "Delete failed" }, { status: 502 });
      }
      return Response.json({ ok: true, action, channel, messageId });
    }

    if (action === "pin") {
      if (!channelPlugin.outbound.pinMessage) {
        return Response.json({ error: `Channel "${channel}" does not support pinning` }, { status: 501 });
      }
      const unpin = body.unpin === true;
      const result = await channelPlugin.outbound.pinMessage(chatId, messageId, unpin);
      if (!result.ok) {
        return Response.json({ error: result.error ?? "Pin failed" }, { status: 502 });
      }
      return Response.json({ ok: true, action, channel, messageId, unpin });
    }

    if (action === "read") {
      if (!channelPlugin.outbound.readHistory) {
        return Response.json({ error: `Channel "${channel}" does not support read history` }, { status: 501 });
      }
      const limit = typeof body.limit === "number" ? Math.min(body.limit, 100) : 20;
      const before = typeof body.before === "string" ? body.before : undefined;
      const result = await channelPlugin.outbound.readHistory(chatId, limit, before);
      if (!result.ok) {
        return Response.json({ error: result.error ?? "Read history failed" }, { status: 502 });
      }
      return Response.json({ ok: true, action, channel, messages: result.messages ?? [] });
    }

    return Response.json({ error: "Unhandled action" }, { status: 400 });
  } catch (err: unknown) {
    ctx.log.error(`[message-action] ${action} failed: ${(err instanceof Error ? err.message : String(err))}`);
    return Response.json({ error: err instanceof Error ? err.message : "Action failed" }, { status: 500 });
  }
}
