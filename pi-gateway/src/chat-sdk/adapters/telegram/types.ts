/**
 * Telegram adapter types for chat-sdk.
 */

/**
 * Group-specific configuration.
 */
export interface TelegramGroupConfig {
  /** Allowed sender IDs, or "*" for all */
  allowFrom?: string[] | "*";
  /** Whether the bot must be @mentioned to respond */
  requireMention?: boolean;
  /** Whether this group is enabled */
  enabled?: boolean;
}

/**
 * Media handling configuration.
 */
export interface TelegramMediaConfig {
  /** Where to save downloaded media */
  downloadDir?: string;
  /** Max image size before compression (bytes) */
  maxImageSize?: number;
  /** Upload retry count (default: 3) */
  retryCount?: number;
}

/**
 * Telegram adapter configuration.
 */
export interface TelegramAdapterConfig {
  /** Telegram bot token (falls back to TELEGRAM_BOT_TOKEN env var) */
  botToken: string;
  /** Use webhook mode instead of polling */
  webhook?: {
    url: string;
    secretToken?: string;
  };
  /** Custom Telegram API base URL (for proxies) */
  apiBaseUrl?: string;
  /** HTTP/SOCKS proxy URL */
  proxy?: string;
  /** Multi-account support: each account has its own botToken and optional proxy */
  accounts?: Record<string, { botToken: string; proxy?: string }>;
  /** Group-specific configuration keyed by chat ID */
  groups?: Record<string, TelegramGroupConfig>;
  /** Media handling configuration */
  media?: TelegramMediaConfig;
}

/**
 * Telegram thread ID components.
 * Format: telegram:{chatId} or telegram:{chatId}:{messageThreadId}
 */
export interface TelegramThreadId {
  /** Telegram chat ID (can be negative for groups) */
  chatId: string;
  /** Forum topic thread ID (optional, for supergroup topics) */
  messageThreadId?: string;
}

/**
 * Telegram raw update type (subset used for parsing).
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramRawMessage;
  edited_message?: TelegramRawMessage;
  channel_post?: TelegramRawMessage;
  edited_channel_post?: TelegramRawMessage;
}

export interface TelegramRawMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  message_thread_id?: number;
  reply_to_message?: TelegramRawMessage;
  edit_date?: number;
  photo?: TelegramPhotoSize[];
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  sticker?: {
    file_id: string;
    file_unique_id: string;
    emoji?: string;
    set_name?: string;
    is_animated?: boolean;
    is_video?: boolean;
  };
  voice?: { file_id: string; duration?: number; mime_type?: string };
  video?: { file_id: string; file_name?: string; mime_type?: string; duration?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; duration?: number; performer?: string; title?: string };
  animation?: { file_id: string; file_name?: string; mime_type?: string };
  video_note?: { file_id: string; duration?: number; length?: number };
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  /** Media group ID for album messages */
  media_group_id?: string;
  /** Forward origin (Bot API 7.0+) */
  forward_origin?: TelegramForwardOrigin;
  /** Legacy forward fields */
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat & { type?: string };
  forward_from_message_id?: number;
  forward_sender_name?: string;
  forward_date?: number;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

/**
 * Forward origin types (Bot API 7.0+).
 */
export type TelegramForwardOrigin =
  | { type: "user"; sender_user: TelegramUser; date?: number }
  | { type: "hidden_user"; sender_user_name?: string; date?: number }
  | { type: "chat"; sender_chat: TelegramChat; author_signature?: string; date?: number }
  | { type: "channel"; chat: TelegramChat & { username?: string }; message_id?: number; author_signature?: string; date?: number };

/**
 * Media item for sending.
 */
export interface MediaItem {
  /** Media kind */
  kind: "photo" | "audio" | "video" | "document" | "sticker";
  /** File path (local), URL (remote), or file_id (Telegram cached) */
  source: string;
  /** Optional caption */
  caption?: string;
}

/**
 * Options for sending media.
 */
export interface SendMediaOpts {
  messageThreadId?: number;
  replyToMessageId?: number;
}

/**
 * Result of a media group merge (buffered album messages).
 */
export interface MediaGroupEntry {
  texts: string[];
  attachments: Array<{
    type: "image" | "file" | "video" | "audio";
    url?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    fileId?: string;
  }>;
  timer: ReturnType<typeof setTimeout>;
  lastMsg: TelegramRawMessage;
}

/**
 * Result of group message filtering.
 */
export interface GroupFilterResult {
  allowed: boolean;
  text: string;
}
