import type { GatewayPluginApi } from "../../types.ts";
import type { ThinkingLevel } from "../../../core/types.ts";

/**
 * Weixin channel types - only direct messages supported via ilink API.
 */
export type WechatChatType = "direct";

/**
 * Weixin peer types for message routing.
 */
export type WechatPeerType = "c2c";

/**
 * Weixin streaming configuration.
 */
export interface WechatStreamingConfig {
  enabled?: boolean;
  editThrottleMs?: number;
  streamStartChars?: number;
}

/**
 * Weixin channel configuration.
 */
export interface WechatChannelConfig {
  enabled: boolean;
  /** Account ID from QR login (e.g., "xxx@im.bot" normalized to "xxx-im-bot") */
  accountId?: string;
  /** ilink API base URL (default: https://ilinkai.weixin.qq.com) */
  baseUrl?: string;
  /** CDN base URL for media upload/download */
  cdnBaseUrl?: string;
  /** Bot token obtained from QR login */
  token?: string;
  /** DM policy: open, allowlist, pairing, disabled */
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  /** Allowed sender IDs for DM (when dmPolicy is allowlist) */
  allowFrom?: Array<string | number>;
  /** Role override for this channel */
  role?: string;
  /** Model override for this channel */
  model?: string;
  /** Thinking level override */
  thinkingLevel?: ThinkingLevel;
  /** Text chunk limit (Weixin supports up to ~4000 chars) */
  textChunkLimit?: number;
  /** Streaming configuration */
  streaming?: WechatStreamingConfig;
  /** Multiple accounts configuration */
  accounts?: Record<string, WechatAccountConfig>;
}

/**
 * Per-account configuration.
 */
export interface WechatAccountConfig {
  enabled?: boolean;
  name?: string;
  token?: string;
  baseUrl?: string;
  cdnBaseUrl?: string;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: Array<string | number>;
  routeTag?: string | number;
}

/**
 * Resolved account with all necessary data.
 */
export interface WechatResolvedAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  userId?: string;
  dmPolicy: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom: Array<string | number>;
}

/**
 * Weixin authentication token with expiry.
 */
export interface WechatAuthToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Inbound message attachment from Weixin.
 */
export interface WechatInboundAttachment {
  type: "image" | "video" | "file" | "voice";
  mediaUrl?: string;
  mediaPath?: string;
  contentType?: string;
  filename?: string;
  /** CDN encrypted query param */
  encryptQueryParam?: string;
  /** AES key for decryption */
  aesKey?: string;
}

/**
 * Inbound message author information.
 */
export interface WechatInboundAuthor {
  id?: string;
  username?: string;
}

/**
 * Inbound message item from ilink API.
 */
export interface WechatMessageItem {
  type: "text" | "image" | "video" | "file" | "voice" | 1 | 2 | 3 | 4 | 5;
  text_item?: { text: string };
  image_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    mid_size: number;
  };
  video_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    video_size: number;
  };
  file_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    file_name: string;
    len: string;
  };
  voice_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    duration: number;
    text?: string; // Voice-to-text transcription
  };
  ref_msg?: {
    title?: string;
    message_item?: WechatMessageItem;
  };
}

/**
 * Inbound message from ilink getUpdates API.
 */
export interface WechatInboundMessage {
  from_user_id: string;
  to_user_id: string;
  msg_id?: string;
  message_id?: string | number;
  create_time_ms?: number;
  message_type?: number;
  message_state?: number;
  item_list?: WechatMessageItem[];
  context_token?: string;
}

/**
 * Parsed message context for internal routing.
 */
export interface WechatMessageContext {
  chatType: WechatChatType;
  peerType: WechatPeerType;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  messageId: string;
  mentionedBot: boolean;
  attachments?: WechatInboundAttachment[];
  timestamp?: number;
  /** Context token for reply association - CRITICAL for outbound */
  contextToken?: string;
}

/**
 * Send target for Weixin outbound messages.
 */
export interface WechatTarget {
  peerType: WechatPeerType;
  id: string;
  msgId?: string;
  contextToken?: string;
}

/**
 * Weixin plugin runtime state (single account).
 */
export interface WechatAccountRuntime {
  api: GatewayPluginApi;
  channelCfg: WechatChannelConfig;
  /** Account ID (normalized, e.g., "xxx-im-bot") */
  accountId: string;
  /** Bot token from QR login */
  token?: string;
  /** ilink API base URL */
  baseUrl: string;
  /** CDN base URL for media */
  cdnBaseUrl: string;
  /** Long-poll timeout ID */
  pollTimer?: ReturnType<typeof setTimeout> | null;
  /** Reconnect timer ID */
  reconnectTimer?: ReturnType<typeof setTimeout> | null;
  /** Disposed flag */
  disposed: boolean;
  /** Context token cache: userId -> contextToken */
  contextTokens: Map<string, string>;
  /** Deduplication map: messageId -> timestamp */
  dedup: Map<string, number>;
  /** Streaming placeholders */
  streamPlaceholders: Map<string, { target: string; messageId: string }>;
  /** Sync buffer for get_updates_buf */
  syncBuf: string;
  /** Path to sync buffer file */
  syncBufPath: string;
  /** Last event timestamp */
  lastEventAt?: number;
  /** Last inbound message timestamp */
  lastInboundAt?: number;
  /** Last outbound message timestamp */
  lastOutboundAt?: number;
  /** Last error */
  lastError?: string;
  /** Typing ticket for sendTyping */
  typingTicket?: string;
  /** Account name */
  name?: string;
  /** User ID from QR login */
  userId?: string;
  /** DM policy */
  dmPolicy: "open" | "allowlist" | "pairing" | "disabled";
  /** Allowed sender IDs */
  allowFrom: Array<string | number>;
}

/**
 * Weixin plugin runtime state (multi-account).
 */
export interface WechatPluginRuntime {
  api: GatewayPluginApi;
  channelCfg: WechatChannelConfig;
  /** Account ID for default account */
  accountId?: string;
  /** Bot token from QR login */
  token?: string;
  /** ilink API base URL */
  baseUrl: string;
  /** CDN base URL for media */
  cdnBaseUrl: string;
  /** Long-poll timeout ID */
  pollTimer?: ReturnType<typeof setTimeout> | null;
  /** Reconnect timer ID */
  reconnectTimer?: ReturnType<typeof setTimeout> | null;
  /** Disposed flag */
  disposed: boolean;
  /** Context token cache: accountId:userId -> contextToken */
  contextTokens: Map<string, string>;
  /** Deduplication map: messageId -> timestamp */
  dedup: Map<string, number>;
  /** Streaming placeholders */
  streamPlaceholders: Map<string, { target: string; messageId: string }>;
}

/**
 * Outbound message item for ilink sendMessage API.
 */
export interface WechatOutboundItem {
  type: "text" | "image" | "video" | "file" | 1 | 2 | 4 | 5;
  text_item?: { text: string };
  image_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    aeskey?: string;
    mid_size: number;
    hd_size?: number;
  };
  video_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    video_size: number;
    video_md5?: string;
  };
  file_item?: {
    media: {
      encrypt_query_param: string;
      aes_key: string;
      encrypt_type: number;
    };
    file_name: string;
    md5?: string;
    len: string;
  };
}

/**
 * Send message request for ilink API.
 */
export interface WechatSendMessageReq {
  msg: {
    from_user_id: string;
    to_user_id: string;
    client_id: string;
    message_type: number;
    message_state: number;
    item_list?: WechatOutboundItem[];
    context_token?: string;
  };
}

/**
 * Uploaded file info from CDN upload.
 */
export interface WechatUploadedFile {
  filekey: string;
  fileSize: number;
  fileSizeCiphertext: number;
  fileMd5?: string;
  aeskey: Buffer;
  downloadEncryptedQueryParam: string;
}
