import type { InlineKeyboardMarkup, SendOptions, SessionKey } from "../core/interface/plugins/types.ts";

export type CommandCatalogSource = "builtin" | "pi-native" | "agent-prefix";

export interface CommandCatalogEntry {
  name: string;
  description: string;
  source: CommandCatalogSource;
  exposeInNativeUi?: boolean;
  group?: string;
  supportsArgs?: boolean;
}

export interface CommandResponse {
  text?: string;
  keyboard?: InlineKeyboardMarkup;
  parseMode?: SendOptions["parseMode"];
  replaceMessageId?: string;
  channelMeta?: Record<string, unknown>;
  pageId?: string;
}

export interface NativeCommandSpec {
  name: string;
  description: string;
  source: CommandCatalogSource;
}

export interface InteractionEvent {
  channel: string;
  sessionKey?: SessionKey;
  chatId?: string;
  senderId?: string;
  accountId?: string;
  messageId?: string;
  actionData: string;
  /** GatewayPluginApi instance for direct API calls (setModel, getAvailableModels, etc.) */
  api?: {
    setModel?: (sessionKey: SessionKey, provider: string, modelId: string) => Promise<void>;
    getAvailableModels?: (sessionKey: SessionKey) => Promise<unknown[]>;
    dispatch?: (msg: unknown) => Promise<unknown>;
  };
  ack: (result?: { ok?: boolean; message?: string; code?: number }) => Promise<void>;
  respondWith?: (response: CommandResponse) => Promise<void>;
}
