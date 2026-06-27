import type { MessageSource } from "../../../core/types.ts";
import { resolveAgentRoute, resolveSessionKey } from "../../../core/session-router.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import type {
  WechatAccountRuntime,
  WechatInboundMessage,
  WechatMessageContext,
  WechatInboundAttachment,
  WechatMessageItem,
  WechatTarget,
} from "./types.ts";
import { getWechatConfig, sendWechatTyping } from "./api.ts";
import { sendWechatText } from "./outbound.ts";
import { handleSlashCommand, buildSlashCommandContext, normalizeWechatCommandText } from "./commands.ts";
import { logger } from "./logger.ts";
import { recordWechatUser } from "./known-users.ts";
import { isWechatDebugMode } from "./debug-mode.ts";
import { sendWechatErrorNotice } from "./error-notice.ts";

const WECHAT_TYPING_KEEPALIVE_MS = 5000;

/**
 * Store context token for a user (userId -> token).
 */
function storeContextToken(
  runtime: WechatAccountRuntime,
  userId: string,
  token: string
): void {
  runtime.contextTokens.set(userId, token);
  runtime.contextTokens.set(`${runtime.accountId}:${userId}`, token);
  logger.debug(`[wechat:handlers] stored context token for userId=${userId}`);
}

/**
 * ilink inbound payloads use numeric item types; local mocks/docs may use strings.
 */
function isItemType(item: WechatMessageItem, kind: "text" | "image" | "voice" | "file" | "video"): boolean {
  const typeMap = {
    text: ["text", 1],
    image: ["image", 2],
    voice: ["voice", 3],
    file: ["file", 4],
    video: ["video", 5],
  } as const;
  return typeMap[kind].includes(item.type as never);
}

/**
 * Check if a message item is a media type.
 */
function isMediaItem(item: WechatMessageItem): boolean {
  return (
    isItemType(item, "image") ||
    isItemType(item, "video") ||
    isItemType(item, "file") ||
    isItemType(item, "voice")
  );
}

/**
 * Extract text from message item list.
 */
function bodyFromItemList(itemList?: WechatMessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (isItemType(item, "text") && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      // Quoted media is passed as MediaPath; only include current text
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      // Build quoted context
      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = bodyFromItemList([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      if (!parts.length) return text;
      return `[引用: ${parts.join(" | ")}]\n${text}`;
    }
    // Voice-to-text transcription
    if (isItemType(item, "voice") && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

/**
 * Extract media attachments from message items.
 */
function extractMediaAttachments(itemList?: WechatMessageItem[]): WechatInboundAttachment[] {
  if (!itemList?.length) return [];
  const attachments: WechatInboundAttachment[] = [];

  for (const item of itemList) {
    if (isItemType(item, "image") && item.image_item) {
      attachments.push({
        type: "image",
        encryptQueryParam: item.image_item.media.encrypt_query_param,
        aesKey: item.image_item.media.aes_key,
      });
    } else if (isItemType(item, "video") && item.video_item) {
      attachments.push({
        type: "video",
        encryptQueryParam: item.video_item.media.encrypt_query_param,
        aesKey: item.video_item.media.aes_key,
      });
    } else if (isItemType(item, "file") && item.file_item) {
      attachments.push({
        type: "file",
        encryptQueryParam: item.file_item.media.encrypt_query_param,
        aesKey: item.file_item.media.aes_key,
        filename: item.file_item.file_name,
      });
    } else if (isItemType(item, "voice") && item.voice_item) {
      attachments.push({
        type: "voice",
        encryptQueryParam: item.voice_item.media.encrypt_query_param,
        aesKey: item.voice_item.media.aes_key,
      });
    }
  }

  return attachments;
}

/**
 * Parse an ilink message into internal context.
 */
export function parseWechatMessage(
  msg: WechatInboundMessage,
  accountId?: string
): WechatMessageContext | null {
  const fromUserId = msg.from_user_id;
  if (!fromUserId) return null;

  const text = bodyFromItemList(msg.item_list);
  const attachments = extractMediaAttachments(msg.item_list);
  const messageId = String(msg.message_id ?? msg.msg_id ?? `${fromUserId}-${msg.create_time_ms}`);

  // Store context token for outbound replies
  const contextToken = msg.context_token;

  return {
    chatType: "direct",
    peerType: "c2c",
    chatId: fromUserId,
    senderId: fromUserId,
    text,
    messageId,
    mentionedBot: true, // Weixin DMs are always directed
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: msg.create_time_ms,
    contextToken,
  };
}

/**
 * Check DM policy for a sender.
 */
function checkDmPolicy(
  runtime: WechatAccountRuntime,
  senderId: string
): "allowed" | "pairing" | "blocked" {
  const policy = (runtime.dmPolicy ?? "pairing") as DmPolicy;
  if (policy === "disabled") return "blocked";
  if (
    isSenderAllowed(
      "wechat",
      senderId,
      policy,
      runtime.allowFrom,
      runtime.accountId || "default"
    )
  ) {
    return "allowed";
  }
  if (policy === "pairing") return "pairing";
  return "blocked";
}

/**
 * Build a WechatTarget from context.
 */
function buildTarget(ctx: WechatMessageContext): WechatTarget {
  return {
    peerType: ctx.peerType,
    id: ctx.chatId,
    msgId: ctx.messageId,
    contextToken: ctx.contextToken,
  };
}

async function ensureTypingTicket(
  runtime: WechatAccountRuntime,
  userId: string,
  contextToken?: string,
): Promise<string | undefined> {
  const cacheKey = `${userId}:${contextToken ?? ""}`;
  runtime.typingTickets ??= new Map();
  const cached = runtime.typingTickets.get(cacheKey) ?? runtime.typingTicket;
  if (cached) return cached;

  const config = await getWechatConfig(runtime, userId, contextToken);
  if (config.typingTicket) {
    runtime.typingTickets.set(cacheKey, config.typingTicket);
    runtime.typingTicket = config.typingTicket;
  }
  return config.typingTicket;
}

/**
 * Handle an inbound message from ilink getUpdates.
 */
export async function handleWechatMessage(
  runtime: WechatAccountRuntime,
  msg: WechatInboundMessage
): Promise<void> {
  const receivedAt = Date.now();
  const ctx = parseWechatMessage(msg, runtime.accountId);
  if (!ctx) {
    logger.warn("[wechat:handlers] message ignored: could not parse");
    return;
  }

  // Store context token for replies
  if (ctx.contextToken) {
    storeContextToken(runtime, ctx.senderId, ctx.contextToken);
  }

  logger.info(
    `[wechat:handlers] inbound: sender=${ctx.senderId} text=${JSON.stringify(ctx.text.slice(0, 120))}`
  );

  // Skip empty content
  if (!ctx.text.trim() && !(ctx.attachments?.length)) {
    logger.info("[wechat:handlers] message dropped: empty content");
    return;
  }

  const commandText = normalizeWechatCommandText(ctx.text);

  // Slash command handling
  if (commandText.trim().startsWith("/")) {
    const slashCtx = buildSlashCommandContext(runtime, ctx.senderId, ctx.contextToken, async (text) => {
      await sendWechatText(runtime, `c2c|${ctx.senderId}`, text);
    }, receivedAt);
    
    const { handled } = await handleSlashCommand(commandText, slashCtx);
    if (handled) {
      logger.info(`[wechat:handlers] slash command handled: ${commandText.split(/\s+/)[0]}`);
      return;
    }
  }

  // DM policy check
  const dm = checkDmPolicy(runtime, ctx.senderId);
  logger.info(`[wechat:handlers] DM policy result: ${dm} sender=${ctx.senderId}`);

  if (dm === "blocked") {
    logger.warn(`[wechat:handlers] message dropped: dm blocked sender=${ctx.senderId}`);
    return;
  }

  if (dm === "pairing") {
    const code = createPairingRequest(
      "wechat",
      ctx.senderId,
      ctx.senderName,
      runtime.accountId || "default"
    );
    const target = buildTarget(ctx);
    logger.info(
      `[wechat:handlers] pairing response: sender=${ctx.senderId} code=${code ?? "none"}`
    );
    await sendWechatText(
      runtime,
      `c2c|${target.id}`,
      code ? `配对验证中。验证码: ${code}` : "等待配对请求过多，请稍后重试。"
    );
    return;
  }

  // Build source for routing
  const source: MessageSource = {
    channel: "wechat",
    accountId: runtime.accountId,
    chatType: "dm",
    chatId: ctx.senderId,
    senderId: ctx.senderId,
    senderName: ctx.senderName,
    messageId: ctx.messageId,
    timestamp: ctx.timestamp,
  };

  const route = resolveAgentRoute(source, commandText, runtime.api.config);
  logger.info(
    `[wechat:handlers] route resolved: agent=${route.agentId} text=${JSON.stringify(
      (route.text || "").slice(0, 120)
    )}`
  );

  const routedSource: MessageSource = { ...source, agentId: route.agentId };
  const sessionKey = resolveSessionKey(routedSource, runtime.api.config, route.agentId);
  const target = buildTarget(ctx);

  // Update timestamps
  runtime.lastInboundAt = Date.now();
  runtime.lastEventAt = runtime.lastInboundAt;

  // 记录已知用户交互（异步，不阻塞消息处理）
  recordWechatUser(ctx.senderId, "c2c", runtime.accountId, ctx.senderName);

  logger.info(`[wechat:handlers] dispatching: session=${sessionKey} target=${target.id}`);

  // TODO: Add streaming support (similar to QQBot)
  const debug = isWechatDebugMode(runtime.accountId);
  const inboundAt = receivedAt;

  let typingInterval: ReturnType<typeof setInterval> | null = null;
  let typingActive = false;

  const sendTypingState = async (typing: boolean): Promise<boolean> => {
    try {
      const ticket = await ensureTypingTicket(runtime, target.id, ctx.contextToken);
      if (!ticket) return false;
      await sendWechatTyping(runtime, {
        ilink_user_id: target.id,
        typing_ticket: ticket,
        status: typing ? 1 : 2,
      });
      return true;
    } catch (err) {
      logger.warn(`[wechat:handlers] sendTyping failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const startTypingKeepalive = async (): Promise<void> => {
    if (typingInterval) return;
    const started = await sendTypingState(true);
    if (!started) return;
    typingActive = true;
    typingInterval = setInterval(() => {
      void sendTypingState(true);
    }, WECHAT_TYPING_KEEPALIVE_MS);
  };

  const stopTypingKeepalive = async (): Promise<void> => {
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    if (!typingActive) return;
    typingActive = false;
    await sendTypingState(false);
  };

  try {
    await runtime.api.dispatch({
      source: routedSource,
      sessionKey,
      text: route.text,
      respond: async (reply: string) => {
        logger.info(`[wechat:handlers] respond called: len=${reply.length}`);
        if (!reply.trim()) {
          logger.info("[wechat:handlers] respond skipped: empty reply");
          return;
        }

        runtime.lastOutboundAt = Date.now();
        runtime.lastEventAt = runtime.lastOutboundAt;

        let output = reply;
        if (debug) {
          const ms = Date.now() - inboundAt;
          output = `${reply}\n\n⏱ AI处理耗时: ${ms}ms`;
        }

        await sendWechatText(runtime, `c2c|${target.id}`, output);
      },
      setTyping: async (typing: boolean) => {
        if (typing) await startTypingKeepalive();
        else await stopTypingKeepalive();
      },
    });
  } finally {
    await stopTypingKeepalive();
  }
}
