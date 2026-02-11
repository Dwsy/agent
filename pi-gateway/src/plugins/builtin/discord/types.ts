import type { GatewayPluginApi } from "../../types.ts";
import type { Client } from "discord.js";

export interface DiscordChannelConfig {
  enabled?: boolean;
  token?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  dm?: {
    allowFrom?: string[];
  };
  guilds?: Record<string, DiscordGuildConfig>;
  streaming?: {
    enabled?: boolean;
    editThrottleMs?: number;
    /** Stop editing after this many chars; send full reply on completion */
    editCutoffChars?: number;
    placeholder?: string;
  };
}

export interface DiscordGuildConfig {
  enabled?: boolean;
  requireMention?: boolean;
  role?: string;
}

export interface DiscordPluginRuntime {
  api: GatewayPluginApi;
  channelCfg: DiscordChannelConfig;
  client: Client;
  clientId: string;
}
