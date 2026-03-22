/**
 * Feishu channel plugin types.
 * Multi-account architecture aligned with openclaw.
 */

// ============================================================================
// Account Configuration
// ============================================================================

/**
 * Per-account configuration.
 * All fields are optional — missing fields inherit from top-level config.
 */
export interface FeishuAccountConfig {
  enabled?: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain?: FeishuDomain;
  connectionMode?: FeishuConnectionMode;
  webhookPath?: string;

  // Security
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];
  requireMention?: boolean;

  // Groups
  groups?: Record<string, FeishuGroupConfig>;

  // Messaging
  textChunkLimit?: number;
  renderMode?: "auto" | "raw" | "card";

  // Streaming
  streamingEnabled?: boolean;
  streamThrottleMs?: number;
  streamStartChars?: number;
  streamMode?: "cardkit" | "patch" | "off";

  // Tools
  tools?: FeishuToolsConfig;
  actions?: { reactions?: boolean };

  // Advanced
  historyLimit?: number;
  dmHistoryLimit?: number;
  typingIndicator?: boolean;
  resolveSenderNames?: boolean;
}

/**
 * Top-level Feishu configuration.
 * Supports both single-account (legacy) and multi-account modes.
 */
export interface FeishuChannelConfig {
  enabled?: boolean;
  defaultAccount?: string;

  // Top-level credentials (backward compatible for single-account mode)
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain?: FeishuDomain;
  connectionMode?: FeishuConnectionMode;
  webhookPath?: string;

  // Security (defaults for accounts)
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];
  requireMention?: boolean;

  // Groups
  groups?: Record<string, FeishuGroupConfig>;

  // Messaging
  textChunkLimit?: number;
  renderMode?: "auto" | "raw" | "card";
  chunkMode?: "length" | "newline";

  // Streaming
  streamingEnabled?: boolean;
  streamThrottleMs?: number;
  streamStartChars?: number;
  streamMode?: "cardkit" | "patch" | "off";

  // Tools
  tools?: FeishuToolsConfig;
  actions?: { reactions?: boolean };

  // Advanced
  historyLimit?: number;
  dmHistoryLimit?: number;
  typingIndicator?: boolean;
  resolveSenderNames?: boolean;

  // Multi-account configuration
  accounts?: Record<string, FeishuAccountConfig | undefined>;
}

// ============================================================================
// Group Configuration
// ============================================================================

export interface FeishuGroupConfig {
  requireMention?: boolean;
  tools?: { allow?: string[]; deny?: string[] };
  skills?: string[];
  enabled?: boolean;
  allowFrom?: (string | number)[];
  systemPrompt?: string;
  groupSessionScope?: "group" | "group_sender" | "group_topic" | "group_topic_sender";
  topicSessionMode?: "disabled" | "enabled";
  replyInThread?: "disabled" | "enabled";
}

// ============================================================================
// Tools Configuration
// ============================================================================

/**
 * Feishu tools configuration.
 * Controls which tool categories are enabled.
 *
 * Dependencies:
 * - wiki requires doc (wiki content is edited via doc tools)
 * - perm can work independently but is typically used with drive
 */
export interface FeishuToolsConfig {
  doc?: boolean;
  chat?: boolean;
  wiki?: boolean;
  drive?: boolean;
  perm?: boolean;
  scopes?: boolean;
}

// ============================================================================
// Types
// ============================================================================

export type FeishuDomain = "feishu" | "lark" | (string & {});
export type FeishuConnectionMode = "websocket" | "webhook";

export type FeishuAccountSelectionSource =
  | "explicit"
  | "explicit-default"
  | "mapped-default"
  | "fallback";

/**
 * Resolved Feishu account with merged config.
 */
export interface ResolvedFeishuAccount {
  accountId: string;
  selectionSource: FeishuAccountSelectionSource;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: FeishuDomain;
  /** Merged config (top-level defaults + account-specific overrides) */
  config: FeishuChannelConfig;
}

export type FeishuIdType = "open_id" | "user_id" | "union_id" | "chat_id";

export interface FeishuMessageContext {
  chatId: string;
  messageId: string;
  senderId: string;
  senderOpenId: string;
  senderName?: string;
  chatType: "p2p" | "group" | "private";
  mentionedBot: boolean;
  hasAnyMention?: boolean;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  content: string;
  contentType: string;
  mentionTargets?: MentionTarget[];
}

export interface FeishuSendResult {
  messageId: string;
  chatId: string;
}

export interface FeishuChatType {
  type: "p2p" | "group" | "private";
}

export interface FeishuMessageInfo {
  messageId: string;
  chatId: string;
  chatType?: "p2p" | "group" | "private";
  senderId?: string;
  senderOpenId?: string;
  senderType?: string;
  content: string;
  contentType: string;
  createTime?: number;
  threadId?: string;
}

export interface FeishuProbeResult {
  ok: boolean;
  appId?: string;
  botName?: string;
  botOpenId?: string;
  error?: string;
}

export interface FeishuMediaInfo {
  path: string;
  contentType?: string;
  placeholder: string;
}

export interface MentionTarget {
  id: string;
  idType: "open_id" | "user_id" | "union_id";
  name?: string;
  key?: string;
}

// ============================================================================
// API Result Types
// ============================================================================

export type ChannelInfoResult =
  | {
      ok: true;
      channel: {
        id: string;
        name?: string;
        type: "group" | "direct";
        description?: string;
        ownerId?: string;
        memberCount?: number;
        createTime?: number;
      };
    }
  | { ok: false; error: string };

export type MemberInfoResult =
  | {
      ok: true;
      members: Array<{
        id: string;
        name?: string;
        type?: string;
      }>;
      hasMore?: boolean;
      pageToken?: string;
    }
  | { ok: false; error: string };

export type ChannelListResult =
  | {
      ok: true;
      channels: Array<{
        id: string;
        name?: string;
        type: "group" | "direct";
        memberCount?: number;
      }>;
    }
  | { ok: false; error: string };

export type PinListResult =
  | {
      ok: true;
      pins: Array<{
        pinId: string;
        messageId: string;
        creatorId?: string;
        createTime?: number;
      }>;
    }
  | { ok: false; error: string };

// ============================================================================
// Plugin Runtime
// ============================================================================

export interface FeishuPluginRuntime {
  api: import("../../types.ts").GatewayPluginApi;
  channelCfg: FeishuChannelConfig;
  client: import("@larksuiteoapi/node-sdk").Client;
  botOpenId?: string;
  accountId: string;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_ACCOUNT_ID = "default";
