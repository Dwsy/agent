/**
 * Gateway plugin factory for chat-sdk bridge.
 *
 * This is the entry point that the gateway plugin loader calls.
 * Reads config, creates the bridge, and registers each adapter as a ChannelPlugin.
 */

import type { Adapter, StateAdapter } from "chat";
import type { GatewayPluginApi } from "../core/interface/plugins/types.ts";
import { ChatSdkBridge, type ChatSdkBridgeConfig } from "./bridge.ts";
import { registerChatSdkCommands } from "./commands.ts";

export interface ChatSdkPluginOptions {
  /** Pre-configured adapters to register */
  adapters: Record<string, Adapter>;
  /** State adapter instance */
  state: StateAdapter;
  /** Bot username */
  userName: string;
  /** Agent ID for session keys (default: "main") */
  agentId?: string;
}

/**
 * Register chat-sdk bridge as a gateway plugin.
 *
 * Usage:
 * ```ts
 * import { registerChatSdkPlugin } from "./chat-sdk";
 *
 * await registerChatSdkPlugin(api, {
 *   adapters: { slack: slackAdapter, discord: discordAdapter },
 *   state: createMemoryState(),
 *   userName: "mybot",
 * });
 * ```
 */
export async function registerChatSdkPlugin(
  api: GatewayPluginApi,
  options: ChatSdkPluginOptions,
): Promise<ChatSdkBridge> {
  const bridge = new ChatSdkBridge({
    adapters: options.adapters,
    state: options.state,
    userName: options.userName,
    agentId: options.agentId,
  });

  bridge.setApi(api);
  bridge.wireHandlers();

  // Register each adapter as a ChannelPlugin
  for (const adapterName of Object.keys(options.adapters)) {
    const plugin = bridge.createChannelPlugin(adapterName);
    await plugin.init(api);
    api.registerChannel(plugin);
    api.logger.info(`chat-sdk: registered channel plugin "${adapterName}"`);
  }

  // Start the bridge (initializes all adapters)
  await bridge.start();

  // Register slash commands across all adapters
  registerChatSdkCommands(bridge.getChat(), api, options.agentId);

  return bridge;
}

/**
 * Default plugin factory for gateway plugin loader.
 *
 * Reads chat-sdk config from gateway config channels.chatSdk and creates adapters.
 * Falls back to api.pluginConfig for pre-configured adapters.
 */
export default async function chatSdkPlugin(api: GatewayPluginApi): Promise<void> {
  // First try: pre-configured adapters via pluginConfig
  const pluginOpts = api.pluginConfig as ChatSdkPluginOptions | undefined;
  if (pluginOpts?.adapters && Object.keys(pluginOpts.adapters).length > 0) {
    await registerChatSdkPlugin(api, pluginOpts);
    return;
  }

  // Second try: config-driven adapter creation from channels.chatSdk
  const chatSdkConfig = (api.config.channels as any)?.chatSdk;
  if (!chatSdkConfig) {
    api.logger.info("chat-sdk: no config found, skipping");
    return;
  }

  const adapters: Record<string, Adapter> = {};

  // ── Adapter creation (config-driven) ──────────────────────────────────

  // Telegram
  if (chatSdkConfig.adapters?.telegram) {
    try {
      const { createTelegramAdapter } = await import("./adapters/telegram/index.ts");
      adapters.telegram = createTelegramAdapter(chatSdkConfig.adapters.telegram);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create telegram adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Discord
  if (chatSdkConfig.adapters?.discord) {
    try {
      const { createDiscordAdapter } = await import("@chat-adapter/discord");
      adapters.discord = createDiscordAdapter(chatSdkConfig.adapters.discord);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create discord adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Slack
  if (chatSdkConfig.adapters?.slack) {
    try {
      const { createSlackAdapter } = await import("@chat-adapter/slack");
      adapters.slack = createSlackAdapter(chatSdkConfig.adapters.slack);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create slack adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Microsoft Teams
  if (chatSdkConfig.adapters?.teams) {
    try {
      const { createTeamsAdapter } = await import("@chat-adapter/teams");
      adapters.teams = createTeamsAdapter(chatSdkConfig.adapters.teams);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create teams adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Google Chat
  if (chatSdkConfig.adapters?.gchat) {
    try {
      const { createGoogleChatAdapter } = await import("@chat-adapter/gchat");
      adapters.gchat = createGoogleChatAdapter(chatSdkConfig.adapters.gchat);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create gchat adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // GitHub (PR comment threads)
  if (chatSdkConfig.adapters?.github) {
    try {
      const { createGitHubAdapter } = await import("@chat-adapter/github");
      adapters.github = createGitHubAdapter(chatSdkConfig.adapters.github);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create github adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Linear (issue comment threads)
  if (chatSdkConfig.adapters?.linear) {
    try {
      const { createLinearAdapter } = await import("@chat-adapter/linear");
      adapters.linear = createLinearAdapter(chatSdkConfig.adapters.linear);
    } catch (err) {
      api.logger.error(`chat-sdk: failed to create linear adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (Object.keys(adapters).length === 0) {
    api.logger.info("chat-sdk: no adapters configured, skipping");
    return;
  }

  // ── State adapter ────────────────────────────────────────────────────

  let state: StateAdapter;
  if (chatSdkConfig.state?.type === "redis" && chatSdkConfig.state.url) {
    try {
      const { createRedisState } = await import("@chat-adapter/state-redis");
      state = createRedisState({ url: chatSdkConfig.state.url });
    } catch (err) {
      api.logger.warn(`chat-sdk: redis state failed, falling back to memory: ${err instanceof Error ? err.message : String(err)}`);
      const { createMemoryState } = await import("@chat-adapter/state-memory");
      state = createMemoryState();
    }
  } else {
    const { createMemoryState } = await import("@chat-adapter/state-memory");
    state = createMemoryState();
  }

  await registerChatSdkPlugin(api, {
    adapters,
    userName: chatSdkConfig.userName ?? "pi-gateway",
    state,
    agentId: chatSdkConfig.agentId,
  });
}
