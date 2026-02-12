/**
 * Feishu channel plugin types.
 */

export interface FeishuChannelConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain?: "feishu" | "lark" | string;
  connectionMode?: "websocket" | "webhook";
  /** DM policy — aligned with gateway security/allowlist.ts */
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string[];
  // Group
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];
  requireMention?: boolean;
  textChunkLimit?: number;
  // Streaming
  streamingEnabled?: boolean;
  /** Card patch throttle in ms (default 1200, respecting 5/sec bot limit) */
  streamThrottleMs?: number;
  /** Min chars before first card send (default 50) */
  streamStartChars?: number;
  /** Streaming mode: "cardkit" (native typewriter), "patch" (im.v1.message.patch), "off" */
  streamMode?: "cardkit" | "patch" | "off";
}

export interface FeishuMessageContext {
  chatId: string;
  messageId: string;
  senderId: string;
  senderOpenId: string;
  chatType: "p2p" | "group";
  content: string;
  contentType: string;
  rootId?: string;
  parentId?: string;
  mentionedBot: boolean;
}

export interface FeishuPluginRuntime {
  api: import("../../types.ts").GatewayPluginApi;
  channelCfg: FeishuChannelConfig;
  client: import("@larksuiteoapi/node-sdk").Client;
  botOpenId?: string;
}
