/**
 * Feishu message handling: event registration, dedup, DM policy, dispatch.
 */
import type * as Lark from "@larksuiteoapi/node-sdk";
import type { GatewayPluginApi } from "../../types.ts";
import type { MessageSource } from "../../../core/types.ts";
import { resolveAgentId, resolveSessionKey } from "../../../core/session-router.ts";
import type { FeishuChannelConfig, FeishuMessageContext, FeishuPluginRuntime } from "./types.ts";
import { sendFeishuText, sendFeishuCard, chunkText } from "./send.ts";

// ── Dedup ──────────────────────────────────────────────────────────────────
const DEDUP_TTL_MS = 30 * 60 * 1000;
const DEDUP_MAX_SIZE = 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const processedIds = new Map<string, number>();
let lastCleanup = Date.now();

export function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  if (now - lastCleanup > DEDUP_CLEANUP_INTERVAL_MS) {
    for (const [id, ts] of processedIds) {
      if (now - ts > DEDUP_TTL_MS) processedIds.delete(id);
    }
    lastCleanup = now;
  }
  if (processedIds.has(messageId)) return true;
  if (processedIds.size >= DEDUP_MAX_SIZE) {
    const first = processedIds.keys().next().value!;
    processedIds.delete(first);
  }
  processedIds.set(messageId, now);
  return false;
}

/** Reset dedup state (for testing). */
export function resetDedup(): void {
  processedIds.clear();
  lastCleanup = Date.now();
}

// ── Message parsing ────────────────────────────────────────────────────────

export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    chat_id: string;
    chat_type: "p2p" | "group";
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: { open_id?: string };
      name: string;
    }>;
  };
}

export function parseMessageContent(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);
    if (messageType === "text") return parsed.text || "";
    if (messageType === "post") return parsePostText(content);
    return content;
  } catch {
    return content;
  }
}

function parsePostText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const title = parsed.title || "";
    const blocks = parsed.content || [];
    let text = title ? `${title}\n\n` : "";
    for (const paragraph of blocks) {
      if (!Array.isArray(paragraph)) continue;
      for (const el of paragraph) {
        if (el.tag === "text") text += el.text || "";
        else if (el.tag === "a") text += el.text || el.href || "";
        else if (el.tag === "at") text += `@${el.user_name || el.user_id || ""}`;
      }
      text += "\n";
    }
    return text.trim() || "[富文本消息]";
  } catch {
    return "[富文本消息]";
  }
}

function stripBotMention(text: string, mentions?: FeishuMessageEvent["message"]["mentions"]): string {
  if (!mentions?.length) return text;
  let result = text;
  for (const m of mentions) {
    result = result.replace(new RegExp(m.key, "g"), "").trim();
    result = result.replace(new RegExp(`@${m.name}\\s*`, "g"), "").trim();
  }
  return result;
}

export function parseFeishuEvent(event: FeishuMessageEvent, botOpenId?: string): FeishuMessageContext {
  const raw = parseMessageContent(event.message.content, event.message.message_type);
  const content = stripBotMention(raw, event.message.mentions);
  const mentionedBot = checkBotMentioned(event, botOpenId);
  return {
    chatId: event.message.chat_id,
    messageId: event.message.message_id,
    senderId: event.sender.sender_id.user_id || event.sender.sender_id.open_id || "",
    senderOpenId: event.sender.sender_id.open_id || "",
    chatType: event.message.chat_type,
    content,
    contentType: event.message.message_type,
    rootId: event.message.root_id || undefined,
    parentId: event.message.parent_id || undefined,
    mentionedBot,
  };
}

function checkBotMentioned(event: FeishuMessageEvent, botOpenId?: string): boolean {
  const mentions = event.message.mentions ?? [];
  if (mentions.length === 0) return false;
  if (!botOpenId) return mentions.length > 0;
  return mentions.some((m) => m.id.open_id === botOpenId);
}

// ── DM Policy ──────────────────────────────────────────────────────────────

export function checkDmPolicy(senderId: string, cfg: FeishuChannelConfig): boolean {
  const policy = cfg.dmPolicy ?? "open";
  if (policy === "open") return true;
  if (policy === "allowlist") {
    return (cfg.allowFrom ?? []).includes(senderId);
  }
  return true;
}

// ── Group Policy ───────────────────────────────────────────────────────────

export function checkGroupPolicy(
  chatId: string,
  senderId: string,
  mentionedBot: boolean,
  cfg: FeishuChannelConfig,
): { allowed: boolean; reason?: string } {
  const policy = cfg.groupPolicy ?? "disabled";

  if (policy === "disabled") {
    return { allowed: false, reason: "group disabled" };
  }

  if (policy === "allowlist") {
    const allowed = (cfg.groupAllowFrom ?? []).includes(chatId);
    if (!allowed) return { allowed: false, reason: "group not in allowlist" };
  }

  // requireMention check (default true for groups)
  const requireMention = cfg.requireMention ?? true;
  if (requireMention && !mentionedBot) {
    return { allowed: false, reason: "bot not mentioned" };
  }

  return { allowed: true };
}

// ── Event registration ─────────────────────────────────────────────────────

export function registerFeishuEvents(
  dispatcher: Lark.EventDispatcher,
  runtime: FeishuPluginRuntime,
): void {
  const { api, channelCfg, client } = runtime;
  const log = api.logger;

  dispatcher.register({
    "im.message.receive_v1": async (data) => {
      try {
        const event = data as unknown as FeishuMessageEvent;
        await handleFeishuMessage(event, runtime);
      } catch (err) {
        log.error(`feishu: error handling message: ${err}`);
      }
    },
    "im.message.message_read_v1": async () => {},
    "im.chat.member.bot.added_v1": async (data) => {
      const ev = data as unknown as { chat_id: string };
      log.info(`feishu: bot added to chat ${ev.chat_id}`);
    },
    "im.chat.member.bot.deleted_v1": async (data) => {
      const ev = data as unknown as { chat_id: string };
      log.info(`feishu: bot removed from chat ${ev.chat_id}`);
    },
  });
}

async function handleFeishuMessage(
  event: FeishuMessageEvent,
  runtime: FeishuPluginRuntime,
): Promise<void> {
  const { api, channelCfg, client, botOpenId } = runtime;
  const log = api.logger;

  const ctx = parseFeishuEvent(event, botOpenId);
  const isGroup = ctx.chatType === "group";

  // Dedup
  if (isDuplicate(ctx.messageId)) {
    log.info(`feishu: skipping duplicate ${ctx.messageId}`);
    return;
  }

  // Policy checks
  if (isGroup) {
    const { allowed, reason } = checkGroupPolicy(ctx.chatId, ctx.senderOpenId, ctx.mentionedBot, channelCfg);
    if (!allowed) {
      log.info(`feishu: group message blocked — ${reason} (chat=${ctx.chatId}, sender=${ctx.senderOpenId})`);
      return;
    }
  } else {
    if (!checkDmPolicy(ctx.senderOpenId, channelCfg)) {
      log.info(`feishu: sender ${ctx.senderOpenId} not in allowlist`);
      return;
    }
  }

  if (!ctx.content.trim()) {
    log.info(`feishu: empty message from ${ctx.senderOpenId}, skipping`);
    return;
  }

  log.info(`feishu: ${isGroup ? "group" : "DM"} from ${ctx.senderOpenId} in ${ctx.chatId}: ${ctx.content.slice(0, 80)}`);

  // Build source + resolve routing
  const source: MessageSource = {
    channel: "feishu",
    chatType: isGroup ? "group" : "dm",
    chatId: ctx.chatId,
    senderId: ctx.senderOpenId,
  };

  const { agentId, text: routedText } = resolveAgentId(source, ctx.content, api.config);
  const sessionKey = resolveSessionKey(source, api.config, agentId);

  // Dispatch to agent
  await api.dispatch({
    source,
    sessionKey,
    text: routedText,
    respond: async (reply: string) => {
      if (!reply.trim()) return;
      const chunks = chunkText(reply, channelCfg.textChunkLimit ?? 4000);
      for (const chunk of chunks) {
        await sendFeishuCard({ client, to: ctx.chatId, text: chunk });
      }
    },
    setTyping: async () => {},
  });
}
