/**
 * Feishu channel plugin types.
 */

export interface FeishuChannelConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain?: "feishu" | "lark" | string;
  connectionMode?: "websocket" | "webhook";
  dmPolicy?: "open" | "allowlist";
  allowFrom?: string[];
  // v2
  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];
  requireMention?: boolean;
  textChunkLimit?: number;
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
