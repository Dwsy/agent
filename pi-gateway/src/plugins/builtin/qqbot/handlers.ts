import type { MessageSource } from "../../../core/types.ts";
import { resolveAgentRoute, resolveSessionKey } from "../../../core/session-router.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import type { QqbotInboundEvent, QqbotInteractionContext, QqbotMessageContext, QqbotPluginRuntime, QqbotTarget } from "./types.ts";
import { encodeQqbotTarget, sendQqbotText } from "./outbound.ts";
import { deleteQqbotOutbound } from "./actions.ts";
import { ackQqbotInteraction } from "./api.ts";
import { getPendingRequest, parseKeyboardCallback, resolveKeyboard } from "../../../api/keyboard-interact.ts";
import { parseRefIndices, setRefIndex, getRefIndex, formatRefEntryForAgent } from "./ref-index-store.ts";
import { matchSlashCommandEx, getCommandCount, type SlashCommandContext, type SlashCommandResult } from "./slash-commands.ts";

/** 同步兼容接口：匹配命令名，不执行 handler（供测试使用） */
export function matchSlashCommand(text: string): { cmd: { name: string; description: string }; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0].toLowerCase();
  const COMMANDS = ["bot-ping", "bot-help", "bot-version", "bot-logs"];
  if (!COMMANDS.includes(name)) return null;
  return { cmd: { name, description: "" }, args: parts.slice(1).join(" ") };
}

const DEDUP_TTL_MS = 30 * 60 * 1000;
const DEDUP_MAX_SIZE = 1000;
const DISPATCH_LOCK_TTL_MS = 30_000; // 30s lock to prevent concurrent dispatch

export function resetQqbotDedup(runtime: QqbotPluginRuntime): void {
  runtime.dedup.clear();
}

function cleanupDedup(runtime: QqbotPluginRuntime): void {
  const now = Date.now();
  for (const [key, ts] of runtime.dedup.entries()) {
    if (now - ts > DEDUP_TTL_MS) runtime.dedup.delete(key);
  }
  while (runtime.dedup.size > DEDUP_MAX_SIZE) {
    const first = runtime.dedup.keys().next().value;
    if (!first) break;
    runtime.dedup.delete(first);
  }
}

function isDuplicate(runtime: QqbotPluginRuntime, key: string): boolean {
  cleanupDedup(runtime);
  if (runtime.dedup.has(key)) return true;
  runtime.dedup.set(key, Date.now());
  return false;
}

function stripMentions(text: string): string {
  return text.replace(/<@!?.+?>/g, "").replace(/\s+/g, " ").trim();
}

export function parseQqbotInteraction(eventType: string, data: QqbotInboundEvent): QqbotInteractionContext | null {
  if (eventType !== "INTERACTION_CREATE") return null;
  if (!data.id) return null;
  const resolved = data.data?.resolved;
  const timestamp = data.timestamp ? Date.parse(data.timestamp) : undefined;
  if (data.scene === "group") {
    if (!data.group_openid || !data.group_member_openid) return null;
    return {
      interactionId: data.id,
      chatType: "group",
      peerType: "group",
      chatId: data.group_openid,
      senderId: data.group_member_openid,
      buttonData: resolved?.button_data,
      buttonId: resolved?.button_id,
      messageId: resolved?.message_id,
      eventId: data.id,
      timestamp,
    };
  }
  if (data.scene === "guild") {
    if (!data.channel_id) return null;
    return {
      interactionId: data.id,
      chatType: "channel",
      peerType: "guild",
      chatId: data.channel_id,
      senderId: resolved?.user_id || "unknown",
      guildId: data.guild_id,
      channelId: data.channel_id,
      buttonData: resolved?.button_data,
      buttonId: resolved?.button_id,
      messageId: resolved?.message_id,
      eventId: data.id,
      timestamp,
    };
  }
  if (!data.user_openid) return null;
  return {
    interactionId: data.id,
    chatType: "dm",
    peerType: "c2c",
    chatId: data.user_openid,
    senderId: data.user_openid,
    buttonData: resolved?.button_data,
    buttonId: resolved?.button_id,
    messageId: resolved?.message_id,
    eventId: data.id,
    timestamp,
  };
}

async function handleQqbotInteraction(runtime: QqbotPluginRuntime, data: QqbotInboundEvent): Promise<void> {
  const interaction = parseQqbotInteraction("INTERACTION_CREATE", data);
  if (!interaction) return;

  try {
    const callbackData = String(interaction.buttonData ?? "").trim();
    const result = await (runtime.api as any).dispatchInteraction?.({
      channel: "qqbot",
      sessionKey: undefined,
      chatId: interaction.chatId,
      senderId: interaction.senderId,
      messageId: interaction.messageId,
      actionData: callbackData,
      ack: async (payload?: { ok?: boolean; code?: 0 | 1 | 2 | 3 | 4 | 5 }) => {
        const code = payload?.code ?? (payload?.ok === false ? 3 : 0);
        await ackQqbotInteraction(runtime, interaction.interactionId, code);
      },
      respondWith: async (response: { text?: string }) => {
        if (!response?.text) return;
        const target = encodeQqbotTarget({
          peerType: interaction.peerType,
          id: interaction.chatId,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          msgId: interaction.messageId,
          eventId: interaction.eventId,
          msgSeq: 1,
        });
        await sendQqbotText(runtime, target, response.text, { channelMeta: { qqbotSkipChunking: true } });
      },
    });
    if (result) return;

    const parsed = parseKeyboardCallback(callbackData);
    if (!parsed) {
      await ackQqbotInteraction(runtime, interaction.interactionId, 0);
      return;
    }

    const pending = getPendingRequest(parsed.requestId);
    if (!pending || pending.channel !== "qqbot") {
      await ackQqbotInteraction(runtime, interaction.interactionId, 3);
      return;
    }

    const resolved = resolveKeyboard(parsed.requestId, parsed.optionId);
    await ackQqbotInteraction(runtime, interaction.interactionId, resolved ? 0 : 3);
  } catch (err) {
    runtime.api.logger.warn(`QQBot interaction handling failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      await ackQqbotInteraction(runtime, interaction.interactionId, 1);
    } catch {}
  }
}

export function parseQqbotEvent(eventType: string, data: QqbotInboundEvent, botId?: string): QqbotMessageContext | null {
  const senderId = data.author?.member_openid || data.author?.user_openid || data.author?.id;
  if (!senderId) return null;
  const text = stripMentions(data.content || "");
  const mentionedBot = Boolean(data.content && /<@!?/.test(data.content)) || Boolean(data.mentions?.some((m) => m.id && m.id === botId));
  const messageId = data.id || data.msg_id;
  if (!messageId) return null;

  if (eventType === "C2C_MESSAGE_CREATE") {
    const { refMsgIdx, msgIdx } = parseRefIndices(data.ext);
    return {
      eventType,
      peerType: "c2c",
      chatType: "dm",
      chatId: senderId,
      senderId,
      senderName: data.author?.username,
      text,
      messageId,
      eventId: data.event_id,
      mentionedBot: true,
      attachments: data.attachments,
      timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
      refMsgIdx,
      msgIdx,
    };
  }
  if (eventType === "GROUP_AT_MESSAGE_CREATE") {
    const groupId = data.group_openid || data.group_id;
    if (!groupId) return null;
    const { refMsgIdx, msgIdx } = parseRefIndices(data.ext);
    return {
      eventType,
      peerType: "group",
      chatType: "group",
      chatId: groupId,
      senderId,
      senderName: data.author?.username,
      text,
      messageId,
      eventId: data.event_id,
      mentionedBot,
      attachments: data.attachments,
      timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
      refMsgIdx,
      msgIdx,
    };
  }
  if (eventType === "AT_MESSAGE_CREATE") {
    if (!data.channel_id) return null;
    const { refMsgIdx, msgIdx } = parseRefIndices(data.ext);
    return {
      eventType,
      peerType: "guild",
      chatType: "channel",
      chatId: data.channel_id,
      senderId,
      senderName: data.author?.username,
      text,
      messageId,
      eventId: data.event_id,
      guildId: data.guild_id,
      channelId: data.channel_id,
      mentionedBot,
      attachments: data.attachments,
      timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
      refMsgIdx,
      msgIdx,
    };
  }
  if (eventType === "DIRECT_MESSAGE_CREATE") {
    if (!data.guild_id) return null;
    const { refMsgIdx, msgIdx } = parseRefIndices(data.ext);
    return {
      eventType,
      peerType: "dm",
      chatType: "channel",
      chatId: data.channel_id || data.guild_id,
      senderId,
      senderName: data.author?.username,
      text,
      messageId,
      eventId: data.event_id,
      guildId: data.guild_id,
      channelId: data.channel_id,
      mentionedBot: true,
      attachments: data.attachments,
      timestamp: data.timestamp ? Date.parse(data.timestamp) : undefined,
      refMsgIdx,
      msgIdx,
    };
  }
  return null;
}

function buildTarget(ctx: QqbotMessageContext): QqbotTarget {
  return {
    peerType: ctx.peerType,
    id: ctx.chatId,
    guildId: ctx.guildId,
    channelId: ctx.channelId,
    msgId: ctx.messageId,
    eventId: ctx.eventId,
    msgSeq: 1,
  };
}

function checkDmPolicy(runtime: QqbotPluginRuntime, senderId: string): "allowed" | "pairing" | "blocked" {
  const policy = (runtime.channelCfg.dmPolicy ?? "pairing") as DmPolicy;
  if (policy === "disabled") return "blocked";
  if (isSenderAllowed("qqbot", senderId, policy, runtime.channelCfg.allowFrom, "default")) return "allowed";
  if (policy === "pairing") return "pairing";
  return "blocked";
}

function checkGroupPolicy(runtime: QqbotPluginRuntime, ctx: QqbotMessageContext): { allowed: boolean; reason?: string } {
  const policy = runtime.channelCfg.groupPolicy ?? "disabled";
  if (policy === "disabled") return { allowed: false, reason: "group disabled" };
  if (policy === "allowlist") {
    const allow = (runtime.channelCfg.groupAllowFrom ?? []).map(String);
    if (!allow.includes(ctx.chatId)) return { allowed: false, reason: "group not allowed" };
  }
  if ((runtime.channelCfg.requireMention ?? true) && !ctx.mentionedBot) {
    return { allowed: false, reason: "mention required" };
  }
  return { allowed: true };
}

export async function handleQqbotEvent(runtime: QqbotPluginRuntime, eventType: string, data: unknown): Promise<void> {
  const receivedAt = Date.now();
  runtime.api.logger.info(`QQBot inbound event: ${eventType}`);
  if (eventType === "INTERACTION_CREATE") {
    await handleQqbotInteraction(runtime, data as QqbotInboundEvent);
    return;
  }

  const ctx = parseQqbotEvent(eventType, data as QqbotInboundEvent, runtime.botId);
  if (!ctx) {
    runtime.api.logger.warn(`QQBot event ignored: ${eventType} could not be parsed`);
    return;
  }
  runtime.api.logger.info(`QQBot inbound parsed: type=${ctx.chatType} peer=${ctx.peerType} chat=${ctx.chatId} sender=${ctx.senderId} mentioned=${ctx.mentionedBot} text=${JSON.stringify(ctx.text.slice(0, 120))}`);
  const dedupKey = `${eventType}:${ctx.messageId}`;
  if (isDuplicate(runtime, dedupKey)) {
    runtime.api.logger.info(`QQBot event dropped: duplicate ${dedupKey}`);
    return;
  }
  if (!ctx.text.trim() && !(ctx.attachments?.length)) {
    runtime.api.logger.info(`QQBot event dropped: empty content ${eventType}`);
    return;
  }

  if (ctx.chatType === "dm") {
    const dm = checkDmPolicy(runtime, ctx.senderId);
    runtime.api.logger.info(`QQBot DM policy result: ${dm} sender=${ctx.senderId}`);
    if (dm === "blocked") {
      runtime.api.logger.warn(`QQBot event dropped: dm blocked sender=${ctx.senderId}`);
      return;
    }
    if (dm === "pairing") {
      const code = createPairingRequest("qqbot", ctx.senderId, ctx.senderName, "default");
      const target = encodeQqbotTarget(buildTarget(ctx));
      runtime.api.logger.info(`QQBot pairing response: sender=${ctx.senderId} code=${code ?? "none"}`);
      await sendQqbotText(runtime, target, code ? `Pairing required. Code: ${code}` : "Too many pending pairing requests.");
      return;
    }
  } else {
    const group = checkGroupPolicy(runtime, ctx);
    runtime.api.logger.info(`QQBot group policy result: allowed=${group.allowed} reason=${group.reason ?? "ok"} chat=${ctx.chatId}`);
    if (!group.allowed) {
      runtime.api.logger.warn(`QQBot event dropped: group blocked reason=${group.reason ?? "unknown"} chat=${ctx.chatId}`);
      return;
    }
  }

  // 引用消息上下文注入：用户引用了某条历史消息
  let textWithRef = ctx.text;
  if (ctx.refMsgIdx) {
    const refEntry = getRefIndex(ctx.refMsgIdx);
    if (refEntry) {
      const quotedText = formatRefEntryForAgent(refEntry);
      textWithRef = `${quotedText}\n\n${ctx.text}`;
      runtime.api.logger.info(`QQBot quote injected: ref=${ctx.refMsgIdx} content="${quotedText.slice(0, 60)}..."`);
    } else {
      runtime.api.logger.info(`QQBot quote ref not found in cache: ${ctx.refMsgIdx}`);
    }
  }

  // 存储当前消息索引，以便后续被引用时可查找
  if (ctx.msgIdx) {
    setRefIndex(ctx.msgIdx, {
      content: ctx.text,
      senderId: ctx.senderId,
      senderName: ctx.senderName,
      timestamp: ctx.timestamp ?? Date.now(),
    });
  }

  const source: MessageSource = {
    channel: "qqbot",
    chatType: ctx.chatType,
    chatId: ctx.chatType === "dm" ? ctx.senderId : ctx.chatId,
    senderId: ctx.senderId,
    senderName: ctx.senderName,
    guildId: ctx.guildId,
    messageId: ctx.messageId,
    timestamp: ctx.timestamp,
  };
  if (ctx.chatType === "channel") {
    source.chatId = ctx.channelId || ctx.chatId;
    if (ctx.guildId) source.threadId = ctx.guildId;
  }

  const route = resolveAgentRoute(source, textWithRef, runtime.api.config);
  runtime.api.logger.info(`QQBot route resolved: agent=${route.agentId} text=${JSON.stringify((route.text || "").slice(0, 120))}`);
  const routedSource: MessageSource = { ...source, agentId: route.agentId };
  const sessionKey = resolveSessionKey(routedSource, runtime.api.config, route.agentId);
  const target = encodeQqbotTarget(buildTarget(ctx));

  // 斜杠命令拦截：在 dispatch 之前处理内置命令
  const slashResult = await matchSlashCommandEx({
    runtime,
    target,
    rawContent: ctx.text,
    args: "",
    receivedAt,
    senderId: ctx.senderId,
    senderName: ctx.senderName,
    messageId: ctx.messageId,
    chatType: ctx.chatType,
  });
  if (slashResult !== null) {
    runtime.api.logger.info(`QQBot slash command matched`);
    try {
      if (typeof slashResult === "string") {
        await sendQqbotText(runtime, target, slashResult);
      } else {
        await sendQqbotText(runtime, target, slashResult.text);
      }
    } catch (err) {
      runtime.api.logger.warn(`QQBot slash command failed: ${err instanceof Error ? err.message : String(err)}`);
      await sendQqbotText(runtime, target, "命令执行失败，请稍后重试。");
    }
    return;
  }

  const streamCfg = runtime.channelCfg.streaming ?? {};
  const streamEnabled = streamCfg.enabled !== false;
  const editThrottleMs = streamCfg.editThrottleMs ?? 1200;
  const streamStartChars = streamCfg.streamStartChars ?? 80;
  let placeholderId: string | null = null;
  let lastEditAt = 0;
  let streamingStopped = false;

  // 按用户并发锁：防止同一用户快速发送多条消息导致响应乱序
  const dispatchLockKey = `dispatch:${ctx.chatId}:${ctx.senderId}`;
  const now = Date.now();
  if (runtime.dispatchLock.has(dispatchLockKey) && now - (runtime.dispatchLock.get(dispatchLockKey) ?? 0) < DISPATCH_LOCK_TTL_MS) {
    runtime.api.logger.info(`QQBot dispatch dropped: user ${ctx.senderId} is already processing a request`);
    return;
  }
  runtime.dispatchLock.set(dispatchLockKey, now);

  // 发送输入状态通知（C2C 私聊显示"正在输入..."）
  if (ctx.peerType === "c2c") {
    const { sendC2CInputNotify } = await import("./api.ts");
    sendC2CInputNotify(runtime, ctx.senderId, ctx.messageId).catch(() => {});
  }

  runtime.api.logger.info(`QQBot dispatching: session=${sessionKey} target=${target}`);
  try {
    await runtime.api.dispatch({
    source: routedSource,
    sessionKey,
    text: route.text,
    respond: async (reply: string) => {
      runtime.api.logger.info(`QQBot respond called: len=${reply.length}`);
      if (!reply.trim()) {
        runtime.api.logger.info("QQBot respond skipped: empty reply");
        return;
      }
      if (placeholderId) {
        const deleted = await deleteQqbotOutbound(runtime, target, placeholderId);
        if (!deleted.ok) {
        runtime.api.logger.warn(`QQBot stream delete failed: ${deleted.error ?? "unknown"}`);
          runtime.api.logger.warn(`QQBot placeholder delete failed: ${deleted.error}`);
        }
      }
      await sendQqbotText(runtime, target, reply);
    },
    setTyping: async () => {},
    onStreamDelta: streamEnabled ? async (accumulated: string) => {
      if (streamingStopped || accumulated.length < streamStartChars) return;
      const now = Date.now();
      if (now - lastEditAt < editThrottleMs) return;
      lastEditAt = now;
      if (!placeholderId) {
        const sent = await sendQqbotText(runtime, target, accumulated + " ▍", {
          channelMeta: { qqbotSkipChunking: true },
        });
        if (!sent.ok || !sent.messageId) {
          runtime.api.logger.warn(`QQBot stream placeholder send failed: ${sent.error ?? "unknown"}`);
          streamingStopped = true;
          return;
        }
        placeholderId = sent.messageId;
        return;
      }
      const deleted = await deleteQqbotOutbound(runtime, target, placeholderId);
      if (!deleted.ok) {
        runtime.api.logger.warn(`QQBot stream delete failed: ${deleted.error ?? "unknown"}`);
        streamingStopped = true;
        return;
      }
      const resent = await sendQqbotText(runtime, target, accumulated + " ▍", {
        channelMeta: { qqbotSkipChunking: true },
      });
      if (!resent.ok || !resent.messageId) {
        runtime.api.logger.warn(`QQBot stream resend failed: ${resent.error ?? "unknown"}`);
        streamingStopped = true;
        return;
      }
      placeholderId = resent.messageId;
    } : undefined,
    respondWith: async (response: { text?: string }) => {
      if (!response?.text) return;
      await sendQqbotText(runtime, target, response.text);
    },
  });
  } finally {
    runtime.dispatchLock.delete(dispatchLockKey);
  }
}
