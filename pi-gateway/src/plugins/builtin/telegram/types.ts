import type { Bot } from "grammy";
import type { Server } from "node:http";
import type {
  TelegramAccountConfig,
  TelegramChannelConfig,
  TelegramProviderCommandsConfig,
} from "../../../core/config.ts";
import type { MessageSource, ImageContent } from "../../../core/types.ts";
import type { GatewayPluginApi } from "../../types.ts";

export const DEFAULT_ACCOUNT_ID = "default";

export type TelegramStartMode = "polling" | "webhook";

export interface TelegramMediaRef {
  type: "image";
  data: string;
  mimeType: string;
}

export interface TelegramDebouncedEntry {
  texts: string[];
  images: ImageContent[];
  ctx: TelegramContext;
  source: MessageSource;
  timer: ReturnType<typeof setTimeout>;
}

export interface TelegramMediaDirective {
  kind: "photo" | "audio" | "file" | "sticker";
  url: string;
  caption?: string;
}

export interface StickerMetadata {
  emoji?: string;
  setName?: string;
  fileId: string;
  fileUniqueId: string;
  /** Whether this was resolved from a thumbnail (animated/video sticker). */
  isThumbnail?: boolean;
  /** Absolute path to the saved sticker file on disk. */
  savedPath?: string;
}

export interface TelegramParsedOutbound {
  text: string;
  media: TelegramMediaDirective[];
}

export interface TelegramResolvedAccount {
  accountId: string;
  enabled: boolean;
  token: string;
  cfg: TelegramAccountConfig;
}

export interface TelegramAccountRuntime {
  accountId: string;
  token: string;
  cfg: TelegramAccountConfig;
  bot: Bot;
  api: GatewayPluginApi;
  started: boolean;
  startMode: TelegramStartMode;
  /** Media send transport mode (process-memory circuit breaker). */
  mediaSendMode?: "auto" | "http-fallback";
  /** Timestamp when fallback mode was activated. */
  mediaFallbackSince?: number;
  stopPolling?: () => Promise<void>;
  stopWebhook?: () => Promise<void>;
  webhookServer?: Server;
  botId?: string;
  botUsername?: string;
  debounceMap: Map<string, TelegramDebouncedEntry>;
  mediaGroupMap: Map<string, TelegramPendingMediaGroup>;
  seenUpdates: Set<number>;
  seenCallbacks: Set<string>;
  seenEditedEvents: Set<string>;
}

export interface TelegramPendingMediaGroup {
  texts: string[];
  images: ImageContent[];
  ctx: TelegramContext;
  timer: ReturnType<typeof setTimeout>;
}

export interface TelegramPluginRuntime {
  api: GatewayPluginApi;
  channelCfg: TelegramChannelConfig;
  accounts: Map<string, TelegramAccountRuntime>;
}

export interface TelegramFileDownload {
  data: string;
  mimeType: string;
  filePath?: string;
}

export interface TelegramModelButtonState {
  provider?: string;
  page?: number;
}

export type TelegramCommandsConfig = TelegramProviderCommandsConfig;

export interface TelegramContext {
  chat?: {
    id: number | string;
    type: string;
    is_forum?: boolean;
  };
  from?: {
    id?: number | string;
    username?: string;
    first_name?: string;
    is_bot?: boolean;
  };
  me?: {
    id?: number | string;
    username?: string;
  };
  message?: TelegramMessage;
  update?: {
    update_id?: number;
    edited_message?: TelegramMessage;
    message_reaction?: {
      chat?: { id: number | string };
      user?: { id?: number | string; username?: string; first_name?: string };
      old_reaction?: Array<{ type: string; emoji?: string }>;
      new_reaction?: Array<{ type: string; emoji?: string }>;
    };
  };
  match?: string;
  callbackQuery?: {
    id: string;
    data?: string;
    from?: { id?: number | string; username?: string; first_name?: string };
    message?: TelegramMessage;
  };
  getFile: (fileId?: string) => Promise<{ file_path?: string }>;
  reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown>;
  answerCallbackQuery?: (opts?: Record<string, unknown>) => Promise<unknown>;
}

export interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  message_thread_id?: number;
  media_group_id?: string;
  date?: number;
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; duration?: number };
  video?: { file_id: string; file_name?: string; mime_type?: string; duration?: number };
  video_note?: { file_id: string; duration?: number; length?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; duration?: number; performer?: string; title?: string };
  animation?: { file_id: string; file_name?: string; mime_type?: string };
  sticker?: {
    file_id: string;
    file_unique_id: string;
    emoji?: string;
    set_name?: string;
    is_animated?: boolean;
    is_video?: boolean;
    thumbnail?: { file_id: string };
  };
  // Forward fields (Bot API 7.0+ forward_origin, plus legacy fields)
  forward_origin?: {
    type: "user" | "hidden_user" | "chat" | "channel";
    date?: number;
    sender_user?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
    sender_user_name?: string;
    sender_chat?: { id?: number | string; title?: string; username?: string; type?: string };
    chat?: { id?: number | string; title?: string; username?: string; type?: string };
    message_id?: number;
    author_signature?: string;
  };
  forward_from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  forward_from_chat?: { id?: number | string; title?: string; username?: string; type?: string };
  forward_from_message_id?: number;
  forward_date?: number;
  forward_sender_name?: string;
  migrate_to_chat_id?: number | string;
  chat: {
    id: number | string;
    type: string;
    is_forum?: boolean;
  };
  from?: {
    id?: number | string;
    username?: string;
    first_name?: string;
    is_bot?: boolean;
  };
}
