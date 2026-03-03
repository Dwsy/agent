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
import { resolveChannelTarget } from "./channel-target.ts";
import { splitMessage } from "../core/utils.ts";

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
  let text = typeof body.text === "string" ? body.text : "";
  let replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : undefined;
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

  const target = resolveChannelTarget(channel, chatId, sessionKey, session);

  // Find channel plugin
  const channelPlugin = ctx.registry.channels.get(channel);
  if (!channelPlugin) {
    return Response.json({ error: `Channel plugin not found: ${channel}` }, { status: 404 });
  }

  const maxLength = channelPlugin.outbound.maxLength;

  ctx.log.info(
    `[message-send] channel=${channel} target=${target} text=${text.length} chars replyTo=${replyTo ?? "none"} maxLength=${maxLength ?? "n/a"}`,
  );

  // Tool hook integration for send_message
  const toolInterceptor = new ToolCallInterceptor(ctx, sessionKey);
  ctx.log.info(`[message-send] Calling beforeCall hook, sessionKey=${sessionKey}`);
  await toolInterceptor.beforeCall("send_message", { text, replyTo, parseMode });
  ctx.log.info(`[message-send] beforeCall hook completed`);
  
  // Apply hook modifications
  text = toolInterceptor.getText();
  replyTo = toolInterceptor.getReplyTo();

  try {
    const chunks = maxLength && maxLength > 0
      ? splitMessage(text, maxLength)
      : [text];

    ctx.log.info(`[message-send] prepared chunks=${chunks.length} maxLength=${maxLength ?? "none"}`);

    // WebChat: broadcast via WS (sendText is no-op for webchat plugin)
    if (channel === "webchat" && ctx.broadcastToWs) {
      for (const chunk of chunks) {
        ctx.broadcastToWs("message_event", {
          sessionKey,
          type: "text",
          text: chunk,
          replyTo: replyTo ?? null,
          parseMode: parseMode ?? null,
          timestamp: Date.now(),
        });
      }
      ctx.log.info(`[message-send] WebChat message_event broadcast for ${sessionKey} chunks=${chunks.length}`);

      await toolInterceptor.afterCall({ ok: true, textLength: text.length, chunkCount: chunks.length }, false);
      return Response.json({
        ok: true,
        channel,
        textLength: text.length,
        chunkCount: chunks.length,
        delivered: true,
        replyTo: replyTo ?? null,
      });
    }

    let firstMessageId: string | undefined;
    let lastMessageId: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkReplyTo = i === 0 ? replyTo : undefined;
      const result = await channelPlugin.outbound.sendText(target, chunk, { replyTo: chunkReplyTo, parseMode });

      if (!result.ok) {
        const error = result.error ?? "Message delivery failed";
        await toolInterceptor.afterCall(
          {
            ok: false,
            textLength: text.length,
            chunkCount: chunks.length,
            failedChunk: i + 1,
            error,
            messageId: firstMessageId ?? null,
          },
          true,
        );
        return Response.json(
          {
            ok: false,
            channel,
            error,
            textLength: text.length,
            chunkCount: chunks.length,
            failedChunk: i + 1,
            messageId: firstMessageId ?? null,
            replyTo: replyTo ?? null,
          },
          { status: 502 },
        );
      }

      if (result.messageId && !firstMessageId) firstMessageId = result.messageId;
      if (result.messageId) lastMessageId = result.messageId;
    }

    await toolInterceptor.afterCall(
      {
        ok: true,
        textLength: text.length,
        chunkCount: chunks.length,
        messageId: firstMessageId ?? null,
        lastMessageId: lastMessageId ?? null,
      },
      false,
    );

    if (sessionKey) ctx.onDelivered?.(sessionKey);

    return Response.json({
      ok: true,
      channel,
      textLength: text.length,
      chunkCount: chunks.length,
      messageId: firstMessageId ?? null,
      lastMessageId: lastMessageId ?? null,
      replyTo: replyTo ?? null,
    });
  } catch (err: unknown) {
    ctx.log.error(`[message-send] delivery failed: ${(err instanceof Error ? err.message : String(err))}`);
    await toolInterceptor.afterCall({ error: err instanceof Error ? err.message : "Unknown error" }, true);
    return Response.json({ error: err instanceof Error ? err.message : "Message delivery failed" }, { status: 500 });
  }
}

// ============================================================================
// Tool Call Interceptor
// ============================================================================

/**
 * Tool Call Interceptor
 * 
 * Encapsulates before/after hook logic for tool calls.
 * Provides clean API for hook integration.
 */
class ToolCallInterceptor {
  private modifiedArgs: Record<string, unknown> = {};

  constructor(
    private ctx: MessageSendContext,
    private sessionKey: string | undefined
  ) {}

  /**
   * Dispatch before_tool_call hook
   */
  async beforeCall(toolName: string, args: Record<string, unknown>): Promise<void> {
    if (!this.sessionKey) return;

    const payload = {
      sessionKey: this.sessionKey,
      toolName,
      args: { ...args },
    };

    await this.ctx.registry.hooks.dispatch("before_tool_call", payload);
    
    // Store modified args for later retrieval
    this.modifiedArgs = payload.args || args;
  }

  /**
   * Dispatch after_tool_call hook
   */
  async afterCall(result: unknown, isError: boolean): Promise<void> {
    if (!this.sessionKey) return;

    await this.ctx.registry.hooks.dispatch("after_tool_call", {
      sessionKey: this.sessionKey,
      toolName: "send_message",
      result,
      isError,
    });
  }

  /**
   * Get modified text from hooks
   */
  getText(): string {
    return String(this.modifiedArgs?.text ?? "");
  }

  /**
   * Get modified replyTo from hooks
   */
  getReplyTo(): string | undefined {
    return this.modifiedArgs?.replyTo as string | undefined;
  }
}
