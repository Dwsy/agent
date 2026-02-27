/**
 * @chat-adapter/telegram — Telegram adapter for chat-sdk.
 *
 * @example
 * ```typescript
 * import { createTelegramAdapter } from "./chat-sdk/adapters/telegram";
 * import { Chat, createMemoryState } from "chat";
 *
 * const chat = new Chat({
 *   userName: "mybot",
 *   adapters: {
 *     telegram: createTelegramAdapter({ botToken: "..." }),
 *   },
 *   state: createMemoryState(),
 * });
 * ```
 */

export { TelegramAdapter, createTelegramAdapter, buildForwardContext, buildReplyContext } from "./adapter.ts";
export { TelegramFormatConverter, escapeHtml, markdownToTelegramHtml } from "./format.ts";
export { verifyWebhookSecret, parseWebhookUpdate, webhookOk, webhookError } from "./webhook.ts";
export { detectMediaKind, parseMediaDirectives, downloadTelegramFile, sendMediaViaHttpApi, IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS, STICKER_EXTS } from "./media.ts";
export { shouldAllowGroupMessage, resolveGroupConfig } from "./groups.ts";
export { isTransientError, isGetUpdatesConflict, withRetry } from "./network.ts";
export type {
  TelegramAdapterConfig,
  TelegramGroupConfig,
  TelegramMediaConfig,
  TelegramThreadId,
  TelegramUpdate,
  TelegramRawMessage,
  TelegramUser,
  TelegramChat,
  TelegramPhotoSize,
  TelegramMessageEntity,
  TelegramForwardOrigin,
  MediaItem,
  SendMediaOpts,
  MediaGroupEntry,
  GroupFilterResult,
} from "./types.ts";
