/**
 * Telegram Outbound — send text, media, and message actions (react/edit/delete).
 *
 * Extracted from handlers.ts (v3.7) to keep each file < 500 lines.
 */

import { splitMessage } from "../../../core/utils.ts";
import { markdownToTelegramHtml } from "./format.ts";
import { sendTelegramMedia, sendTelegramTextAndMedia, IMAGE_EXTS, AUDIO_EXTS } from "./media-send.ts";
import { recordSentMessage } from "./sent-message-cache.ts";
import type { MediaSendOptions, MediaSendResult, MessageSendResult, MessageActionResult, ReactionOptions, ReadHistoryResult } from "../../types.ts";
import type { TelegramPluginRuntime } from "./types.ts";

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
      `[telegram:${account.accountId}] sendMedia to=${params.target} path=${params.filePath} kind=${kind}`,
    );
    return { ok: true };
  } catch (err: unknown) {
    params.runtime.api.logger.error(
      `[telegram:${account.accountId}] sendMedia failed: ${(err instanceof Error ? err.message : String(err))}`,
    );
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
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
