import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { ChannelPlugin, GatewayPluginApi, MediaSendResult, MediaSendOptions, ChannelStreamingAdapter, ChannelSecurityAdapter, MessageSendResult } from "../../types.ts";
import type { DiscordChannelConfig, DiscordPluginRuntime } from "./types.ts";
import { handleMessage, handleInteraction, sendOutbound, sendMediaOutbound, createDiscordStreamingAdapter } from "./handlers.ts";
import { registerGuildCommands } from "./commands.ts";
import { splitDiscordText } from "./format.ts";

let runtime: DiscordPluginRuntime | null = null;

const discordPlugin: ChannelPlugin = {
  id: "discord",
  meta: {
    label: "Discord",
    blurb: "Discord bot via discord.js (streaming, slash commands, OpenClaw-aligned)",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: true,
    media: true,
  },
  outbound: {
    maxLength: 2000,
    async sendText(target: string, text: string): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "Discord not initialized" };
      return sendOutbound(runtime, target, text);
    },
    async sendMedia(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult> {
      if (!runtime) return { ok: false, error: "Discord not initialized" };
      return sendMediaOutbound(runtime, target, filePath, opts);
    },
  },

  async init(api: GatewayPluginApi) {
    const cfg = api.config.channels.discord as DiscordChannelConfig | undefined;
    if (!cfg?.enabled || !cfg?.token) {
      api.logger.info("Discord: not configured, skipping");
      return;
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    // Defer runtime creation until we have clientId from ready event
    client.once("ready", async () => {
      const clientId = client.user!.id;
      api.logger.info(`Discord: logged in as ${client.user!.tag} (${clientId})`);

      runtime = { api, channelCfg: cfg, client, clientId };

      // Wire streaming adapter (needs runtime)
      discordPlugin.streaming = createDiscordStreamingAdapter(() => runtime);

      // Wire security adapter
      discordPlugin.security = {
        dmPolicy: (cfg.dmPolicy as any) ?? "pairing",
        dmAllowFrom: cfg.dm?.allowFrom,
        supportsPairing: true,
      };

      // Register slash commands to all guilds
      await registerGuildCommands(runtime);
    });

    client.on("messageCreate", async (message) => {
      if (!runtime) return;
      try {
        await handleMessage(runtime, message);
      } catch (err) {
        api.logger.error(`Discord: message handler error: ${err}`);
      }
    });

    client.on("interactionCreate", async (interaction) => {
      if (!runtime) return;
      try {
        await handleInteraction(runtime, interaction);
      } catch (err) {
        api.logger.error(`Discord: interaction handler error: ${err}`);
      }
    });

    // Store client for start/stop lifecycle
    (discordPlugin as any)._client = client;
    (discordPlugin as any)._cfg = cfg;

    api.logger.info("Discord: initialized");
  },

  async start() {
    const client = (discordPlugin as any)._client as Client | undefined;
    const cfg = (discordPlugin as any)._cfg as DiscordChannelConfig | undefined;
    if (!client || !cfg?.token) return;
    await client.login(cfg.token);
  },

  async stop() {
    const client = (discordPlugin as any)._client as Client | undefined;
    if (client) {
      client.destroy();
      (discordPlugin as any)._client = null;
    }
    runtime = null;
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(discordPlugin);
}
