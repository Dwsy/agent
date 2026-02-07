/**
 * Discord channel plugin — uses discord.js (same as OpenClaw).
 *
 * Features:
 * - DM + guild channel support
 * - DM pairing / allowlist / open / disabled policies
 * - Guild/channel requireMention gating
 * - Per-guild/channel role binding (via config)
 * - Typing indicators
 * - Message chunking (2000 char limit)
 * - Thread support
 */

import { Client, GatewayIntentBits, Partials } from "discord.js";
import type { GatewayPluginApi, ChannelPlugin } from "../types.ts";
import { resolveSessionKey } from "../../core/session-router.ts";
import { isSenderAllowed, type DmPolicy } from "../../security/allowlist.ts";
import { createPairingRequest } from "../../security/pairing.ts";
import { splitMessage } from "../../core/utils.ts";
import type { MessageSource } from "../../core/types.ts";

let client: Client | null = null;
let gatewayApi: GatewayPluginApi | null = null;

const discordPlugin: ChannelPlugin = {
  id: "discord",
  meta: {
    label: "Discord",
    blurb: "Discord bot via discord.js (aligned with OpenClaw)",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: true,
    media: true,
  },
  outbound: {
    maxLength: 2000,
    async sendText(target: string, text: string) {
      if (!client) return;
      const channel = await client.channels.fetch(target);
      if (!channel?.isTextBased() || !("send" in channel)) return;
      const chunks = splitMessage(text, 2000);
      for (const chunk of chunks) {
        await (channel as any).send(chunk);
      }
    },
  },

  async init(api: GatewayPluginApi) {
    gatewayApi = api;
    const cfg = api.config.channels.discord as any;
    if (!cfg?.enabled || !cfg?.token) {
      api.logger.info("Discord: not configured, skipping");
      return;
    }

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel], // Needed for DMs
    });

    client.on("ready", () => {
      api.logger.info(`Discord: logged in as ${client?.user?.tag}`);
    });

    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      if (!client?.user) return;

      const isDM = !message.guild;
      const isMentioned = message.mentions.has(client.user);
      const channelId = message.channel.id;
      const guildId = message.guild?.id;
      const senderId = message.author.id;
      const senderName = message.author.username;
      const isThread = message.channel.isThread();
      const threadId = isThread ? channelId : undefined;
      const parentChannelId = isThread ? (message.channel as any).parentId : channelId;

      // DM: check access policy
      if (isDM) {
        const policy: DmPolicy = cfg.dmPolicy ?? "pairing";
        const dmAllowFrom = cfg.dm?.allowFrom ?? [];
        const allowed = isSenderAllowed("discord", senderId, policy, dmAllowFrom);

        if (!allowed) {
          if (policy === "pairing") {
            const code = createPairingRequest("discord", senderId, senderName);
            if (code) {
              await message.reply(`Pairing required. Send this code to the admin:\n\`${code}\``);
            } else {
              await message.reply("Too many pending pairing requests. Please try later.");
            }
          }
          return;
        }
      }

      // Guild: check requireMention
      if (!isDM) {
        const guildCfg = guildId ? cfg.guilds?.[guildId] : undefined;
        const requireMention = guildCfg?.requireMention ?? true; // Default: require mention in guilds
        if (requireMention && !isMentioned) return;
      }

      // Build message source
      const source: MessageSource = {
        channel: "discord",
        chatType: isDM ? "dm" : isThread ? "thread" : "channel",
        chatId: parentChannelId ?? channelId,
        threadId,
        senderId,
        senderName,
        guildId,
      };

      const sessionKey = resolveSessionKey(source, api.config);

      // Typing indicator
      const typingInterval = setInterval(() => {
        if ("sendTyping" in message.channel) {
          (message.channel as any).sendTyping().catch(() => {});
        }
      }, 8000);
      if ("sendTyping" in message.channel) {
        (message.channel as any).sendTyping().catch(() => {});
      }

      // Clean text (remove bot mention)
      let text = message.content;
      if (client.user) {
        text = text.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
      }

      if (!text) {
        clearInterval(typingInterval);
        return;
      }

      // Dispatch to gateway
      await api.dispatch({
        source,
        sessionKey,
        text,
        respond: async (reply) => {
          clearInterval(typingInterval);
          const chunks = splitMessage(reply, 2000);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        },
        setTyping: async (typing) => {
          if (!typing) clearInterval(typingInterval);
        },
      });

      clearInterval(typingInterval);
    });

    api.logger.info("Discord: initialized");
  },

  async start() {
    if (!client) return;
    const cfg = gatewayApi?.config.channels.discord as any;
    if (!cfg?.token) return;
    gatewayApi?.logger.info("Discord: logging in...");
    await client.login(cfg.token);
  },

  async stop() {
    if (!client) return;
    client.destroy();
    client = null;
    gatewayApi?.logger.info("Discord: stopped");
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(discordPlugin);
}
