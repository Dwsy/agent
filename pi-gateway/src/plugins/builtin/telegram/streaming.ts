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
import { getConciseConfigDefault, getEffectiveConciseState } from "../concise-mode/index.ts";
import { endThinkingBlock, startThinkingBlock, type StreamingSequenceItem, updateThinkingBlock } from "../../streaming-thinking.ts";

const DEFAULT_DRAFT_PLACEHOLDER = "…";

function sanitizeDraftText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return DEFAULT_DRAFT_PLACEHOLDER;
  if (trimmed.length <= 4096) return trimmed;
  return `${trimmed.slice(0, 4093)}...`;
}

function isTelegramErrorWithCode(err: unknown, code: number): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as Record<string, unknown>;
  return maybe.error_code === code || maybe.statusCode === code;
}

function asTelegramErrorDescription(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const maybe = err as Record<string, unknown>;
  const desc = maybe.description;
  return typeof desc === "string" ? desc : "";
}
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

function codeBlock(text: string, lang = "", max = 1200): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const clipped = normalized.length > max ? `${normalized.slice(0, max)}\n... (truncated)` : normalized;
  const escapedFence = clipped.replace(/```/g, "'''");
  return `\`\`\`${lang}\n${escapedFence}\n\`\`\``;
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
      return path ? `read\n${codeBlock(path)}` : "read";
    }
    case "write": {
      const path = pickArgString(args, ["path", "filePath", "file", "outputPath"]);
      return path ? `write\n${codeBlock(path)}` : "write";
    }
    case "edit":
    case "multi_edit": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `${toolName}\n${codeBlock(path)}` : toolName;
    }
    case "bash": {
      const command = pickArgString(args, ["command", "cmd"]);
      return command ? `bash\n${codeBlock(command, "bash", 1500)}` : "bash";
    }
    default: {
      const payload = args ? clipInline(JSON.stringify(args), 120) : "";
      return payload ? `${toolName} ${codeInline(payload, 120)}` : toolName;
    }
  }
}

// ============================================================================
// Concise Mode Handler
// ============================================================================

/**
 * Concise Mode Handler for Telegram
 * 
 * Encapsulates concise-mode logic for streaming:
 * - Prompt injection
 * - Stream mode override
 * - Callback wrapping to suppress output
 */
class ConciseModeHandler {
  // Detailed prompt injected per-message when concise mode is enabled.
  // This ensures the agent knows exactly how to use send_message.
  private static readonly CONCISE_PROMPT = `

[Concise Output Mode]
Use send_message tool to send progress updates to the user.
After sending all updates via send_message, output [NO_REPLY] as your final text response.
Do NOT output the actual content - send it via send_message instead.`;

  // Session-level OFF override when global concise prompt is enabled.
  private static readonly CONCISE_OFF_OVERRIDE_PROMPT = `

[Concise Override]
For this session, concise mode is OFF.
Ignore concise-output constraints from system prompt for this turn.
Respond normally unless tool routing explicitly requires [NO_REPLY].`;

  constructor(
    private runtime: TelegramPluginRuntime,
    private account: TelegramAccountRuntime,
    private enabled: boolean = true,
    private shouldInjectDisablePrompt: boolean = false,
  ) {}

  /**
   * Inject concise-mode prompt into message text.
   *
   * Simple logic:
   * - If concise enabled: inject CONCISE_PROMPT
   * - If concise disabled but config says enabled: inject CONCISE_OFF_OVERRIDE_PROMPT
   * - Otherwise: no injection
   */
  injectPrompt(text: string): string {
    if (this.enabled) {
      this.runtime.api.logger.info("[streaming] concise-mode: injecting prompt, disabling stream");
      return text + ConciseModeHandler.CONCISE_PROMPT;
    }

    if (this.shouldInjectDisablePrompt) {
      this.runtime.api.logger.info("[streaming] concise-mode: injecting session OFF override prompt");
      return text + ConciseModeHandler.CONCISE_OFF_OVERRIDE_PROMPT;
    }

    return text;
  }

  /**
   * Resolve stream configuration with concise-mode override
   *
   * NOTE: Concise mode should NOT disable streaming for send_message tool.
   * It only controls:
   * 1. Prompt injection (via injectPrompt)
   * 2. Reply suppression (via SILENT_TOKEN in hooks)
   *
   * The stream mode should respect the channel configuration.
   */
  resolveStreamConfig(): ReturnType<typeof resolveStreamCompat> {
    return resolveStreamCompat(this.account.cfg);
  }

  /**
   * Wrap onStreamDelta to suppress output in concise-mode
   */
  wrapStreamDelta(
    original?: (accumulated: string, delta: string) => void
  ): typeof original {
    if (!this.enabled) return original;
    
    // In concise-mode, suppress streaming deltas
    return undefined;
  }

  /**
   * Wrap onToolStart to suppress tool hints in concise-mode
   */
  wrapToolStart(
    original?: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => void
  ): typeof original {
    if (!this.enabled) return original;
    
    // In concise-mode, suppress tool start notifications
    return undefined;
  }

  /**
   * Check if concise-mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Factory function to create concise-mode handler.
 * Reads effective state dynamically: session override > config default.
 */
function createConciseModeHandler(
  runtime: TelegramPluginRuntime,
  account: TelegramAccountRuntime,
  sessionKey?: string,
): ConciseModeHandler {
  const enabled = sessionKey ? getEffectiveConciseState(sessionKey) : false;
  const configDefaultEnabled = getConciseConfigDefault();
  const shouldInjectDisablePrompt = !enabled && configDefaultEnabled;

  // Diagnostic logging for concise mode state
  runtime.api.logger.info(
    `[streaming] concise-mode: sessionKey=${sessionKey?.slice(0, 20)} enabled=${enabled} configDefault=${configDefaultEnabled} injectDisable=${shouldInjectDisablePrompt}`,
  );

  return new ConciseModeHandler(
    runtime,
    account,
    enabled,
    shouldInjectDisablePrompt,
  );
}

// ============================================================================
// Lazy command registration
// ============================================================================

const commandsRegistered = new Map<string, boolean>();
const commandsRetryCount = new Map<string, number>();
const MAX_COMMAND_RETRIES = 3;

// Keep latest inbound Telegram message id per session so steer-injected runs
// can reply to the newest user message instead of the original one.
const latestInboundReplyTargetBySession = new Map<string, number>();

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

  // Concise-mode: inject prompt and disable streaming
  const conciseMode = createConciseModeHandler(runtime, account, sessionKey);
  const textWithPrompt = conciseMode.injectPrompt(text);
  const streamCfg = conciseMode.resolveStreamConfig();
  const isConcise = conciseMode.isEnabled();

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
  const botClient = account.bot;
  const chatId = String(ctx.chat?.id ?? "");
  const threadId = (ctx.message as any)?.message_thread_id ?? (ctx.update?.edited_message as any)?.message_thread_id;
  const inboundMessageId = typeof params.inboundMessageId === "number" && params.inboundMessageId > 0
    ? params.inboundMessageId
    : undefined;
  if (inboundMessageId) {
    latestInboundReplyTargetBySession.set(sessionKey, inboundMessageId);
  }
  const replyToMode = account.cfg.replyToMode ?? "first";
  let hasNativeReply = false;

  const resolveReplyTargetMessageId = (): number | undefined => {
    const latest = latestInboundReplyTargetBySession.get(sessionKey);
    if (typeof latest === "number" && latest > 0) return latest;
    return inboundMessageId;
  };

  const maybeReplyTo = (): number | undefined => {
    const replyTargetMessageId = resolveReplyTargetMessageId();
    if (!replyTargetMessageId || replyToMode === "off") return undefined;
    if (replyToMode === "all") return replyTargetMessageId;
    if (replyToMode === "first" && !hasNativeReply) return replyTargetMessageId;
    return undefined;
  };

  const markReplyUsed = (replyToMessageId?: number) => {
    if (replyToMessageId) hasNativeReply = true;
  };

  let replyMsgId: number | null = null;
  let creatingReplyMsg = false;
  let replyMsgPromise: Promise<void> | null = null;
  let lastEditAt = 0;
  let editInFlight = false;
  let lastTypingAt = 0;
  const typingMinIntervalMs = 4000;

  const contentSequence: StreamingSequenceItem[] = [];
  const seenToolCalls = new Set<string>();

  const draftEnabled = streamCfg.streamMode === "draft";
  // Draft mode works in both DM and groups. Previously required threadId which blocked DM usage.
  const canUseDraftStream = draftEnabled && source.chatType === "dm";
  const draftMode = canUseDraftStream;
  let draftId: number = 0;
  let lastDraftAt = 0;
  let draftInFlight = false;
  let draftThrottleBackoff = 0;
  let draftFailed = false;

  const sendChatAction = () => {
    const now = Date.now();
    if (now - lastTypingAt < typingMinIntervalMs) return;
    lastTypingAt = now;
    botClient.api.sendChatAction(chatId, "typing", threadId ? { message_thread_id: threadId } : undefined).catch(() => {});
  };

  const ensureReplyMessage = (textForFirstMessage?: string) => {
    if (replyMsgId || creatingReplyMsg) return;
    if (draftMode && !draftFailed) return;
    creatingReplyMsg = true;
    const firstText = textForFirstMessage?.trim() ? markdownToTelegramHtml(textForFirstMessage) : streamCfg.placeholder;
    const replyToMessageId = maybeReplyTo();
    replyMsgPromise = botClient.api.sendMessage(chatId, firstText, {
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

  const pushDraftUpdate = () => {
    if (!draftMode || draftFailed) return;

    const renderedRaw = buildLiveText();
    const rendered = sanitizeDraftText(renderedRaw);
    if (!rendered.trim()) return;

    const now = Date.now();
    const effectiveThrottle = streamCfg.editThrottleMs + draftThrottleBackoff;
    if (draftInFlight || now - lastDraftAt < effectiveThrottle) return;
    draftInFlight = true;

    const draftTimeout = setTimeout(() => {
      draftInFlight = false;
    }, 5000);

    if (!draftId) {
      draftId = Date.now();
      if (draftId === 0) draftId = 1;
    }

    botClient.api.sendMessageDraft(Number(chatId), draftId, rendered, {
      message_thread_id: threadId,
    }).then(() => {
      lastDraftAt = Date.now();
      draftInFlight = false;
      draftThrottleBackoff = Math.max(0, draftThrottleBackoff - 100);
      clearTimeout(draftTimeout);
    }).catch((err: unknown) => {
      draftInFlight = false;
      clearTimeout(draftTimeout);
      if (isTelegramErrorWithCode(err, 429)) {
        const tgErr = err as Record<string, unknown>;
        const params = tgErr?.parameters as Record<string, unknown> | undefined;
        const retryAfter = (typeof params?.retry_after === "number" ? params.retry_after : 1) * 1000;
        draftThrottleBackoff = Math.max(draftThrottleBackoff, retryAfter);
        lastDraftAt = Date.now();
        return;
      }
      const desc = asTelegramErrorDescription(err);
      draftFailed = true;
      runtime.api.logger.warn(`[telegram:streaming] draft mode failed, fallback to edit mode: ${desc || String(err)}`);
      pushLiveUpdate();
    });
  };

  const pushLiveUpdate = () => {
    if (streamCfg.streamMode === "off") return;

    if (draftMode && !draftFailed) {
      pushDraftUpdate();
      return;
    }

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
      .catch((err: unknown) => {
        editInFlight = false;
        clearTimeout(editTimeout);
        const tgErr = err as Record<string, unknown> | null;
        if (tgErr?.error_code === 429 || tgErr?.statusCode === 429) {
          const params = tgErr?.parameters as Record<string, unknown> | undefined;
          const retryAfter = (typeof params?.retry_after === 'number' ? params.retry_after : 1) * 1000;
          throttleBackoff = Math.max(throttleBackoff, retryAfter);
          lastEditAt = Date.now();
        }
      });
  };

  let typingInterval: ReturnType<typeof setInterval> | null = null;

  const ensureTypingInterval = () => {
    if (typingInterval) return;
    typingInterval = setInterval(() => sendChatAction(), 4500);
    sendChatAction();
  };

  let initialized = false;
  const lazyInit = () => {
    if (initialized) return;
    initialized = true;
    ensureTypingInterval();
    if (streamCfg.streamMode !== "off") {
      if (draftMode && !draftFailed) {
        pushDraftUpdate();
      } else {
        ensureReplyMessage();
      }
    }
    startSpinner();
  };

  let hasReceivedContent = false;
  let toolCallSinceLastText = false;
  let lastStreamAccumLen = 0;

  try {
    const result = await runtime.api.dispatch({
      source,
      sessionKey,
      text: textWithPrompt,
      images: images.length > 0 ? images : undefined,
      onSteerInjected: () => {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      stopSpinner();
      // Finalize current reply with accumulated content (no spinner suffix)
      if (replyMsgId && contentSequence.length > 0) {
        const parts: string[] = [];
        for (const item of contentSequence) {
          if (item.type === 'tool') parts.push(item.content);
          else if (item.type === 'thinking') {
            const truncated = item.content.length > 1024 ? item.content.slice(0, 1024) + "…" : item.content;
            parts.push(`<blockquote>💭 ${escapeHtml(truncated)}</blockquote>`);
          } else if (item.type === 'text') parts.push(item.content);
        }
        const finalText = markdownToTelegramHtml(parts.join("\n\n"));
        if (finalText.trim()) {
          botClient.api.editMessageText(chatId, replyMsgId, finalText, { parse_mode: "HTML" }).catch(() => {});
        }
      }
      // Reset streaming state for next reply
      replyMsgId = null;
      contentSequence.length = 0;
      seenToolCalls.clear();
      hasReceivedContent = false;
      toolCallSinceLastText = false;
      lastStreamAccumLen = 0;
      creatingReplyMsg = false;
      replyMsgPromise = null;
      hasNativeReply = false;
      initialized = false;
    },
    onThinkingStart: () => {
      if (isConcise) return;
      startThinkingBlock(contentSequence);
    },
    onThinkingDelta: (accumulated: string, _delta: string) => {
      // In concise-mode, suppress thinking output
      if (isConcise) return;
      
      lazyInit();
      sendChatAction();
      if (!hasReceivedContent) {
        stopSpinner();
        hasReceivedContent = true;
      }
      updateThinkingBlock(contentSequence, accumulated);
      pushLiveUpdate();
    },
    onThinkingEnd: () => {
      if (isConcise) return;
      endThinkingBlock(contentSequence);
    },
    onStreamDelta: (accumulated: string, delta?: string) => {
      // In concise-mode, suppress streaming output
      if (isConcise) return;
      
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
      // In concise-mode, suppress tool notifications
      if (isConcise) return;
      
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
      if (replyMsgPromise) await replyMsgPromise;
      const log = runtime.api.logger;
      
      // Concise-mode: if reply is [NO_REPLY], skip all output (including thinking/tools)
      const SILENT_TOKEN = "[NO_REPLY]";
      if ((reply ?? "").trim() === SILENT_TOKEN) {
        log.info(`[telegram:respond] concise-mode: suppressing all output for chatId=${chatId}`);
        // Clean up streaming state without sending anything
        log.info(`[telegram:respond] clearing typingInterval=${!!typingInterval}`);
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
        stopSpinner();
        // Optionally delete the placeholder message if it was created
        if (replyMsgId) {
          await botClient.api.deleteMessage(chatId, replyMsgId).catch(() => {});
        }
        return;
      }
      
      log.info(`[telegram:respond] chatId=${chatId} replyLen=${reply?.length ?? 0} replyMsgId=${replyMsgId}`);
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
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
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : "unknown";
          await botClient.api.sendMessage(chatId, `Failed to send ${media.kind}: ${reason}`).catch(() => {});
        }
      }
    },
    setTyping: async (typing: boolean) => {
      try {
        runtime.api.logger.info(`[telegram:setTyping] typing=${typing}, current typingInterval=${!!typingInterval}`);
        if (typing) {
          ensureTypingInterval();
          return;
        }
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
      } catch (e) {
        runtime.api.logger.error(`[telegram:setTyping] error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

    if (result?.injected && typingInterval) {
      runtime.api.logger.info(`[telegram:streaming] result.injected=true, clearing typingInterval`);
      clearInterval(typingInterval);
      typingInterval = null;
      stopSpinner();
      return;
    }
  } catch (err) {
    runtime.api.logger.error(`[telegram:dispatch] Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    runtime.api.logger.info(`[telegram:streaming] finally block: typingInterval=${!!typingInterval}`);
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    stopSpinner();
  }
}
