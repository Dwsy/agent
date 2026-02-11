import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { SharedSlashCommand } from "@discordjs/builders";
import type { DiscordPluginRuntime } from "./types.ts";

/** Static commands — aligned with Telegram LOCAL_COMMANDS */
const STATIC_COMMANDS: SharedSlashCommand[] = [
  new SlashCommandBuilder().setName("new").setDescription("Reset session"),
  new SlashCommandBuilder().setName("status").setDescription("Session status"),
  new SlashCommandBuilder().setName("compact").setDescription("Compact context"),
  new SlashCommandBuilder().setName("stop").setDescription("Abort current run"),
  new SlashCommandBuilder().setName("help").setDescription("Show help"),
  new SlashCommandBuilder()
    .setName("think")
    .setDescription("Set thinking level")
    .addStringOption((o) =>
      o.setName("level").setDescription("off/minimal/low/medium/high/xhigh").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Switch model")
    .addStringOption((o) =>
      o.setName("id").setDescription("provider/modelId").setRequired(false)
    ),
];

/** Reserved names that cannot be used as agent prefix commands */
const RESERVED = new Set(STATIC_COMMANDS.map((c) => c.name));

/**
 * Build agent prefix commands from config.agents.list.
 * Each agent gets a /{agentId} command with an optional message argument.
 */
function buildAgentCommands(rt: DiscordPluginRuntime): SharedSlashCommand[] {
  const agents = rt.api.config.agents;
  if (!agents?.list?.length) return [];

  return agents.list
    .filter((a) => !RESERVED.has(a.id))
    .map((a) =>
      new SlashCommandBuilder()
        .setName(a.id)
        .setDescription(`Send to ${a.id} agent`)
        .addStringOption((o) =>
          o.setName("message").setDescription("Message to send").setRequired(false)
        )
    );
}

/**
 * Register slash commands to all guilds the bot is in.
 * Guild-level registration takes effect immediately (vs global ~1h cache).
 */
export async function registerGuildCommands(rt: DiscordPluginRuntime): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(rt.channelCfg.token!);
  const agentCommands = buildAgentCommands(rt);
  const allCommands = [...STATIC_COMMANDS, ...agentCommands];
  const body = allCommands.map((c) => c.toJSON());

  const guilds = rt.client.guilds.cache;
  if (guilds.size === 0) {
    rt.api.logger.info("Discord: no guilds cached, skipping command registration");
    return;
  }

  let registered = 0;
  for (const [guildId, guild] of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(rt.clientId, guildId), { body });
      registered++;
    } catch (err) {
      rt.api.logger.warn(`Discord: failed to register commands in guild ${guild.name}: ${err}`);
    }
  }

  const agentNames = agentCommands.map((c) => `/${c.name}`).join(", ");
  rt.api.logger.info(
    `Discord: registered ${allCommands.length} commands (${STATIC_COMMANDS.length} static + ${agentCommands.length} agent: ${agentNames || "none"}) in ${registered}/${guilds.size} guilds`
  );
}

/** Build help text (includes agent commands if configured) */
export function helpText(rt?: DiscordPluginRuntime): string {
  const lines = [
    "**Discord Commands**",
    "",
    "/new — Reset session",
    "/status — Session status",
    "/compact — Compact context",
    "/think `<level>` — Set thinking level (off/minimal/low/medium/high/xhigh)",
    "/model `[provider/modelId]` — View or switch model",
    "/stop — Abort current run",
    "/help — This message",
  ];

  const agents = rt?.api.config.agents;
  if (agents?.list?.length) {
    lines.push("", "**Agent Commands**");
    for (const a of agents.list) {
      if (!RESERVED.has(a.id)) {
        lines.push(`/${a.id} \`[message]\` — Send to ${a.id} agent`);
      }
    }
  }

  return lines.join("\n");
}
