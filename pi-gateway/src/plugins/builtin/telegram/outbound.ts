/**
 * Telegram Outbound — send text, media, and message actions (react/edit/delete).
 *
 * Extracted from handlers.ts (v3.7) to keep each file < 500 lines.
 */

import { basename } from "node:path";
import { splitMessage } from "../../../core/utils.ts";
import { markdownToTelegramHtml } from "./format.ts";
import { sendTelegramMedia, sendTelegramTextAndMedia, IMAGE_EXTS, AUDIO_EXTS } from "./media-send.ts";
import { recordSentMessage } from "./sent-message-cache.ts";
import { isRecoverableTelegramNetworkError } from "./network-errors.ts";
import type { MediaSendOptions, MediaSendResult, MessageSendResult, MessageActionResult, ReactionOptions, ReadHistoryResult } from "../../types.ts";
import type { TelegramPluginRuntime } from "./types.ts";

const MEDIA_SEND_RETRY_DELAYS_MS = [600, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supportsHttpFallback(kind: "photo" | "audio" | "file" | "sticker"): kind is "photo" | "audio" | "file" {
  return kind === "photo" || kind === "audio" || kind === "file";
}

async function sendViaTelegramHttpApi(params: {
  token: string;
  chatId: string;
  kind: "photo" | "audio" | "file";
  filePath: string;
  caption?: string;
  threadId?: number;
}): Promise<void> {
  const method = params.kind === "photo" ? "sendPhoto" : params.kind === "audio" ? "sendAudio" : "sendDocument";
  const field = params.kind === "photo" ? "photo" : params.kind === "audio" ? "audio" : "document";
  const form = new FormData();
  form.set("chat_id", params.chatId);
  if (params.threadId) form.set("message_thread_id", String(params.threadId));
  if (params.caption?.trim()) {
    form.set("caption", markdownToTelegramHtml(params.caption.trim()));
    form.set("parse_mode", "HTML");
  }
  if (/^https?:\/\//i.test(params.filePath)) {
    form.set(field, params.filePath);
  } else {
    const fileName = basename(params.filePath) || "file";
    form.set(field, Bun.file(params.filePath), fileName);
  }

  const res = await fetch(`https://api.telegram.org/bot${params.token}/${method}`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`http-fallback ${method} status=${res.status} body=${text.slice(0, 240)}`);
  }
  try {
    const data = JSON.parse(text) as { ok?: boolean; description?: string };
    if (!data.ok) {
      throw new Error(`http-fallback ${method} api_error=${data.description ?? "unknown"}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("http-fallback")) throw err;
    throw new Error(`http-fallback ${method} invalid_json`);
  }
}

function formatErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as Error & {
      code?: string;
      cause?: unknown;
      description?: string;
      error_code?: number;
      error?: unknown;
    };
    const nestedError = anyErr.error as (Error & { code?: string; cause?: unknown }) | undefined;
    const parts = [
      `${anyErr.name}: ${anyErr.message}`,
      anyErr.code ? `code=${anyErr.code}` : "",
      typeof anyErr.error_code === "number" ? `error_code=${anyErr.error_code}` : "",
      anyErr.description ? `description=${anyErr.description}` : "",
      anyErr.cause ? `cause=${String(anyErr.cause)}` : "",
      nestedError ? `inner=${nestedError.name}: ${nestedError.message}` : (anyErr.error ? `inner=${String(anyErr.error)}` : ""),
      nestedError?.code ? `inner_code=${nestedError.code}` : "",
      nestedError?.cause ? `inner_cause=${String(nestedError.cause)}` : "",
    ].filter(Boolean);
    if (anyErr.stack) {
      const stackHead = anyErr.stack.split("\n").slice(0, 6).join(" | ");
      parts.push(`stack=${stackHead}`);
    }
    if (nestedError?.stack) {
      const innerStackHead = nestedError.stack.split("\n").slice(0, 6).join(" | ");
      parts.push(`inner_stack=${innerStackHead}`);
    }
    return parts.join("; ");
  }
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ============================================================================
// Target parsing
// ============================================================================

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

function resolveAccount(runtime: TelegramPluginRuntime, target: string, defaultAccountId: string) {
  const parsed = parseTelegramTarget(target, defaultAccountId);
  const account = runtime.accounts.get(parsed.accountId)
    ?? runtime.accounts.get(defaultAccountId)
    ?? Array.from(runtime.accounts.values())[0];
  return { account, parsed };
}

// ============================================================================
// Send text
// ============================================================================

export async function sendOutboundViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  text: string;
}): Promise<MessageSendResult> {
  const parsed = parseTelegramTarget(params.target, params.defaultAccountId);
  const account = params.runtime.accounts.get(parsed.accountId)
    ?? params.runtime.accounts.get(params.defaultAccountId)
    ?? Array.from(params.runtime.accounts.values())[0];
  if (!account) {
    return { ok: false, error: "Telegram account not started" };
  }

  const threadId = parsed.topicId ? Number.parseInt(parsed.topicId, 10) : undefined;

  let firstMessageId: string | undefined;
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
        firstMessageId ??= String(sent.message_id);
      }
    } catch {
      const sent = await account.bot.api.sendMessage(parsed.chatId, chunk, threadId ? { message_thread_id: threadId } : undefined);
      recordSentMessage(parsed.chatId, sent.message_id);
      firstMessageId ??= String(sent.message_id);
    }
  }

  params.runtime.api.logger.info(
    `[telegram:${account.accountId}] outbound to=${params.target} textLen=${params.text.length}`,
  );

  return { ok: true, messageId: firstMessageId };
}

// ============================================================================
// Send media
// ============================================================================

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

  const ext = params.filePath.split(".").pop()?.toLowerCase() ?? "";
  const typeHint = params.opts?.type;
  const kind: "photo" | "audio" | "file" | "sticker" = typeHint === "sticker" ? "sticker"
    : typeHint === "photo" ? "photo"
    : typeHint === "audio" ? "audio"
    : typeHint === "video" || typeHint === "document" ? "file"
    : IMAGE_EXTS.has(ext) ? "photo"
    : AUDIO_EXTS.has(ext) ? "audio"
    : "file";

  const preferFallback = account.mediaSendMode === "http-fallback" && supportsHttpFallback(kind);
  if (preferFallback) {
    try {
      await sendViaTelegramHttpApi({
        token: account.token,
        chatId: parsed.chatId,
        kind,
        filePath: params.filePath,
        caption: params.opts?.caption,
        threadId,
      });
      params.runtime.api.logger.info(
        `[telegram:${account.accountId}] sendMedia via sticky fallback kind=${kind} path=${params.filePath}`,
      );
      return { ok: true };
    } catch (stickyErr: unknown) {
      params.runtime.api.logger.warn(
        `[telegram:${account.accountId}] sticky fallback failed, retrying primary path: ${formatErrorDetail(stickyErr)}`,
      );
    }
  }

  let lastErr: unknown;
  const usePrimaryRetries = !supportsHttpFallback(kind);
  const totalAttempts = usePrimaryRetries ? (MEDIA_SEND_RETRY_DELAYS_MS.length + 1) : 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      await sendTelegramMedia(account.bot, parsed.chatId, {
        kind,
        url: params.filePath,
        caption: params.opts?.caption,
      }, {
        ...(threadId ? { messageThreadId: threadId } : {}),
        skipPathValidation: true,
      });

      params.runtime.api.logger.info(
        `[telegram:${account.accountId}] sendMedia to=${params.target} path=${params.filePath} kind=${kind} attempt=${attempt}/${totalAttempts}`,
      );
      return { ok: true };
    } catch (err: unknown) {
      lastErr = err;
      const recoverable = isRecoverableTelegramNetworkError(err);
      const detail = formatErrorDetail(err);
      params.runtime.api.logger.warn(
        `[telegram:${account.accountId}] sendMedia attempt ${attempt}/${totalAttempts} failed recoverable=${recoverable}: ${detail}`,
      );
      if (!recoverable || attempt >= totalAttempts) break;
      if (!usePrimaryRetries) break;
      await sleep(MEDIA_SEND_RETRY_DELAYS_MS[attempt - 1]!);
    }
  }

  if (lastErr && isRecoverableTelegramNetworkError(lastErr) && supportsHttpFallback(kind)) {
    try {
      await sendViaTelegramHttpApi({
        token: account.token,
        chatId: parsed.chatId,
        kind,
        filePath: params.filePath,
        caption: params.opts?.caption,
        threadId,
      });
      account.mediaSendMode = "http-fallback";
      account.mediaFallbackSince = Date.now();
      params.runtime.api.logger.warn(
        `[telegram:${account.accountId}] sendMedia recovered via http fallback kind=${kind}; sticky mode enabled`,
      );
      return { ok: true };
    } catch (fallbackErr: unknown) {
      const fallbackDetail = formatErrorDetail(fallbackErr);
      params.runtime.api.logger.warn(
        `[telegram:${account.accountId}] http fallback failed kind=${kind}: ${fallbackDetail}`,
      );

      if (kind === "photo") {
        try {
          await sendViaTelegramHttpApi({
            token: account.token,
            chatId: parsed.chatId,
            kind: "file",
            filePath: params.filePath,
            caption: params.opts?.caption,
            threadId,
          });
          account.mediaSendMode = "http-fallback";
          account.mediaFallbackSince = Date.now();
          params.runtime.api.logger.warn(
            `[telegram:${account.accountId}] sendMedia recovered via document downgrade; sticky mode enabled`,
          );
          return { ok: true };
        } catch (downgradeErr: unknown) {
          params.runtime.api.logger.warn(
            `[telegram:${account.accountId}] document downgrade failed: ${formatErrorDetail(downgradeErr)}`,
          );
        }
      }
    }
  }

  const detail = formatErrorDetail(lastErr);
  params.runtime.api.logger.error(
    `[telegram:${account.accountId}] sendMedia failed: ${detail}`,
  );
  return { ok: false, error: detail };
}

// ============================================================================
// Message actions: react / edit / delete (v3.6)
// ============================================================================

export async function sendReactionViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  messageId: string;
  emoji: string | string[];
  opts?: ReactionOptions;
}): Promise<MessageActionResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  const emojiList = Array.isArray(params.emoji) ? params.emoji : [params.emoji];
  const reactions = params.opts?.remove
    ? []
    : emojiList.map((e) => ({ type: "emoji" as const, emoji: e }));

  try {
    await account.bot.api.setMessageReaction(
      parsed.chatId,
      Number(params.messageId),
      reactions,
    );
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Reaction failed" };
  }
}

export async function editMessageViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  messageId: string;
  text: string;
}): Promise<MessageActionResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  try {
    await account.bot.api.editMessageText(
      parsed.chatId,
      Number(params.messageId),
      markdownToTelegramHtml(params.text),
      { parse_mode: "HTML" },
    );
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Edit failed" };
  }
}

export async function deleteMessageViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  messageId: string;
}): Promise<MessageActionResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  try {
    await account.bot.api.deleteMessage(parsed.chatId, Number(params.messageId));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

export async function pinMessageViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  messageId: string;
  unpin?: boolean;
}): Promise<MessageActionResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  try {
    if (params.unpin) {
      await account.bot.api.unpinChatMessage(parsed.chatId, { message_id: Number(params.messageId) });
    } else {
      await account.bot.api.pinChatMessage(parsed.chatId, Number(params.messageId));
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Pin failed" };
  }
}

export async function readHistoryViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  limit?: number;
  before?: string;
}): Promise<ReadHistoryResult> {
  // Telegram Bot API doesn't have a getHistory method.
  // Use getChat + recent updates cache, or return not supported.
  // For now, Telegram bots cannot read arbitrary chat history via Bot API.
  return { ok: false, error: "Telegram Bot API does not support reading chat history" };
}

// ============================================================================
// Inline keyboard (v3.9)
// ============================================================================

export async function sendKeyboardViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  text: string;
  keyboard: import("../../types.ts").InlineKeyboardMarkup;
}): Promise<MessageSendResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  const threadId = parsed.topicId ? Number.parseInt(parsed.topicId, 10) : undefined;

  try {
    const sent = await account.bot.api.sendMessage(parsed.chatId, markdownToTelegramHtml(params.text), {
      parse_mode: "HTML",
      reply_markup: params.keyboard,
      ...(threadId ? { message_thread_id: threadId } : {}),
    });
    recordSentMessage(parsed.chatId, sent.message_id);
    return { ok: true, messageId: String(sent.message_id) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "sendKeyboard failed" };
  }
}

export async function editMessageMarkupViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  messageId: string;
  text: string;
  keyboard?: import("../../types.ts").InlineKeyboardMarkup;
}): Promise<MessageActionResult> {
  const { account, parsed } = resolveAccount(params.runtime, params.target, params.defaultAccountId);
  if (!account) return { ok: false, error: "Telegram account not started" };

  try {
    await account.bot.api.editMessageText(
      parsed.chatId,
      Number(params.messageId),
      markdownToTelegramHtml(params.text),
      {
        parse_mode: "HTML",
        ...(params.keyboard ? { reply_markup: params.keyboard } : {}),
      },
    );
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "editMessageMarkup failed" };
  }
}
