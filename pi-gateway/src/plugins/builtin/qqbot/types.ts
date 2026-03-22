import type { GatewayPluginApi } from "../../types.ts";
import type { ThinkingLevel } from "../../../core/types.ts";

export type QqbotPeerType = "c2c" | "group" | "guild" | "dm";
export type QqbotChatType = "dm" | "group" | "channel";
export type QqbotFileType = 1 | 2 | 3 | 4;

export interface QqbotStreamingConfig {
  enabled?: boolean;
  editThrottleMs?: number;
  streamStartChars?: number;
}

export interface QqbotChannelConfig {
  enabled: boolean;
  appId?: string;
  clientSecret?: string;
  clientSecretFile?: string;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: Array<string | number>;
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: Array<string | number>;
  requireMention?: boolean;
  role?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  textChunkLimit?: number;
  passiveReplyOnly?: boolean;
  streaming?: QqbotStreamingConfig;
}

export interface QqbotAuthToken {
  accessToken: string;
  expiresAt: number;
}

export interface QqbotInboundAttachment {
  url?: string;
  contentType?: string;
  filename?: string;
}

export interface QqbotInboundAuthor {
  id?: string;
  username?: string;
  member_openid?: string;
  user_openid?: string;
}

export interface QqbotInteractionResolvedData {
  button_data?: string;
  button_id?: string;
  user_id?: string;
  message_id?: string;
}

export interface QqbotInteractionPayload {
  resolved?: QqbotInteractionResolvedData;
  type?: number;
}

export interface QqbotInboundEvent {
  id?: string;
  msg_id?: string;
  event_id?: string;
  group_openid?: string;
  group_id?: string;
  channel_id?: string;
  guild_id?: string;
  src_guild_id?: string;
  user_openid?: string;
  group_member_openid?: string;
  chat_type?: number;
  type?: number;
  scene?: "c2c" | "group" | "guild";
  version?: number;
  data?: QqbotInteractionPayload;
  author?: QqbotInboundAuthor;
  content?: string;
  timestamp?: string;
  attachments?: QqbotInboundAttachment[];
  mentions?: Array<{ id?: string; username?: string; bot?: boolean }>;
}

export interface QqbotMessageContext {
  eventType: string;
  peerType: QqbotPeerType;
  chatType: QqbotChatType;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  messageId: string;
  eventId?: string;
  guildId?: string;
  channelId?: string;
  mentionedBot: boolean;
  attachments?: QqbotInboundAttachment[];
  timestamp?: number;
}

export interface QqbotInteractionContext {
  interactionId: string;
  chatType: QqbotChatType;
  peerType: QqbotPeerType;
  chatId: string;
  senderId: string;
  guildId?: string;
  channelId?: string;
  buttonData?: string;
  buttonId?: string;
  messageId?: string;
  eventId?: string;
  timestamp?: number;
}

export interface QqbotSendMeta {
  msgId?: string;
  eventId?: string;
  msgSeq?: number;
  passive?: boolean;
}

export interface QqbotTarget {
  peerType: QqbotPeerType;
  id: string;
  guildId?: string;
  channelId?: string;
  msgId?: string;
  eventId?: string;
  msgSeq?: number;
}

export interface QqbotButtonAction {
  type: 0 | 1 | 2;
  data: string;
  unsupport_tips: string;
  permission: {
    type: 0 | 1 | 2 | 3;
    specify_user_ids?: string[];
    specify_role_ids?: string[];
  };
  reply?: boolean;
  enter?: boolean;
}

export interface QqbotKeyboardButton {
  id?: string;
  render_data: {
    label: string;
    visited_label: string;
    style: 0 | 1;
  };
  action: QqbotButtonAction;
}

export interface QqbotKeyboardPayload {
  content: {
    rows: Array<{ buttons: QqbotKeyboardButton[] }>;
  };
}

export interface QqbotPluginRuntime {
  api: GatewayPluginApi;
  channelCfg: QqbotChannelConfig;
  botId?: string;
  intents: number;
  token?: QqbotAuthToken;
  ws?: WebSocket | null;
  seq?: number | null;
  sessionId?: string;
  heartbeatIntervalMs?: number;
  heartbeatTimer?: ReturnType<typeof setInterval> | null;
  reconnectTimer?: ReturnType<typeof setTimeout> | null;
  disposed?: boolean;
  dedup: Map<string, number>;
  replyState: Map<string, QqbotSendMeta>;
  streamPlaceholders: Map<string, { target: string; messageId: string }>;
  /** 按用户并发锁：防止同一用户快速发送多条消息导致响应乱序 */
  dispatchLock: Map<string, number>;
}
