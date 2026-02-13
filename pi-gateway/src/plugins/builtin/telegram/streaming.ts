/**
 * Telegram Streaming — dispatch + streaming callbacks + live text rendering.
 *
 * Extracted from handlers.ts (v3.7) to keep each file < 500 lines.
 * Contains dispatchAgentTurn and all its internal helpers (spinner, live text,
 * content sequence, respond callback, tool formatting).
 */

import type { ImageContent, MessageSource } from "../../../core/types.ts";
import { refreshPiCommands } from "./commands.ts";
import { resolveStreamCompat } from "./config-compat.ts";
import { escapeHtml, markdownToTelegramHtml, splitTelegramText } from "./format.ts";
import { parseOutboundMediaDirectives, sendTelegramMedia } from "./media-send.ts";
import { recordSentMessage } from "./sent-message-cache.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramPluginRuntime,
} from "./types.ts";

// ============================================================================
// Tool call formatting helpers
// ============================================================================

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

// ============================================================================
// Lazy command registration
// ============================================================================

const commandsRegistered = new Map<string, boolean>();
const commandsRetryCount = new Map<string, number>();
const MAX_COMMAND_RETRIES = 3;

// ============================================================================
// dispatchAgentTurn — core streaming dispatch
// ============================================================================

export async function dispatchAgentTurn(params: {
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
    const parts: string[] = [];
    for (const item of contentSequence) {
      if (item.type === 'tool') {
        parts.push(item.content);
      } else if (item.type === 'thinking') {
        const truncated = item.content.length > 1024 ? item.content.slice(-1024) + '...' : item.content;
        parts.push(`<blockquote>💭 ${escapeHtml(truncated)}</blockquote>`);
      } else if (item.type === 'text') {
        parts.push(item.content);
      }
    }
    if (parts.length === 0) return `${spinner} 思考中...`;
    let result = parts.join("\n\n");
    result = result.length > 4000 ? `${result.slice(0, 4000)}\n... ${spinner}` : `${result} ${spinner}`;
    return result;
  };

  let throttleBackoff = 0;

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
        throttleBackoff = Math.max(0, throttleBackoff - 100);
        clearTimeout(editTimeout);
      })
      .catch((err: any) => {
        editInFlight = false;
        clearTimeout(editTimeout);
        if (err?.error_code === 429 || err?.statusCode === 429) {
          const retryAfter = (err?.parameters?.retry_after ?? 1) * 1000;
          throttleBackoff = Math.max(throttleBackoff, retryAfter);
          lastEditAt = Date.now();
        }
      });
  };

  const typingInterval = setInterval(() => {
    sendChatAction();
  }, 3500);

  sendChatAction();

  let initialized = false;
  const lazyInit = () => {
    if (initialized) return;
    initialized = true;
    if (streamCfg.streamMode !== "off") {
      ensureReplyMessage();
    }
    startSpinner();
  };

  let hasReceivedContent = false;
  let toolCallSinceLastText = false;
  let lastStreamAccumLen = 0;

  const result = await runtime.api.dispatch({
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

      const textDelta = delta ?? accumulated.slice(lastStreamAccumLen);
      lastStreamAccumLen = accumulated.length;
      if (!textDelta) return;

      if (toolCallSinceLastText) {
        contentSequence.push({ type: 'text', content: textDelta });
        toolCallSinceLastText = false;
      } else {
        const lastTextIndex = contentSequence.findLastIndex(c => c.type === 'text');
        if (lastTextIndex >= 0) {
          contentSequence[lastTextIndex].content += textDelta;
        } else {
          contentSequence.push({ type: 'text', content: textDelta });
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
      contentSequence.push({ type: 'tool', content: line });
      toolCallSinceLastText = true;
      pushLiveUpdate();
    },
    respond: async (reply: string) => {
      lazyInit();
      const log = runtime.api.logger;
      log.info(`[telegram:respond] chatId=${chatId} replyLen=${reply?.length ?? 0} replyMsgId=${replyMsgId}`);
      clearInterval(typingInterval);
      stopSpinner();

      if (reply && reply.trim()) {
        const textEntryCount = contentSequence.filter(c => c.type === 'text').length;
        if (textEntryCount <= 1) {
          const lastTextIndex = contentSequence.findLastIndex(c => c.type === 'text');
          if (lastTextIndex >= 0) {
            contentSequence[lastTextIndex].content = reply.trim();
          } else {
            contentSequence.push({ type: 'text', content: reply.trim() });
          }
        }
      }

      const parts: string[] = [];
      for (const item of contentSequence) {
        if (item.type === 'tool') {
          parts.push(item.content);
        } else if (item.type === 'thinking') {
          const truncated = item.content.length > 1024 ? item.content.slice(0, 1024) + "…" : item.content;
          parts.push(`<blockquote>💭 ${escapeHtml(truncated)}</blockquote>`);
        } else if (item.type === 'text') {
          parts.push(item.content);
        }
      }
      const finalReply = parts.join("\n\n");

      const parsedFinal = parseOutboundMediaDirectives(finalReply);
      const finalText = parsedFinal.text;

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
          await botClient.api.editMessageText(chatId, replyMsgId, first, { parse_mode: "HTML" });
          for (let i = 1; i < chunks.length; i++) {
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

  if (result?.injected) {
    clearInterval(typingInterval);
    return;
  }

  clearInterval(typingInterval);
}
