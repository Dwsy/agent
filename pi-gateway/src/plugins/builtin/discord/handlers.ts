import type { Message, Interaction } from "discord.js";
import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import type { MessageSource } from "../../../core/types.ts";
import type { DiscordPluginRuntime } from "./types.ts";
import type { ChannelStreamingAdapter, MessageSendResult, MessageActionResult, ReactionOptions, ReadHistoryResult } from "../../types.ts";
import { formatToolLine, splitDiscordText } from "./format.ts";
import { helpText } from "./commands.ts";

// ── Message handling ────────────────────────────────────────────────

export async function handleMessage(rt: DiscordPluginRuntime, message: Message): Promise<void> {
  if (message.author.bot || !rt.client.user) return;

  const isDM = !message.guild;
  const isMentioned = message.mentions.has(rt.client.user);
  const channelId = message.channel.id;
  const guildId = message.guild?.id;
  const senderId = message.author.id;
  const senderName = message.author.username;
  const isThread = message.channel.isThread();
  const threadId = isThread ? channelId : undefined;
  const parentChannelId = isThread ? (message.channel as any).parentId : channelId;

  // DM access policy
  if (isDM) {
    const policy: DmPolicy = (rt.channelCfg.dmPolicy as DmPolicy) ?? "pairing";
    const dmAllowFrom = rt.channelCfg.dm?.allowFrom ?? [];
    const allowed = isSenderAllowed("discord", senderId, policy, dmAllowFrom);
    if (!allowed) {
      if (policy === "pairing") {
        const code = createPairingRequest("discord", senderId, senderName);
        await message.reply(code ? `Pairing required. Code: \`${code}\`` : "Too many pending requests.");
      }
      return;
    }
  }

  // Guild: check requireMention
  if (!isDM) {
    const guildCfg = guildId ? rt.channelCfg.guilds?.[guildId] : undefined;
    if ((guildCfg?.requireMention ?? true) && !isMentioned) return;
  }

  // Clean text (remove bot mention)
  let text = message.content;
  if (rt.client.user) {
    text = text.replace(new RegExp(`<@!?${rt.client.user.id}>`, "g"), "").trim();
  }
  if (!text) return;

  const source: MessageSource = {
    channel: "discord",
    chatType: isDM ? "dm" : isThread ? "thread" : "channel",
    chatId: parentChannelId ?? channelId,
    threadId,
    senderId,
    senderName,
    guildId,
  };

  // v3.0 routing: resolve agent via binding/prefix/default
  const { agentId, text: routedText } = resolveAgentId(source, text, rt.api.config);
  const sessionKey = resolveSessionKey(source, rt.api.config, agentId);

  await dispatchWithStreaming(rt, message, source, sessionKey, routedText);
}

// ── Streaming dispatch ──────────────────────────────────────────────

async function dispatchWithStreaming(
  rt: DiscordPluginRuntime,
  message: Message,
  source: MessageSource,
  sessionKey: string,
  text: string,
): Promise<void> {
  const streamCfg = rt.channelCfg.streaming ?? {};
  const editThrottleMs = streamCfg.editThrottleMs ?? 500;
  const editCutoffChars = streamCfg.editCutoffChars ?? 1800;
  const streamEnabled = streamCfg.enabled !== false;

  let replyMsg: Message | null = null;
  let lastEditAt = 0;
  let editInFlight = false;
  let editStopped = false; // true when accumulated text exceeds cutoff

  const contentSequence: { type: "tool" | "thinking" | "text"; content: string }[] = [];
  const seenToolCalls = new Set<string>();

  // Typing indicator
  const sendTyping = () => {
    if ("sendTyping" in message.channel) {
      (message.channel as any).sendTyping().catch(() => {});
    }
  };
  const typingInterval = setInterval(sendTyping, 8000);
  sendTyping();

  const buildLiveText = (): string => {
    const parts: string[] = [];
    for (const item of contentSequence) {
      if (item.type === "tool") {
        parts.push(item.content);
      } else if (item.type === "thinking") {
        const truncated = item.content.length > 300 ? "…" + item.content.slice(-300) : item.content;
        parts.push(`> 💭 ${truncated.replace(/\n/g, "\n> ")}`);
      } else {
        parts.push(item.content);
      }
    }
    return parts.join("\n\n") || "⏳ Processing...";
  };

  const pushLiveUpdate = () => {
    if (!streamEnabled || editStopped || !replyMsg) return;
    const now = Date.now();
    if (editInFlight || now - lastEditAt < editThrottleMs) return;

    const liveText = buildLiveText();
    if (liveText.length > editCutoffChars) {
      editStopped = true;
      return;
    }

    editInFlight = true;
    replyMsg
      .edit(liveText.slice(0, 2000))
      .then(() => {
        lastEditAt = Date.now();
        editInFlight = false;
      })
      .catch(() => {
        editInFlight = false;
      });
  };

  const ensureReplyMsg = async (initialText?: string) => {
    if (replyMsg) return;
    try {
      replyMsg = await message.reply(initialText?.slice(0, 2000) || streamCfg.placeholder || "⏳ Processing...");
    } catch {}
  };

  if (streamEnabled) {
    await ensureReplyMsg();
  }

  await rt.api.dispatch({
    source,
    sessionKey,
    text,
    onThinkingDelta: (accumulated: string) => {
      sendTyping();
      const idx = contentSequence.findIndex((c) => c.type === "thinking");
      if (idx >= 0) {
        contentSequence[idx]!.content = accumulated;
      } else {
        contentSequence.push({ type: "thinking", content: accumulated });
      }
      pushLiveUpdate();
    },
    onStreamDelta: (accumulated: string) => {
      sendTyping();
      // Remove thinking when text starts
      const thinkIdx = contentSequence.findIndex((c) => c.type === "thinking");
      if (thinkIdx >= 0) contentSequence.splice(thinkIdx, 1);

      const lastText = contentSequence.findLast((c) => c.type === "text");
      if (lastText) {
        lastText.content = accumulated;
      } else {
        contentSequence.push({ type: "text", content: accumulated });
      }
      pushLiveUpdate();
    },
    onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => {
      sendTyping();
      if (toolCallId && seenToolCalls.has(toolCallId)) return;
      if (toolCallId) seenToolCalls.add(toolCallId);
      contentSequence.push({ type: "tool", content: `→ ${formatToolLine(toolName, args)}` });
      pushLiveUpdate();
    },
    respond: async (reply: string) => {
      clearInterval(typingInterval);

      if (!reply?.trim()) {
        if (replyMsg) {
          try { await replyMsg.edit("⏹ (interrupted)"); } catch {}
        }
        return;
      }

      // Build final text: tool lines + reply
      const parts: string[] = [];
      for (const item of contentSequence) {
        if (item.type === "tool") parts.push(item.content);
        // Skip thinking in final reply
      }
      parts.push(reply);
      const finalText = parts.join("\n\n");

      const chunks = splitDiscordText(finalText, 2000);

      // Edit first message with first chunk
      if (replyMsg && chunks.length > 0) {
        try {
          await replyMsg.edit(chunks[0]!);
        } catch {
          // If edit fails, send as new message
          await message.reply(chunks[0]!);
        }
        // Send remaining chunks as new messages
        for (let i = 1; i < chunks.length; i++) {
          await message.reply(chunks[i]!);
        }
      } else {
        // No streaming message existed, send all chunks
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      }
    },
    setTyping: async (typing: boolean) => {
      if (!typing) clearInterval(typingInterval);
    },
  });

  clearInterval(typingInterval);
}

// ── Slash command interaction handling ───────────────────────────────

export async function handleInteraction(rt: DiscordPluginRuntime, interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const senderId = interaction.user.id;
  const senderName = interaction.user.username;
  const channelId = interaction.channelId;
  const guildId = interaction.guildId ?? undefined;

  const source: MessageSource = {
    channel: "discord",
    chatType: guildId ? "channel" : "dm",
    chatId: channelId,
    senderId,
    senderName,
    guildId,
  };
  const sessionKey = resolveSessionKey(source, rt.api.config);

  const cmd = interaction.commandName;

  switch (cmd) {
    case "help":
      await interaction.reply(helpText(rt));
      return;

    case "new":
      try {
        await rt.api.resetSession(sessionKey);
        await interaction.reply("✅ Session reset.");
      } catch {
        await interaction.reply("❌ Failed to reset session.");
      }
      return;

    case "status": {
      await interaction.reply(`**Session:** \`${sessionKey}\``);
      return;
    }

    case "compact":
      try {
        await rt.api.compactSession(sessionKey);
        await interaction.reply("✅ Context compacted.");
      } catch {
        await interaction.reply("❌ Failed to compact.");
      }
      return;

    case "stop":
      try {
        await rt.api.abortSession(sessionKey);
        await interaction.reply("⏹ Aborted.");
      } catch {
        await interaction.reply("❌ Failed to abort.");
      }
      return;

    case "think": {
      const level = interaction.options.getString("level", true);
      try {
        await rt.api.setThinkingLevel(sessionKey, level as any);
        await interaction.reply(`💭 Thinking level: **${level}**`);
      } catch {
        await interaction.reply("❌ Failed to set thinking level.");
      }
      return;
    }

    case "model": {
      const modelId = interaction.options.getString("id");
      if (!modelId) {
        await interaction.reply("Usage: `/model provider/modelId`");
      } else {
        const parts = modelId.split("/");
        const provider = parts.length > 1 ? parts[0]! : "";
        const model = parts.length > 1 ? parts.slice(1).join("/") : modelId;
        try {
          await rt.api.setModel(sessionKey, provider, model);
          await interaction.reply(`✅ Model: **${modelId}**`);
        } catch {
          await interaction.reply("❌ Failed to switch model.");
        }
      }
      return;
    }

    case "cron": {
      const action = (interaction.options.getString("action") ?? "list").toLowerCase();
      const jobId = interaction.options.getString("id") ?? "";
      const cronEngine = rt.api.cronEngine;

      if (!cronEngine) {
        await interaction.reply("Cron engine not available.");
        return;
      }

      if (action === "list") {
        const jobs = cronEngine.listJobs();
        if (jobs.length === 0) {
          await interaction.reply("No cron jobs.");
          return;
        }
        const lines = jobs.map((j: any) => {
          const status = j.paused ? "⏸" : j.enabled === false ? "⛔" : "▶";
          const sched = j.schedule.kind === "cron" ? j.schedule.expr
            : j.schedule.kind === "every" ? `every ${j.schedule.expr}`
            : `at ${j.schedule.expr}`;
          return `${status} \`${j.id}\` — ${sched}\n   ${j.payload.text.slice(0, 80)}`;
        });
        await interaction.reply(`**Cron Jobs (${jobs.length})**\n\n${lines.join("\n\n")}`);
        return;
      }

      if (!jobId) {
        await interaction.reply(`Usage: \`/cron ${action} <id>\``);
        return;
      }

      if (action === "pause") {
        await interaction.reply(cronEngine.pauseJob(jobId) ? `⏸ Paused: ${jobId}` : `Not found: ${jobId}`);
      } else if (action === "resume") {
        await interaction.reply(cronEngine.resumeJob(jobId) ? `▶ Resumed: ${jobId}` : `Not found or not paused: ${jobId}`);
      } else if (action === "remove") {
        await interaction.reply(cronEngine.removeJob(jobId) ? `🗑 Removed: ${jobId}` : `Not found: ${jobId}`);
      } else if (action === "run") {
        await interaction.reply(cronEngine.runJob(jobId) ? `🚀 Triggered: ${jobId}` : `Not found: ${jobId}`);
      } else {
        await interaction.reply("Actions: list, pause, resume, remove, run");
      }
      return;
    }

    default: {
      // Check if this is an agent prefix command (e.g., /code, /docs)
      const agents = rt.api.config.agents;
      const agentIds = new Set(agents?.list?.map((a) => a.id) ?? []);
      if (agentIds.has(cmd)) {
        const msgText = interaction.options.getString("message") || "";
        if (!msgText.trim()) {
          await interaction.reply(`Usage: \`/${cmd} <message>\``);
          return;
        }
        // Defer reply since dispatch may take time
        await interaction.deferReply();
        const agentSource: MessageSource = {
          channel: "discord",
          chatType: guildId ? "channel" : "dm",
          chatId: channelId,
          senderId,
          senderName,
          guildId,
        };
        const agentSessionKey = resolveSessionKey(agentSource, rt.api.config, cmd);
        try {
          await rt.api.dispatch({
            source: agentSource,
            sessionKey: agentSessionKey,
            text: msgText,
            respond: async (reply) => {
              const chunks = splitDiscordText(reply || "(no response)", 2000);
              await interaction.editReply(chunks[0]!);
              for (let i = 1; i < chunks.length; i++) {
                await interaction.followUp(chunks[i]!);
              }
            },
            setTyping: async () => {},
          });
        } catch {
          await interaction.editReply("❌ Agent dispatch failed.");
        }
        return;
      }
      await interaction.reply(`Unknown command: /${cmd}`);
    }
  }
}

// ── Outbound (for gateway.sendText) ─────────────────────────────────

export async function sendOutbound(rt: DiscordPluginRuntime, target: string, text: string): Promise<MessageSendResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("send" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const chunks = splitDiscordText(text, 2000);
    let lastMsgId: string | undefined;
    for (const chunk of chunks) {
      const msg = await (channel as any).send(chunk);
      lastMsgId = msg.id;
    }
    return { ok: true, messageId: lastMsgId };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Streaming Adapter (CA-1) ────────────────────────────────────────

export function createDiscordStreamingAdapter(
  getRuntime: () => DiscordPluginRuntime | null,
): ChannelStreamingAdapter {
  return {
    async createPlaceholder(target, opts) {
      const rt = getRuntime();
      if (!rt) throw new Error("Discord not initialized");
      const channel = await rt.client.channels.fetch(target);
      if (!channel?.isTextBased() || !("send" in channel)) {
        throw new Error("Channel not found or not text-based");
      }
      const msg = await (channel as any).send(opts?.text || "⏳ Processing...");
      return { messageId: msg.id };
    },
    async editMessage(target, messageId, text) {
      const rt = getRuntime();
      if (!rt) return false;
      try {
        const channel = await rt.client.channels.fetch(target);
        if (!channel?.isTextBased()) return false;
        const msg = await (channel as any).messages.fetch(messageId);
        if (!msg) return false;
        await msg.edit(text.slice(0, 2000));
        return true;
      } catch {
        return false;
      }
    },
    async setTyping(target) {
      const rt = getRuntime();
      if (!rt) return;
      try {
        const channel = await rt.client.channels.fetch(target);
        if (channel && "sendTyping" in channel) {
          await (channel as any).sendTyping();
        }
      } catch {}
    },
    config: {
      editThrottleMs: 500,
      editCutoffChars: 1800,
    },
  };
}

// ── Outbound Message Actions (react/edit/delete) ────────────────────

export async function sendReactionOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  messageId: string,
  emoji: string | string[],
  opts?: ReactionOptions,
): Promise<MessageActionResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const msg = await (channel as any).messages.fetch(messageId);
    if (!msg) return { ok: false, error: "Message not found" };

    const emojis = Array.isArray(emoji) ? emoji : [emoji];
    if (opts?.remove) {
      for (const e of emojis) {
        await msg.reactions.resolve(e)?.users.remove(rt.clientId);
      }
    } else {
      for (const e of emojis) {
        await msg.react(e);
      }
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function editMessageOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  messageId: string,
  text: string,
): Promise<MessageActionResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const msg = await (channel as any).messages.fetch(messageId);
    if (!msg) return { ok: false, error: "Message not found" };
    await msg.edit(text.slice(0, 2000));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteMessageOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  messageId: string,
): Promise<MessageActionResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const msg = await (channel as any).messages.fetch(messageId);
    if (!msg) return { ok: false, error: "Message not found" };
    await msg.delete();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pinMessageOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  messageId: string,
  unpin?: boolean,
): Promise<MessageActionResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const msg = await (channel as any).messages.fetch(messageId);
    if (!msg) return { ok: false, error: "Message not found" };
    if (unpin) {
      await msg.unpin();
    } else {
      await msg.pin();
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function readHistoryOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  limit?: number,
  before?: string,
): Promise<ReadHistoryResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }
    const opts: Record<string, unknown> = { limit: Math.min(limit ?? 20, 100) };
    if (before) opts.before = before;
    const fetched = await (channel as any).messages.fetch(opts);
    const messages = Array.from(fetched.values()).map((msg: any) => ({
      id: msg.id,
      text: msg.content ?? "",
      sender: msg.author?.username ?? msg.author?.id ?? "unknown",
      timestamp: msg.createdTimestamp ?? 0,
    }));
    return { ok: true, messages };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Outbound Media (for gateway.sendMedia) ──────────────────────────

import { basename } from "node:path";
import type { MediaSendOptions, MediaSendResult } from "../../types.ts";
import { AttachmentBuilder } from "discord.js";

export async function sendMediaOutbound(
  rt: DiscordPluginRuntime,
  target: string,
  filePath: string,
  opts?: MediaSendOptions,
): Promise<MediaSendResult> {
  try {
    const channel = await rt.client.channels.fetch(target);
    if (!channel?.isTextBased() || !("send" in channel)) {
      return { ok: false, error: "Channel not found or not text-based" };
    }

    const attachment = new AttachmentBuilder(filePath, { name: basename(filePath) });
    const msg = await (channel as any).send({
      content: opts?.caption || undefined,
      files: [attachment],
    });

    return { ok: true, messageId: msg.id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
