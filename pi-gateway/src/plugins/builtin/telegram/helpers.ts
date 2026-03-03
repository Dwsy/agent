/**
 * Shared Telegram helpers — extracted to avoid duplication across modules.
 */

import type { MessageSource } from "../../../core/types.ts";
import type { TelegramContext } from "./types.ts";

export function toChatType(chatType?: string): "dm" | "group" {
  return chatType === "private" ? "dm" : "group";
}

export function toSource(accountId: string, ctx: TelegramContext): MessageSource {
  const carrier = (ctx.message ?? ctx.callbackQuery?.message ?? ctx.update?.edited_message) as any;
  return {
    channel: "telegram",
    accountId,
    chatType: toChatType(ctx.chat?.type ?? carrier?.chat?.type),
    chatId: String(ctx.chat?.id ?? carrier?.chat?.id ?? ""),
    topicId: carrier?.message_thread_id
      ? String(carrier.message_thread_id)
      : undefined,
    senderId: String(ctx.from?.id ?? "unknown"),
    senderName: ctx.from?.username ?? ctx.from?.first_name,
  };
}

export function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}
