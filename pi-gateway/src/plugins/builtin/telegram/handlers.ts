import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import type { ImageContent, MessageSource } from "../../../core/types.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { splitMessage } from "../../../core/utils.ts";
import { refreshPiCommands } from "./commands.ts";
import { resolveStreamCompat } from "./config-compat.ts";
import { escapeHtml, markdownToTelegramHtml, splitTelegramText } from "./format.ts";
import { downloadTelegramFile } from "./media-download.ts";
import { parseOutboundMediaDirectives, sendTelegramMedia, sendTelegramTextAndMedia, IMAGE_EXTS, AUDIO_EXTS } from "./media-send.ts";
import { migrateTelegramGroupConfig } from "./group-migration.ts";
import { buildReactionText } from "./reaction-level.ts";
import { recordSentMessage, wasRecentlySent } from "./sent-message-cache.ts";
import type { MediaSendOptions, MediaSendResult } from "../../types.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramDebouncedEntry,
  TelegramMessage,
  TelegramPendingMediaGroup,
  TelegramPluginRuntime,
} from "./types.ts";

function clipInline(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function codeInline(text: string, max = 160): string {
  return `\`${clipInline(text, max).replace(/`/g, "'")}\``;
}

function pickArgString(args: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!args) return null;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function formatToolStartLine(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case "read": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `read ${codeInline(path)}` : "read";
    }
    case "write": {
      const path = pickArgString(args, ["path", "filePath", "file", "outputPath"]);
      return path ? `write ${codeInline(path)}` : "write";
    }
    case "edit":
    case "multi_edit": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `${toolName} ${codeInline(path)}` : toolName;
    }
    case "bash": {
      const command = pickArgString(args, ["command", "cmd"]);
      return command ? `bash ${codeInline(command, 180)}` : "bash";
    }
    default: {
      const payload = args ? clipInline(JSON.stringify(args), 120) : "";
      return payload ? `${toolName} ${codeInline(payload, 120)}` : toolName;
    }
  }
}

function chatType(chatType?: string): "dm" | "group" {
  return chatType === "private" ? "dm" : "group";
}

function buildSource(account: TelegramAccountRuntime, ctx: TelegramContext, message?: TelegramMessage): MessageSource {
  const msg = message ?? ctx.message ?? ctx.update?.edited_message;
  const groupLike = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  return {
    channel: "telegram",
    accountId: account.accountId,
    chatType: groupLike ? "group" : "dm",
    chatId: String(ctx.chat?.id ?? msg?.chat?.id ?? ""),
    topicId: msg?.message_thread_id ? String(msg.message_thread_id) : undefined,
    senderId: String(ctx.from?.id ?? msg?.from?.id ?? "unknown"),
    senderName: ctx.from?.username ?? ctx.from?.first_name ?? msg?.from?.username ?? msg?.from?.first_name,
  };
}

function isGroupChat(ctx: TelegramContext): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

export function parseTelegramTarget(target: string, defaultAccountId: string): {
  accountId: string;
  chatId: string;
  topicId?: string;
} {
  const clean = target.trim();
  const m = clean.match(/^([^:]+):([^:]+)(?::topic:(\d+))?$/);
  if (m) {
    return {
      accountId: m[1] || defaultAccountId,
      chatId: m[2] || "",
      topicId: m[3],
    };
  }
  return { accountId: defaultAccountId, chatId: clean };
}

async function resolveImagesFromMessage(account: TelegramAccountRuntime, msg: TelegramMessage): Promise<{ images: ImageContent[]; documentContext?: string }> {
  const images: ImageContent[] = [];
  let documentContext: string | undefined;
  const maxMb = Math.max(1, account.cfg.mediaMaxMb ?? 10);
  const maxBytes = maxMb * 1024 * 1024;

  console.log(`[telegram-media] resolveImages: photo=${msg.photo?.length ?? 0} document=${msg.document?.file_id ? 'yes' : 'no'} sticker=${msg.sticker ? 'yes' : 'no'}`);

  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    console.log(`[telegram-media] downloading photo: file_id=${largest?.file_id?.slice(0, 20)}... maxBytes=${maxBytes}`);
    if (largest?.file_id) {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: largest.file_id,
        maxBytes,
      });
      console.log(`[telegram-media] photo download result: ${downloaded ? `${downloaded.mimeType} ${downloaded.data.length} chars base64` : 'null'}`);
      if (downloaded && downloaded.mimeType.startsWith("image/")) {
        images.push({ type: "image", data: downloaded.data, mimeType: downloaded.mimeType });
      }
    }
  }

  if (msg.document?.file_id) {
    const downloaded = await downloadTelegramFile({
      token: account.token,
      fileId: msg.document.file_id,
      maxBytes,
    });
    if (downloaded) {
      if (downloaded.mimeType.startsWith("image/")) {
        images.push({ type: "image", data: downloaded.data, mimeType: downloaded.mimeType });
      }
      // Non-image documents: store metadata for text context
      if (!downloaded.mimeType.startsWith("image/")) {
        const fileName = msg.document.file_name ?? "unknown";
        const mimeType = msg.document.mime_type ?? downloaded.mimeType;
        // For text-based documents, decode content and attach as context
        if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") {
          try {
            const textContent = Buffer.from(downloaded.data, "base64").toString("utf-8");
            const truncated = textContent.length > 10000 ? textContent.slice(0, 10000) + "\n...(truncated)" : textContent;
            documentContext = `[Document: ${fileName} (${mimeType})]\n\`\`\`\n${truncated}\n\`\`\``;
          } catch {
            documentContext = `[Document: ${fileName} (${mimeType}, ${downloaded.data.length} bytes base64)]`;
          }
        } else {
          documentContext = `[Document: ${fileName} (${mimeType}, binary file — content not readable)]`;
        }
      }
    }
  }

  return { images, documentContext };
}

function shouldAllowGroupMessage(account: TelegramAccountRuntime, ctx: TelegramContext, text: string): { allowed: boolean; text: string } {
  const chatId = String(ctx.chat?.id ?? "");
  const groupCfg = account.cfg.groups?.[chatId] ?? account.cfg.groups?.["*"];
  let finalText = text;

  if (groupCfg?.enabled === false) {
    return { allowed: false, text: finalText };
  }

  const mentionRequired = groupCfg?.requireMention !== false;
  if (mentionRequired) {
    const username = account.botUsername ?? "";
    if (username && !finalText.includes(`@${username}`)) {
      return { allowed: false, text: finalText };
    }
    if (username) {
      finalText = finalText.replace(new RegExp(`@${username}`, "gi"), "").trim();
    }
  }

  const policy = groupCfg?.groupPolicy ?? account.cfg.groupPolicy ?? "open";
  if (policy === "disabled") return { allowed: false, text: finalText };
  if (policy === "allowlist") {
    const senderId = String(ctx.from?.id ?? "unknown");
    const allow = (groupCfg?.allowFrom ?? account.cfg.groupAllowFrom ?? []).map((v) => String(v));
    if (!allow.includes("*") && !allow.includes(senderId)) {
      return { allowed: false, text: finalText };
    }
  }

  return { allowed: true, text: finalText };
}

// Per-account lazy command registration flag
const commandsRegistered = new Map<string, boolean>();
const commandsRetryCount = new Map<string, number>();
const MAX_COMMAND_RETRIES = 3;

async function dispatchAgentTurn(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  source: MessageSource;
  sessionKey: string;
  text: string;
  images: ImageContent[];
  inboundMessageId?: number;
}): Promise<void> {
  const { runtime, account, ctx, source, sessionKey, text, images } = params;

  // Lazy: refresh pi commands on first real message per account (retry up to 3 times on failure)
  if (!commandsRegistered.get(account.accountId)) {
    const retries = commandsRetryCount.get(account.accountId) ?? 0;
    if (retries < MAX_COMMAND_RETRIES) {
      commandsRetryCount.set(account.accountId, retries + 1);
      refreshPiCommands(account, runtime.api.config).then(count => {
        if (count !== null) {
          commandsRegistered.set(account.accountId, true);
          runtime.api.logger.info(`[telegram:${account.accountId}] Lazy-registered ${count} pi commands`);
        } else {
          runtime.api.logger.warn(`[telegram:${account.accountId}] refreshPiCommands failed (attempt ${retries + 1}/${MAX_COMMAND_RETRIES})`);
        }
      }).catch(() => {});
    }
  }
  const streamCfg = resolveStreamCompat(account.cfg as any);
  const botClient = account.bot;
  const chatId = String(ctx.chat?.id ?? "");
  const threadId = (ctx.message as any)?.message_thread_id ?? (ctx.update?.edited_message as any)?.message_thread_id;
  const inboundMessageId = typeof params.inboundMessageId === "number" && params.inboundMessageId > 0
    ? params.inboundMessageId
    : undefined;
  const replyToMode = account.cfg.replyToMode ?? "first";
  let hasNativeReply = false;

  const maybeReplyTo = (): number | undefined => {
    if (!inboundMessageId || replyToMode === "off") return undefined;
    if (replyToMode === "all") return inboundMessageId;
    if (replyToMode === "first" && !hasNativeReply) return inboundMessageId;
    return undefined;
  };

  const markReplyUsed = (replyToMessageId?: number) => {
    if (replyToMessageId) hasNativeReply = true;
  };

  let replyMsgId: number | null = null;
  let creatingReplyMsg = false;
  let lastEditAt = 0;
  let editInFlight = false;
  let lastTypingAt = 0;
  const typingMinIntervalMs = 3000;

  // 按顺序存储所有内容（工具调用、思考、文本等）
  const contentSequence: { type: 'tool' | 'thinking' | 'text'; content: string }[] = [];
  const seenToolCalls = new Set<string>();

  const sendChatAction = () => {
    const now = Date.now();
    if (now - lastTypingAt < typingMinIntervalMs) return;
    lastTypingAt = now;
    botClient.api.sendChatAction(chatId, "typing", threadId ? { message_thread_id: threadId } : undefined).catch(() => {});
  };

  const ensureReplyMessage = (textForFirstMessage?: string) => {
    if (replyMsgId || creatingReplyMsg) return;
    creatingReplyMsg = true;
    const firstText = textForFirstMessage?.trim() ? markdownToTelegramHtml(textForFirstMessage) : streamCfg.placeholder;
    const replyToMessageId = maybeReplyTo();
    botClient.api.sendMessage(chatId, firstText, {
      parse_mode: "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }).then((sent) => {
      markReplyUsed(replyToMessageId);
      replyMsgId = sent.message_id;
      recordSentMessage(chatId, sent.message_id);
      lastEditAt = 0;
      creatingReplyMsg = false;
      if (contentSequence.length > 0) {
        pushLiveUpdate();
      }
    }).catch(() => {
      creatingReplyMsg = false;
    });
  };

  // 动画帧序列
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let spinnerIndex = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | null = null;

  const startSpinner = () => {
    if (spinnerInterval) return;
    spinnerInterval = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      pushLiveUpdate();
    }, 1000);
  };

  const stopSpinner = () => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
  };

  const buildLiveText = (): string => {
    const spinner = spinnerFrames[spinnerIndex]!;

    // 按顺序构建显示内容
    const parts: string[] = [];
    for (const item of contentSequence) {
      if (item.type === 'tool') {
        // tool 内容已含 backtick 格式，markdownToTelegramHtml 会转为 <code>
        parts.push(item.content);
      } else if (item.type === 'thinking') {
        // Truncate long thinking for display
        const truncated = item.content.length > 300 ? item.content.slice(-300) + '...' : item.content;
        parts.push(`<blockquote>💭 ${escapeHtml(truncated)}</blockquote>`);
      } else if (item.type === 'text') {
        parts.push(item.content);
      }
    }

    // 如果没有内容，显示 spinner
    if (parts.length === 0) {
      return `${spinner} 思考中...`;
    }

    let result = parts.join("\n\n");
    // 添加 spinner 到末尾表示还在处理
    result = result.length > 4000 ? `${result.slice(0, 4000)}\n... ${spinner}` : `${result} ${spinner}`;

    return result;
  };

  let throttleBackoff = 0; // extra ms added on 429

  const pushLiveUpdate = () => {
    if (streamCfg.streamMode === "off") return;
    const renderedRaw = buildLiveText();
    const rendered = renderedRaw.length > 4000 ? `${renderedRaw.slice(0, 4000)}\n...` : renderedRaw;
    if (!rendered.trim()) return;
    const now = Date.now();

    if (!replyMsgId) {
      ensureReplyMessage(rendered);
      return;
    }

    const effectiveThrottle = streamCfg.editThrottleMs + throttleBackoff;
    if (editInFlight || now - lastEditAt < effectiveThrottle) return;
    editInFlight = true;

    const editTimeout = setTimeout(() => {
      editInFlight = false;
    }, 5000);

    botClient.api.editMessageText(chatId, replyMsgId, markdownToTelegramHtml(rendered), { parse_mode: "HTML" })
      .then(() => {
        lastEditAt = Date.now();
        editInFlight = false;
        throttleBackoff = Math.max(0, throttleBackoff - 100); // recover gradually
        clearTimeout(editTimeout);
      })
      .catch((err: any) => {
        editInFlight = false;
        clearTimeout(editTimeout);
        // 429 rate limit: back off
        if (err?.error_code === 429 || err?.statusCode === 429) {
          const retryAfter = (err?.parameters?.retry_after ?? 1) * 1000;
          throttleBackoff = Math.max(throttleBackoff, retryAfter);
          lastEditAt = Date.now(); // prevent immediate retry
        }
      });
  };

  const typingInterval = setInterval(() => {
    sendChatAction();
  }, 3500);

  sendChatAction();

  // Lazy init: spinner 和 replyMsg 在第一个回调触发时才创建
  // 修复 steer 模式下 spinner 成为孤儿消息的问题
  let initialized = false;
  const lazyInit = () => {
    if (initialized) return;
    initialized = true;
    if (streamCfg.streamMode !== "off") {
      ensureReplyMessage();
    }
    startSpinner();
  };

  // 标记是否已收到过内容（用于判断是否需要显示初始 spinner）
  let hasReceivedContent = false;

  // Bug 2 修复：标记工具调用后是否有新文本
  let toolCallSinceLastText = false;

  await runtime.api.dispatch({
    source,
    sessionKey,
    text,
    images: images.length > 0 ? images : undefined,
    onThinkingDelta: (accumulated: string, _delta: string) => {
      lazyInit();
      sendChatAction();
      if (!hasReceivedContent) {
        stopSpinner();
        hasReceivedContent = true;
      }
      // Update thinking in contentSequence
      const thinkIdx = contentSequence.findIndex(c => c.type === 'thinking');
      if (thinkIdx >= 0) {
        contentSequence[thinkIdx].content = accumulated;
      } else {
        contentSequence.push({ type: 'thinking', content: accumulated });
      }
      pushLiveUpdate();
    },
    onStreamDelta: (accumulated: string, delta?: string) => {
      lazyInit();
      sendChatAction();
      if (!hasReceivedContent && accumulated) {
        stopSpinner();
        hasReceivedContent = true;
      }

      // Text started — keep thinking in contentSequence (shown as blockquote in final reply)

      // Bug 2 修复：工具调用后的新文本创建新的 text entry
      if (toolCallSinceLastText) {
        contentSequence.push({ type: 'text', content: accumulated });
        toolCallSinceLastText = false;
      } else {
        // Update or add text entry
        const lastTextIndex = contentSequence.findLastIndex(c => c.type === 'text');
        if (lastTextIndex >= 0) {
          contentSequence[lastTextIndex].content = accumulated;
        } else {
          contentSequence.push({ type: 'text', content: accumulated });
        }
      }

      if (!replyMsgId && contentSequence.length === 0 && accumulated.length < streamCfg.streamStartChars) return;
      pushLiveUpdate();
    },
    onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => {
      lazyInit();
      sendChatAction();
      if (toolCallId) {
        if (seenToolCalls.has(toolCallId)) return;
        seenToolCalls.add(toolCallId);
      }
      const line = `→ ${formatToolStartLine(toolName, args)}`;
      // 按顺序添加工具调用
      contentSequence.push({ type: 'tool', content: line });
      toolCallSinceLastText = true; // Bug 2 修复：标记工具调用后有新文本
      pushLiveUpdate();
    },
    respond: async (reply: string) => {
      lazyInit(); // 确保有 replyMsgId
      const log = runtime.api.logger;
      log.info(`[telegram:respond] chatId=${chatId} replyLen=${reply?.length ?? 0} replyMsgId=${replyMsgId}`);
      clearInterval(typingInterval);
      stopSpinner();

      // 用最终回复替换 contentSequence 中的文本内容（避免重复）
      if (reply && reply.trim()) {
        const lastTextIndex = contentSequence.findLastIndex(c => c.type === 'text');
        if (lastTextIndex >= 0) {
          contentSequence[lastTextIndex].content = reply.trim();
        } else {
          contentSequence.push({ type: 'text', content: reply.trim() });
        }
      }

      // 按顺序构建最终回复（thinking 保留为 blockquote）
      const parts: string[] = [];
      for (const item of contentSequence) {
        if (item.type === 'tool') {
          parts.push(item.content);
        } else if (item.type === 'thinking') {
          const truncated = item.content.length > 200 ? item.content.slice(0, 200) + "…" : item.content;
          parts.push(`<blockquote>💭 ${escapeHtml(truncated)}</blockquote>`);
        } else if (item.type === 'text') {
          parts.push(item.content);
        }
      }
      const finalReply = parts.join("\n\n");

      const parsedFinal = parseOutboundMediaDirectives(finalReply);
      const finalText = parsedFinal.text;

      // If aborted with no content, clean up the spinner message
      if (!finalText.trim() && replyMsgId) {
        try {
          await botClient.api.editMessageText(chatId, replyMsgId, "⏹ (interrupted)", {});
        } catch {}
        return;
      }

      const chunks = splitTelegramText(finalText, 4096);

      if (replyMsgId && chunks.length > 0) {
        try {
          const first = markdownToTelegramHtml(chunks[0]!);
          await botClient.api.editMessageText(chatId, replyMsgId, first, {
            parse_mode: "HTML",
          });
          const startIndex = 1;
          for (let i = startIndex; i < chunks.length; i++) {
            const chunk = chunks[i]!;
            try {
              const replyToMessageId = maybeReplyTo();
              const sent = await botClient.api.sendMessage(chatId, markdownToTelegramHtml(chunk), {
                parse_mode: "HTML",
                ...(threadId ? { message_thread_id: threadId } : {}),
                ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
              });
              markReplyUsed(replyToMessageId);
              recordSentMessage(chatId, sent.message_id);
            } catch (chunkErr: any) {
              log.warn(`[telegram:respond] HTML sendMessage failed for chunk, retrying plain: ${chunkErr?.message ?? chunkErr}`);
              const replyToMessageId = maybeReplyTo();
              const sent = await botClient.api.sendMessage(chatId, chunk, {
                ...(threadId ? { message_thread_id: threadId } : {}),
                ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
              });
              markReplyUsed(replyToMessageId);
              recordSentMessage(chatId, sent.message_id);
            }
          }
        } catch (editErr: any) {
          log.warn(`[telegram:respond] editMessageText failed, falling back to sendMessage: ${editErr?.message ?? editErr}`);
          for (const chunk of chunks) {
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, chunk, {
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            }).catch((sendErr: any) => {
              log.error(`[telegram:respond] fallback sendMessage also failed: ${sendErr?.message ?? sendErr}`);
              return null;
            });
            if (sent) markReplyUsed(replyToMessageId);
            if (sent) recordSentMessage(chatId, sent.message_id);
          }
        }
      } else {
        for (const chunk of chunks) {
          try {
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, markdownToTelegramHtml(chunk), {
              parse_mode: "HTML",
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            });
            markReplyUsed(replyToMessageId);
            recordSentMessage(chatId, sent.message_id);
          } catch (htmlErr: any) {
            log.warn(`[telegram:respond] HTML sendMessage failed, retrying plain: ${htmlErr?.message ?? htmlErr}`);
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, chunk, {
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            }).catch((plainErr: any) => {
              log.error(`[telegram:respond] plain sendMessage also failed: ${plainErr?.message ?? plainErr}`);
              return null;
            });
            if (sent) markReplyUsed(replyToMessageId);
            if (sent) recordSentMessage(chatId, sent.message_id);
          }
        }
      }

      for (const media of parsedFinal.media) {
        try {
          const replyToMessageId = maybeReplyTo();
          await sendTelegramMedia(botClient, chatId, media, {
            ...(threadId ? { messageThreadId: threadId } : {}),
            ...(replyToMessageId ? { replyToMessageId } : {}),
          });
          markReplyUsed(replyToMessageId);
        } catch (err: any) {
          const reason = err?.message ?? "unknown";
          await botClient.api.sendMessage(chatId, `Failed to send ${media.kind}: ${reason}`).catch(() => {});
        }
      }
    },
    setTyping: async (typing) => {
      if (!typing) clearInterval(typingInterval);
    },
  });

  clearInterval(typingInterval);
}

function scheduleDebounce(params: {
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  source: MessageSource;
  text: string;
  images: ImageContent[];
  flush: (chatId: string, entry: TelegramDebouncedEntry) => void;
}): void {
  const { account, ctx, source, text, images, flush } = params;
  const chatId = String(ctx.chat?.id ?? "");
  const debounceMs = resolveStreamCompat(account.cfg as any).debounceMs;

  if (debounceMs <= 0) {
    const existing = account.debounceMap.get(chatId);
    if (existing) {
      clearTimeout(existing.timer);
      account.debounceMap.delete(chatId);
    }
    const entry: TelegramDebouncedEntry = {
      texts: text ? [text] : [],
      images: [...images],
      ctx,
      source,
      timer: setTimeout(() => {}, 0),
    };
    flush(chatId, entry);
    return;
  }

  const existing = account.debounceMap.get(chatId);
  if (existing) {
    clearTimeout(existing.timer);
    if (text) existing.texts.push(text);
    existing.images.push(...images);
    existing.ctx = ctx;
    existing.timer = setTimeout(() => {
      account.debounceMap.delete(chatId);
      flush(chatId, existing);
    }, debounceMs);
    return;
  }

  const entry: TelegramDebouncedEntry = {
    texts: text ? [text] : [],
    images: [...images],
    ctx,
    source,
    timer: setTimeout(() => {
      account.debounceMap.delete(chatId);
      flush(chatId, entry);
    }, debounceMs),
  };
  account.debounceMap.set(chatId, entry);
}

async function dispatchInbound(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  text: string;
  images: ImageContent[];
  message?: TelegramMessage;
}): Promise<void> {
  const { runtime, account, ctx } = params;
  let { text } = params;
  const images = params.images;

  const source = buildSource(account, ctx, params.message);

  if (source.chatType === "group") {
    const gate = shouldAllowGroupMessage(account, ctx, text);
    if (!gate.allowed) return;
    text = gate.text;
  } else {
    const policy: DmPolicy = account.cfg.dmPolicy ?? "pairing";
    const allowed = isSenderAllowed("telegram", source.senderId, policy, account.cfg.allowFrom, account.accountId);
    if (!allowed) {
      if (policy === "pairing") {
        const code = createPairingRequest("telegram", source.senderId, source.senderName, account.accountId);
        if (code) {
          await ctx.reply(`Pairing required. Send this code to the admin:\n\n<code>${code}</code>`, { parse_mode: "HTML" });
        } else {
          await ctx.reply("Too many pending pairing requests. Please try later.");
        }
      }
      return;
    }
  }

  const flush = (chatId: string, entry: TelegramDebouncedEntry) => {
    const combinedText = entry.texts.join("\n\n");
    if (!combinedText && entry.images.length === 0) return;

    // v3.0 routing: resolve agent via binding/prefix/default
    const { agentId, text: routedText } = resolveAgentId(entry.source, combinedText, runtime.api.config);
    const sessionKey = resolveSessionKey(entry.source, runtime.api.config, agentId);

    void dispatchAgentTurn({
      runtime,
      account,
      ctx: entry.ctx,
      source: entry.source,
      sessionKey,
      text: routedText || "(image)",
      images: entry.images,
      inboundMessageId: entry.ctx.message?.message_id,
    });
    params.runtime.api.logger.info(
      `[telegram:${account.accountId}] inbound chat=${chatId} sender=${entry.source.senderId} type=${entry.source.chatType} agentId=${agentId} textLen=${routedText.length} images=${entry.images.length}`,
    );
  };

  scheduleDebounce({
    account,
    ctx,
    source,
    text,
    images,
    flush,
  });
}

function consumeMediaGroup(account: TelegramAccountRuntime, mediaGroupId: string): TelegramPendingMediaGroup | null {
  const pending = account.mediaGroupMap.get(mediaGroupId);
  if (!pending) return null;
  account.mediaGroupMap.delete(mediaGroupId);
  clearTimeout(pending.timer);
  return pending;
}

function enqueueMediaGroup(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  mediaGroupId: string;
  text: string;
  images: ImageContent[];
}) {
  const { runtime, account, ctx, mediaGroupId, text, images } = params;
  const existing = account.mediaGroupMap.get(mediaGroupId);
  if (existing) {
    if (text) existing.texts.push(text);
    existing.images.push(...images);
    existing.ctx = ctx;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(async () => {
      const merged = consumeMediaGroup(account, mediaGroupId);
      if (!merged) return;
      const combined = merged.texts.join("\n\n").trim() || "(album)";
      await dispatchInbound({ runtime, account, ctx: merged.ctx, text: combined, images: merged.images });
    }, 650);
    return;
  }

  const pending: TelegramPendingMediaGroup = {
    texts: text ? [text] : [],
    images: [...images],
    ctx,
    timer: setTimeout(async () => {
      const merged = consumeMediaGroup(account, mediaGroupId);
      if (!merged) return;
      const combined = merged.texts.join("\n\n").trim() || "(album)";
      await dispatchInbound({ runtime, account, ctx: merged.ctx, text: combined, images: merged.images });
    }, 650),
  };
  account.mediaGroupMap.set(mediaGroupId, pending);
}

async function handleMessageCommon(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext, msg: TelegramMessage): Promise<void> {
  const chatId = String(msg.chat.id);
  const messageId = msg.message_id;

  if (wasRecentlySent(chatId, messageId)) {
    return;
  }

  const { images, documentContext } = await resolveImagesFromMessage(account, msg);
  let text = (msg.text ?? msg.caption ?? "").trim();

  // Media note injection — tell agent what media is attached
  if (images.length > 0) {
    const mediaNote = images.length === 1
      ? `[media attached: 1 image]`
      : `[media attached: ${images.length} images]`;
    text = text ? `${mediaNote}\n${text}` : mediaNote;
  }

  // Document context (non-image files)
  if (documentContext) {
    text = text ? `${text}\n\n${documentContext}` : documentContext;
  }

  // Forward context
  const fwd = (msg as any).forward_origin ?? (msg as any).forward_from ?? (msg as any).forward_from_chat;
  if (fwd) {
    const fwdName = fwd.sender_user?.first_name
      ?? fwd.sender_user_name
      ?? fwd.chat?.title
      ?? (msg as any).forward_from?.first_name
      ?? (msg as any).forward_from_chat?.title
      ?? "unknown";
    text = `[Forwarded from ${fwdName}]\n${text}`;
  }

  // Reply context
  const replied = (msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "").trim();
  if (replied) {
    const repliedIsBot = msg.reply_to_message?.from?.is_bot && msg.reply_to_message?.from?.id === account.bot.botInfo?.id;
    if (!repliedIsBot) {
      const quoted = replied.length > 300 ? `${replied.slice(0, 300)}...` : replied;
      text = text ? `[Reply to] ${quoted}\n\n${text}` : `[Reply to] ${quoted}`;
    }
    // Skip quoting bot's own messages — agent already has that context
  }

  if (!text && images.length > 0) {
    text = "(image)";
  }

  if (msg.voice) {
    const audioCfg = account.cfg.audio;
    if (!audioCfg?.apiKey) {
      await ctx.reply("语音消息暂不支持，请发送文字。");
      return;
    }
    // Download voice and transcribe
    try {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: msg.voice.file_id,
        maxBytes: (account.cfg.mediaMaxMb ?? 10) * 1024 * 1024,
      });
      if (!downloaded) {
        await ctx.reply("语音下载失败，请重试。");
        return;
      }
      const buffer = Buffer.from(downloaded.data, "base64");
      const { transcribeAudio } = await import("./audio-transcribe.ts");
      const transcript = await transcribeAudio(buffer, downloaded.mimeType || "audio/ogg", {
        provider: audioCfg.provider ?? "groq",
        model: audioCfg.model ?? "whisper-large-v3-turbo",
        apiKey: audioCfg.apiKey,
        language: audioCfg.language,
        timeoutMs: (audioCfg.timeoutSeconds ?? 30) * 1000,
      });
      if (transcript) {
        text = text ? `${text}\n\n[Voice message] ${transcript}` : `[Voice message] ${transcript}`;
      } else {
        await ctx.reply("语音转录失败，请重试或发送文字。");
        return;
      }
    } catch (err: any) {
      runtime.api.logger.warn(`[telegram] Voice transcription failed: ${err?.message ?? String(err)}`);
      await ctx.reply("语音转录失败，请重试或发送文字。");
      return;
    }
  }

  if (!text && images.length === 0) return;

  if (msg.media_group_id) {
    enqueueMediaGroup({
      runtime,
      account,
      ctx,
      mediaGroupId: msg.media_group_id,
      text,
      images,
    });
    return;
  }

  await dispatchInbound({ runtime, account, ctx, text, images, message: msg });
}

async function handleEditedMessage(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const edited = ctx.update?.edited_message;
  if (!edited) return;

  const eventKey = `${edited.chat.id}:${edited.message_id}:${edited.text ?? edited.caption ?? ""}`;
  if (account.seenEditedEvents.has(eventKey)) {
    return;
  }
  account.seenEditedEvents.add(eventKey);
  if (account.seenEditedEvents.size > 3000) {
    const first = account.seenEditedEvents.values().next().value;
    if (first) account.seenEditedEvents.delete(first);
  }

  const augmented = {
    ...ctx,
    chat: edited.chat as any,
    from: edited.from as any,
    message: edited,
  } as TelegramContext;

  await handleMessageCommon(runtime, account, augmented, edited);
}

async function handleReaction(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const text = buildReactionText(account.cfg, ctx, account.botId);
  if (!text) return;

  const reaction = ctx.update?.message_reaction;
  if (!reaction?.chat?.id) return;

  const fakeCtx: TelegramContext = {
    ...ctx,
    chat: {
      id: reaction.chat.id,
      type: "supergroup",
    },
    from: reaction.user,
    message: {
      message_id: 0,
      chat: { id: reaction.chat.id, type: "supergroup" },
      from: reaction.user,
      text,
    },
  };

  await dispatchInbound({ runtime, account, ctx: fakeCtx, text, images: [] });
}

async function handleMigration(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const msg = ctx.message;
  if (!msg?.migrate_to_chat_id) return;

  const oldId = String(msg.chat.id);
  const newId = String(msg.migrate_to_chat_id);
  const result = migrateTelegramGroupConfig({
    cfg: runtime.channelCfg,
    accountId: account.accountId,
    oldChatId: oldId,
    newChatId: newId,
  });
  runtime.api.logger.info(
    `[telegram:${account.accountId}] group migrated ${oldId} -> ${newId} migrated=${result.migrated} skippedExisting=${result.skippedExisting}`,
  );
}

export async function setupTelegramHandlers(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime): Promise<void> {
  const bot = account.bot;

  // 本地命令列表（由 bot.command() 处理）
  const localCommands = new Set(["new", "stop", "status", "queue", "role", "cron", "help", "media", "photo", "audio", "model", "refresh", "skills"]);

  bot.on("message", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
      if (account.seenUpdates.size > 5000) {
        const first = account.seenUpdates.values().next().value;
        if (typeof first === "number") account.seenUpdates.delete(first);
      }
    }

    const msg = (ctx as TelegramContext).message;
    if (!msg) return;

    const text = msg.text ?? msg.caption ?? "";
    
    // 检查是否是本地命令（由 bot.command() 处理）
    if (text.trim().startsWith("/")) {
      const cmdMatch = text.trim().match(/^\/([a-zA-Z0-9_]+)/);
      if (cmdMatch) {
        const cmdName = cmdMatch[1].toLowerCase();
        if (localCommands.has(cmdName)) {
          // 本地命令，由 bot.command() 处理，跳过
          return;
        }
      }
      // 非本地命令（可能是 pi 命令），继续处理
    }

    await handleMigration(runtime, account, ctx as TelegramContext);
    await handleMessageCommon(runtime, account, ctx as TelegramContext, msg);
  });

  bot.on("edited_message", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
    }
    await handleEditedMessage(runtime, account, ctx as TelegramContext);
  });

  bot.on("message_reaction", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
    }
    await handleReaction(runtime, account, ctx as TelegramContext);
  });
}

export async function sendOutboundViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  text: string;
}): Promise<void> {
  const parsed = parseTelegramTarget(params.target, params.defaultAccountId);
  const account = params.runtime.accounts.get(parsed.accountId)
    ?? params.runtime.accounts.get(params.defaultAccountId)
    ?? Array.from(params.runtime.accounts.values())[0];
  if (!account) {
    throw new Error("Telegram account not started");
  }

  const threadId = parsed.topicId ? Number.parseInt(parsed.topicId, 10) : undefined;

  const chunks = splitMessage(params.text, 4096);
  for (const chunk of chunks) {
    try {
      if (chunk.includes("[photo]") || chunk.includes("[audio]")) {
        await sendTelegramTextAndMedia(account.bot, parsed.chatId, chunk, threadId ? { messageThreadId: threadId } : undefined);
      } else {
        const sent = await account.bot.api.sendMessage(parsed.chatId, markdownToTelegramHtml(chunk), {
          parse_mode: "HTML",
          ...(threadId ? { message_thread_id: threadId } : {}),
        });
        recordSentMessage(parsed.chatId, sent.message_id);
      }
    } catch {
      const sent = await account.bot.api.sendMessage(parsed.chatId, chunk, threadId ? { message_thread_id: threadId } : undefined);
      recordSentMessage(parsed.chatId, sent.message_id);
    }
  }

  params.runtime.api.logger.info(
    `[telegram:${account.accountId}] outbound to=${params.target} textLen=${params.text.length}`,
  );
}

/**
 * Send a media file via Telegram channel plugin outbound interface.
 * Used by POST /api/media/send (send_media tool).
 */
export async function sendMediaViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  filePath: string;
  opts?: MediaSendOptions;
}): Promise<MediaSendResult> {
  const parsed = parseTelegramTarget(params.target, params.defaultAccountId);
  const account = params.runtime.accounts.get(parsed.accountId)
    ?? params.runtime.accounts.get(params.defaultAccountId)
    ?? Array.from(params.runtime.accounts.values())[0];
  if (!account) {
    return { ok: false, error: "Telegram account not started" };
  }

  const threadId = parsed.topicId ? Number.parseInt(parsed.topicId, 10) : undefined;

  // Map MediaSendOptions.type to TelegramMediaDirective.kind ("photo" | "audio" | "file")
  const ext = params.filePath.split(".").pop()?.toLowerCase() ?? "";
  const typeHint = params.opts?.type;
  const kind: "photo" | "audio" | "file" = typeHint === "photo" ? "photo"
    : typeHint === "audio" ? "audio"
    : typeHint === "video" || typeHint === "document" ? "file"
    : IMAGE_EXTS.has(ext) ? "photo"
    : AUDIO_EXTS.has(ext) ? "audio"
    : "file";

  try {
    await sendTelegramMedia(account.bot, parsed.chatId, {
      kind,
      url: params.filePath,
      caption: params.opts?.caption,
    }, {
      ...(threadId ? { messageThreadId: threadId } : {}),
      skipPathValidation: true,  // API layer already validated
    });

    params.runtime.api.logger.info(
      `[telegram:${account.accountId}] sendMedia to=${params.target} path=${params.filePath} kind=${kind}`,
    );
    return { ok: true };
  } catch (err: any) {
    params.runtime.api.logger.error(
      `[telegram:${account.accountId}] sendMedia failed: ${err?.message}`,
    );
    return { ok: false, error: err?.message ?? "Send failed" };
  }
}
