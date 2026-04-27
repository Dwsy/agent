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
import { canPostMessage, supportsMessageEdit } from "./channel-capabilities.ts";
import { splitMessage, shouldBypassSplitForChannel } from "../core/utils.ts";
import { normalizeStreamHints } from "./message-send-normalizer.ts";

export interface MessageSendContext {
  config: Config;
  pool: RpcPool;
  registry: PluginRegistryState;
  sessions: SessionStore;
  log: Logger;
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
  let resolvedRpcId: string | undefined;
  let replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : undefined;
  const parseMode = typeof body.parseMode === "string" ? body.parseMode as "Markdown" | "HTML" | "plain" : undefined;
  let streamMode = typeof body.streamMode === "string" ? body.streamMode : undefined;
  let streamId: string | number | undefined;
  if ((typeof body.streamId === "string" && body.streamId.trim()) || typeof body.streamId === "number") {
    streamId = body.streamId as string | number;
  }
  // Legacy compatibility for old clients
  const rawDraftId = typeof body.draftId === "number" && Number.isFinite(body.draftId) && body.draftId > 0
    ? Math.floor(body.draftId)
    : undefined;

  const streamIndex = typeof body.streamIndex === "number" && Number.isFinite(body.streamIndex)
    ? Math.max(0, Math.floor(body.streamIndex))
    : undefined;
  const streamReset = typeof body.streamReset === "boolean" ? body.streamReset : undefined;
  const streamFinal = typeof body.streamFinal === "boolean" ? body.streamFinal : undefined;

  let channelMeta = body.channelMeta && typeof body.channelMeta === "object"
    ? body.channelMeta as Record<string, unknown>
    : undefined;

  if (!text) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  // Auth: verify via active session OR internal token
  if (sessionKey) {
    const activeClient = ctx.pool.getForSession(sessionKey as SessionKey);
    if (!activeClient) {
      return Response.json({ error: "Invalid or inactive session" }, { status: 403 });
    }
    resolvedRpcId = activeClient.id;
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
        resolvedRpcId = client.id;
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
  if (!canPostMessage(channelPlugin)) {
    return Response.json({ error: `Channel ${channel} does not support posting messages` }, { status: 501 });
  }

  const target = resolveChannelTarget(channelPlugin, chatId, sessionKey, session);

  const pluginId = ((channelPlugin as { __pluginId?: string }).__pluginId) ?? channelPlugin.id;
  const accountId = session?.lastAccountId ?? "n/a";
  const rpcId = resolvedRpcId ?? session?.rpcProcessId ?? ctx.pool.getForSession(sessionKey as SessionKey)?.id ?? "none";
  const maxLength = channelPlugin.outbound.maxLength;

  // Get default streamMode from channel config if not provided
  if (!streamMode) {
    const channelCfg = (ctx.config.channels as Record<string, unknown> | undefined)?.[channel] as Record<string, unknown> | undefined;
    const accountCfg = session?.lastAccountId && channelCfg
      ? (channelCfg.accounts as Record<string, Record<string, unknown>> | undefined)?.[session.lastAccountId]
      : undefined;
    // Priority: account.streamMode > channel.streamMode > undefined
    streamMode = (accountCfg?.streamMode ?? channelCfg?.streamMode) as "off" | "partial" | "block" | "draft" | undefined;
  }

  // Draft mode only works in private chats (DM). Group chats have negative chatId.
  // Auto-downgrade draft to partial for group chats (partial uses editMessageText).
  if (streamMode === "draft" && chatId.startsWith("-")) {
    ctx.log.info(`[message-send] draft mode not available for group chat=${chatId}, falling back to partial`);
    streamMode = "partial";
  }

  // If channel doesn't support message editing, downgrade partial/draft to off.
  // This prevents send-message extension from attempting edit operations that will fail.
  if ((streamMode === "partial" || streamMode === "draft") && !supportsMessageEdit(channelPlugin)) {
    ctx.log.info(`[message-send] channel ${channel} does not support message editing, downgrade streamMode=${streamMode} to off`);
    streamMode = "off";
  }

  if (streamMode) {
    ctx.log.info(`[message-send] using streamMode=${streamMode}`);
  }

  ctx.log.info(
    `[message-send] channel=${channel} plugin=${pluginId} account=${accountId} rpc=${rpcId} target=${target} text=${text.length} chars replyTo=${replyTo ?? "none"} maxLength=${maxLength ?? "n/a"}`,
  );

  // Tool hook integration for send_message
  const toolInterceptor = new ToolCallInterceptor(ctx, sessionKey);
  ctx.log.info(`[message-send] Calling beforeCall hook, sessionKey=${sessionKey}`);
  await toolInterceptor.beforeCall("send_message", {
    text,
    replyTo,
    parseMode,
    streamMode,
    streamId,
    draftId: rawDraftId,
    channelMeta,
  });
  ctx.log.info(`[message-send] beforeCall hook completed`);
  
  // Apply hook modifications
  text = toolInterceptor.getText();
  replyTo = toolInterceptor.getReplyTo();
  streamMode = toolInterceptor.getStreamMode() ?? streamMode;
  streamId = toolInterceptor.getStreamId() ?? streamId;
  const legacyDraftId = toolInterceptor.getLegacyStreamId() ?? rawDraftId;
  channelMeta = toolInterceptor.getChannelMeta() ?? channelMeta;

  const normalizedStream = normalizeStreamHints({
    streamMode,
    streamId,
    channelMeta,
    legacyStreamId: legacyDraftId,
  });

  try {
    const normalizedChannelMeta = normalizedStream.channelMeta;
    const bypassSplit = shouldBypassSplitForChannel(text, maxLength, normalizedChannelMeta);

    const chunks = bypassSplit
      ? [text]
      : maxLength && maxLength > 0
        ? splitMessage(text, maxLength)
        : [text];

    const effectiveStreamMode = normalizedStream.streamMode;
    const effectiveStreamId = normalizedStream.streamId;

    ctx.log.info(
      `[message-send] prepared chunks=${chunks.length} maxLength=${maxLength ?? "none"} streamMode=${effectiveStreamMode ?? "none"} bypassSplit=${bypassSplit}`,
    );

    let firstMessageId: string | undefined;
    let lastMessageId: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkReplyTo = i === 0 ? replyTo : undefined;

      // Merge per-chunk stream sequencing into channelMeta for the plugin.
      // When the caller provides streamIndex/Reset/Final (e.g. from the send_message tool),
      // pass them through so QQBot can consume native stream hints.
      const chunkChannelMeta = (streamIndex !== undefined || streamReset !== undefined || streamFinal !== undefined)
        ? {
            ...normalizedChannelMeta,
            ...(streamIndex !== undefined && { streamIndex: chunks.length === 1 ? streamIndex : streamIndex + i }),
            ...(streamReset !== undefined && { streamReset: chunks.length === 1 ? streamReset : i === 0 && streamReset }),
            ...(streamFinal !== undefined && { streamFinal: chunks.length === 1 ? streamFinal : i === chunks.length - 1 && streamFinal }),
          }
        : normalizedChannelMeta;

      const result = await channelPlugin.outbound.sendText(target, chunk, {
        sessionKey,
        replyTo: chunkReplyTo,
        parseMode,
        streamMode: effectiveStreamMode,
        streamId: effectiveStreamId,
        draftId: legacyDraftId,
        channelMeta: chunkChannelMeta,
      });

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
      streamMode: effectiveStreamMode ?? null,
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

  getStreamMode(): string | undefined {
    const raw = this.modifiedArgs?.streamMode;
    return typeof raw === "string" ? raw : undefined;
  }

  getStreamId(): string | number | undefined {
    const raw = this.modifiedArgs?.streamId;
    if (typeof raw === "string") return raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    return undefined;
  }

  getLegacyStreamId(): number | undefined {
    const raw = this.modifiedArgs?.draftId;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return undefined;
  }

  getChannelMeta(): Record<string, unknown> | undefined {
    const raw = this.modifiedArgs?.channelMeta;
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined;
  }
}


