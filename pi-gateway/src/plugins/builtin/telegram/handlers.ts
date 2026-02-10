import { resolveSessionKey } from "../../../core/session-router.ts";
import type { ImageContent, MessageSource } from "../../../core/types.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { splitMessage } from "../../../core/utils.ts";
import { resolveStreamCompat } from "./config-compat.ts";
import { markdownToTelegramHtml, splitTelegramText } from "./format.ts";
import { downloadTelegramFile } from "./media-download.ts";
import { parseOutboundMediaDirectives, sendTelegramMedia, sendTelegramTextAndMedia } from "./media-send.ts";
import { migrateTelegramGroupConfig } from "./group-migration.ts";
import { buildReactionText } from "./reaction-level.ts";
import { recordSentMessage, wasRecentlySent } from "./sent-message-cache.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramDebouncedEntry,
  TelegramMessage,
  TelegramPendingMediaGroup,
  TelegramPluginRuntime,
} from "./types.ts";

function clipInline(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function codeInline(text: string, max = 160): string {
  return `\`${clipInline(text, max).replace(/`/g, "'")}\``;
}

function pickArgString(args: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!args) return null;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function formatToolStartLine(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case "read": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `read ${codeInline(path)}` : "read";
    }
    case "write": {
      const path = pickArgString(args, ["path", "filePath", "file", "outputPath"]);
      return path ? `write ${codeInline(path)}` : "write";
    }
    case "edit":
    case "multi_edit": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `${toolName} ${codeInline(path)}` : toolName;
    }
    case "bash": {
      const command = pickArgString(args, ["command", "cmd"]);
      return command ? `bash ${codeInline(command, 180)}` : "bash";
    }
    default: {
      const payload = args ? clipInline(JSON.stringify(args), 120) : "";
      return payload ? `${toolName} ${codeInline(payload, 120)}` : toolName;
    }
  }
}

function chatType(chatType?: string): "dm" | "group" {
  return chatType === "private" ? "dm" : "group";
}

function buildSource(account: TelegramAccountRuntime, ctx: TelegramContext, message?: TelegramMessage): MessageSource {
  const msg = message ?? ctx.message ?? ctx.update?.edited_message;
  const groupLike = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  return {
    channel: "telegram",
    accountId: account.accountId,
    chatType: groupLike ? "group" : "dm",
    chatId: String(ctx.chat?.id ?? msg?.chat?.id ?? ""),
    topicId: msg?.message_thread_id ? String(msg.message_thread_id) : undefined,
    senderId: String(ctx.from?.id ?? msg?.from?.id ?? "unknown"),
    senderName: ctx.from?.username ?? ctx.from?.first_name ?? msg?.from?.username ?? msg?.from?.first_name,
  };
}

function isGroupChat(ctx: TelegramContext): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

export function parseTelegramTarget(target: string, defaultAccountId: string): {
  accountId: string;
  chatId: string;
  topicId?: string;
} {
  const clean = target.trim();
  const m = clean.match(/^([^:]+):([^:]+)(?::topic:(\d+))?$/);
  if (m) {
    return {
      accountId: m[1] || defaultAccountId,
      chatId: m[2] || "",
      topicId: m[3],
    };
  }
  return { accountId: defaultAccountId, chatId: clean };
}

async function resolveImagesFromMessage(account: TelegramAccountRuntime, msg: TelegramMessage): Promise<ImageContent[]> {
  const images: ImageContent[] = [];
  const maxMb = Math.max(1, account.cfg.mediaMaxMb ?? 10);
  const maxBytes = maxMb * 1024 * 1024;

  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    if (largest?.file_id) {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: largest.file_id,
        maxBytes,
      });
      if (downloaded && downloaded.mimeType.startsWith("image/")) {
        images.push({ type: "image", data: downloaded.data, mimeType: downloaded.mimeType });
      }
    }
  }

  if (msg.document?.file_id) {
    const downloaded = await downloadTelegramFile({
      token: account.token,
      fileId: msg.document.file_id,
      maxBytes,
    });
    if (downloaded && downloaded.mimeType.startsWith("image/")) {
      images.push({ type: "image", data: downloaded.data, mimeType: downloaded.mimeType });
    }
  }

  return images;
}

function shouldAllowGroupMessage(account: TelegramAccountRuntime, ctx: TelegramContext, text: string): { allowed: boolean; text: string } {
  const chatId = String(ctx.chat?.id ?? "");
  const groupCfg = account.cfg.groups?.[chatId] ?? account.cfg.groups?.["*"];
  let finalText = text;

  if (groupCfg?.enabled === false) {
    return { allowed: false, text: finalText };
  }

  const mentionRequired = groupCfg?.requireMention !== false;
  if (mentionRequired) {
    const username = account.botUsername ?? "";
    if (username && !finalText.includes(`@${username}`)) {
      return { allowed: false, text: finalText };
    }
    if (username) {
      finalText = finalText.replace(new RegExp(`@${username}`, "gi"), "").trim();
    }
  }

  const policy = groupCfg?.groupPolicy ?? account.cfg.groupPolicy ?? "open";
  if (policy === "disabled") return { allowed: false, text: finalText };
  if (policy === "allowlist") {
    const senderId = String(ctx.from?.id ?? "unknown");
    const allow = (groupCfg?.allowFrom ?? account.cfg.groupAllowFrom ?? []).map((v) => String(v));
    if (!allow.includes("*") && !allow.includes(senderId)) {
      return { allowed: false, text: finalText };
    }
  }

  return { allowed: true, text: finalText };
}

async function dispatchAgentTurn(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  source: MessageSource;
  sessionKey: string;
  text: string;
  images: ImageContent[];
  inboundMessageId?: number;
}): Promise<void> {
  const { runtime, account, ctx, source, sessionKey, text, images } = params;
  const streamCfg = resolveStreamCompat(account.cfg as any);
  const botClient = account.bot;
  const chatId = String(ctx.chat?.id ?? "");
  const threadId = (ctx.message as any)?.message_thread_id ?? (ctx.update?.edited_message as any)?.message_thread_id;
  const inboundMessageId = typeof params.inboundMessageId === "number" && params.inboundMessageId > 0
    ? params.inboundMessageId
    : undefined;
  const replyToMode = account.cfg.replyToMode ?? "first";
  let hasNativeReply = false;

  const maybeReplyTo = (): number | undefined => {
    if (!inboundMessageId || replyToMode === "off") return undefined;
    if (replyToMode === "all") return inboundMessageId;
    if (replyToMode === "first" && !hasNativeReply) return inboundMessageId;
    return undefined;
  };

  const markReplyUsed = (replyToMessageId?: number) => {
    if (replyToMessageId) hasNativeReply = true;
  };

  let replyMsgId: number | null = null;
  let creatingReplyMsg = false;
  let lastEditAt = 0;
  let editInFlight = false;
  let lastTypingAt = 0;
  const maxToolLines = 12;
  let latestAccumulated = "";
  const toolLines: string[] = [];
  const seenToolCalls = new Set<string>();
  const typingMinIntervalMs = 3000;

  const sendChatAction = () => {
    const now = Date.now();
    if (now - lastTypingAt < typingMinIntervalMs) return;
    lastTypingAt = now;
    botClient.api.sendChatAction(chatId, "typing", threadId ? { message_thread_id: threadId } : undefined).catch(() => {});
  };

  const ensureReplyMessage = (textForFirstMessage?: string) => {
    if (replyMsgId || creatingReplyMsg) return;
    creatingReplyMsg = true;
    const firstText = textForFirstMessage?.trim() ? textForFirstMessage : streamCfg.placeholder;
    const replyToMessageId = maybeReplyTo();
    botClient.api.sendMessage(chatId, firstText, {
      ...(threadId ? { message_thread_id: threadId } : {}),
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }).then((sent) => {
      markReplyUsed(replyToMessageId);
      replyMsgId = sent.message_id;
      recordSentMessage(chatId, sent.message_id);
      lastEditAt = 0;
      creatingReplyMsg = false;
      if (latestAccumulated || toolLines.length > 0) {
        pushLiveUpdate();
      }
    }).catch(() => {
      creatingReplyMsg = false;
    });
  };

  const buildLiveText = (): string => {
    const toolPart = toolLines.join("\n");
    const textPart = latestAccumulated
      ? (latestAccumulated.length > 4000 ? `${latestAccumulated.slice(0, 4000)}\n...` : `${latestAccumulated} ...`)
      : "";
    if (toolPart && textPart) return `${toolPart}\n\n${textPart}`;
    return toolPart || textPart;
  };

  const pushLiveUpdate = () => {
    if (streamCfg.streamMode === "off") return;
    const renderedRaw = buildLiveText();
    const rendered = renderedRaw.length > 4000 ? `${renderedRaw.slice(0, 4000)}\n...` : renderedRaw;
    if (!rendered.trim()) return;
    const now = Date.now();

    if (!replyMsgId) {
      ensureReplyMessage(rendered);
      return;
    }

    if (editInFlight || now - lastEditAt < streamCfg.editThrottleMs) return;
    editInFlight = true;

    const editTimeout = setTimeout(() => {
      editInFlight = false;
    }, 5000);

    botClient.api.editMessageText(chatId, replyMsgId, rendered)
      .then(() => {
        lastEditAt = Date.now();
        editInFlight = false;
        clearTimeout(editTimeout);
      })
      .catch(() => {
        editInFlight = false;
        clearTimeout(editTimeout);
      });
  };

  const typingInterval = setInterval(() => {
    sendChatAction();
  }, 3500);

  sendChatAction();
  if (streamCfg.streamMode !== "off") {
    ensureReplyMessage();
  }

  await runtime.api.dispatch({
    source,
    sessionKey,
    text,
    images: images.length > 0 ? images : undefined,
    onStreamDelta: (accumulated: string) => {
      sendChatAction();
      latestAccumulated = accumulated;
      if (!replyMsgId && toolLines.length === 0 && accumulated.length < streamCfg.streamStartChars) return;
      pushLiveUpdate();
    },
    onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => {
      sendChatAction();
      if (toolCallId) {
        if (seenToolCalls.has(toolCallId)) return;
        seenToolCalls.add(toolCallId);
      }
      const line = `→ ${formatToolStartLine(toolName, args)}`;
      toolLines.push(line);
      if (toolLines.length > maxToolLines) toolLines.shift();
      pushLiveUpdate();
    },
    respond: async (reply: string) => {
      clearInterval(typingInterval);
      const finalReply = toolLines.length > 0 ? `${toolLines.join("\n")}\n\n${reply}` : reply;
      const parsedFinal = parseOutboundMediaDirectives(finalReply);
      const finalText = parsedFinal.text;
      const chunks = splitTelegramText(finalText, 4096);

      if (replyMsgId && chunks.length > 0) {
        try {
          const first = markdownToTelegramHtml(chunks[0]!);
          await botClient.api.editMessageText(chatId, replyMsgId, first, {
            parse_mode: "HTML",
          });
          const startIndex = 1;
          for (let i = startIndex; i < chunks.length; i++) {
            const chunk = chunks[i]!;
            try {
              const replyToMessageId = maybeReplyTo();
              const sent = await botClient.api.sendMessage(chatId, markdownToTelegramHtml(chunk), {
                parse_mode: "HTML",
                ...(threadId ? { message_thread_id: threadId } : {}),
                ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
              });
              markReplyUsed(replyToMessageId);
              recordSentMessage(chatId, sent.message_id);
            } catch {
              const replyToMessageId = maybeReplyTo();
              const sent = await botClient.api.sendMessage(chatId, chunk, {
                ...(threadId ? { message_thread_id: threadId } : {}),
                ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
              });
              markReplyUsed(replyToMessageId);
              recordSentMessage(chatId, sent.message_id);
            }
          }
        } catch {
          for (const chunk of chunks) {
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, chunk, {
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            }).catch(() => null);
            if (sent) markReplyUsed(replyToMessageId);
            if (sent) recordSentMessage(chatId, sent.message_id);
          }
        }
      } else {
        for (const chunk of chunks) {
          try {
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, markdownToTelegramHtml(chunk), {
              parse_mode: "HTML",
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            });
            markReplyUsed(replyToMessageId);
            recordSentMessage(chatId, sent.message_id);
          } catch {
            const replyToMessageId = maybeReplyTo();
            const sent = await botClient.api.sendMessage(chatId, chunk, {
              ...(threadId ? { message_thread_id: threadId } : {}),
              ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
            }).catch(() => null);
            if (sent) markReplyUsed(replyToMessageId);
            if (sent) recordSentMessage(chatId, sent.message_id);
          }
        }
      }

      for (const media of parsedFinal.media) {
        try {
          const replyToMessageId = maybeReplyTo();
          await sendTelegramMedia(botClient, chatId, media, {
            ...(threadId ? { messageThreadId: threadId } : {}),
            ...(replyToMessageId ? { replyToMessageId } : {}),
          });
          markReplyUsed(replyToMessageId);
        } catch (err: any) {
          const reason = err?.message ?? "unknown";
          await botClient.api.sendMessage(chatId, `Failed to send ${media.kind}: ${reason}`).catch(() => {});
        }
      }
    },
    setTyping: async (typing) => {
      if (!typing) clearInterval(typingInterval);
    },
  });

  clearInterval(typingInterval);
}

function scheduleDebounce(params: {
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  source: MessageSource;
  text: string;
  images: ImageContent[];
  flush: (chatId: string, entry: TelegramDebouncedEntry) => void;
}): void {
  const { account, ctx, source, text, images, flush } = params;
  const chatId = String(ctx.chat?.id ?? "");
  const debounceMs = resolveStreamCompat(account.cfg as any).debounceMs;

  if (debounceMs <= 0) {
    const existing = account.debounceMap.get(chatId);
    if (existing) {
      clearTimeout(existing.timer);
      account.debounceMap.delete(chatId);
    }
    const entry: TelegramDebouncedEntry = {
      texts: text ? [text] : [],
      images: [...images],
      ctx,
      source,
      timer: setTimeout(() => {}, 0),
    };
    flush(chatId, entry);
    return;
  }

  const existing = account.debounceMap.get(chatId);
  if (existing) {
    clearTimeout(existing.timer);
    if (text) existing.texts.push(text);
    existing.images.push(...images);
    existing.ctx = ctx;
    existing.timer = setTimeout(() => {
      account.debounceMap.delete(chatId);
      flush(chatId, existing);
    }, debounceMs);
    return;
  }

  const entry: TelegramDebouncedEntry = {
    texts: text ? [text] : [],
    images: [...images],
    ctx,
    source,
    timer: setTimeout(() => {
      account.debounceMap.delete(chatId);
      flush(chatId, entry);
    }, debounceMs),
  };
  account.debounceMap.set(chatId, entry);
}

async function dispatchInbound(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  text: string;
  images: ImageContent[];
  message?: TelegramMessage;
}): Promise<void> {
  const { runtime, account, ctx } = params;
  let { text } = params;
  const images = params.images;

  const source = buildSource(account, ctx, params.message);

  if (source.chatType === "group") {
    const gate = shouldAllowGroupMessage(account, ctx, text);
    if (!gate.allowed) return;
    text = gate.text;
  } else {
    const policy: DmPolicy = account.cfg.dmPolicy ?? "pairing";
    const allowed = isSenderAllowed("telegram", source.senderId, policy, account.cfg.allowFrom, account.accountId);
    if (!allowed) {
      if (policy === "pairing") {
        const code = createPairingRequest("telegram", source.senderId, source.senderName, account.accountId);
        if (code) {
          await ctx.reply(`Pairing required. Send this code to the admin:\n\n<code>${code}</code>`, { parse_mode: "HTML" });
        } else {
          await ctx.reply("Too many pending pairing requests. Please try later.");
        }
      }
      return;
    }
  }

  const flush = (chatId: string, entry: TelegramDebouncedEntry) => {
    const combinedText = entry.texts.join("\n\n");
    if (!combinedText && entry.images.length === 0) return;
    const sessionKey = resolveSessionKey(entry.source, runtime.api.config);
    void dispatchAgentTurn({
      runtime,
      account,
      ctx: entry.ctx,
      source: entry.source,
      sessionKey,
      text: combinedText || "(image)",
      images: entry.images,
      inboundMessageId: entry.ctx.message?.message_id,
    });
    params.runtime.api.logger.info(
      `[telegram:${account.accountId}] inbound chat=${chatId} sender=${entry.source.senderId} type=${entry.source.chatType} textLen=${combinedText.length} images=${entry.images.length}`,
    );
  };

  scheduleDebounce({
    account,
    ctx,
    source,
    text,
    images,
    flush,
  });
}

function consumeMediaGroup(account: TelegramAccountRuntime, mediaGroupId: string): TelegramPendingMediaGroup | null {
  const pending = account.mediaGroupMap.get(mediaGroupId);
  if (!pending) return null;
  account.mediaGroupMap.delete(mediaGroupId);
  clearTimeout(pending.timer);
  return pending;
}

function enqueueMediaGroup(params: {
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  ctx: TelegramContext;
  mediaGroupId: string;
  text: string;
  images: ImageContent[];
}) {
  const { runtime, account, ctx, mediaGroupId, text, images } = params;
  const existing = account.mediaGroupMap.get(mediaGroupId);
  if (existing) {
    if (text) existing.texts.push(text);
    existing.images.push(...images);
    existing.ctx = ctx;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(async () => {
      const merged = consumeMediaGroup(account, mediaGroupId);
      if (!merged) return;
      const combined = merged.texts.join("\n\n").trim() || "(album)";
      await dispatchInbound({ runtime, account, ctx: merged.ctx, text: combined, images: merged.images });
    }, 650);
    return;
  }

  const pending: TelegramPendingMediaGroup = {
    texts: text ? [text] : [],
    images: [...images],
    ctx,
    timer: setTimeout(async () => {
      const merged = consumeMediaGroup(account, mediaGroupId);
      if (!merged) return;
      const combined = merged.texts.join("\n\n").trim() || "(album)";
      await dispatchInbound({ runtime, account, ctx: merged.ctx, text: combined, images: merged.images });
    }, 650),
  };
  account.mediaGroupMap.set(mediaGroupId, pending);
}

async function handleMessageCommon(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext, msg: TelegramMessage): Promise<void> {
  const chatId = String(msg.chat.id);
  const messageId = msg.message_id;

  if (wasRecentlySent(chatId, messageId)) {
    return;
  }

  const images = await resolveImagesFromMessage(account, msg);
  let text = (msg.text ?? msg.caption ?? "").trim();
  const replied = (msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "").trim();
  if (replied) {
    const quoted = replied.length > 300 ? `${replied.slice(0, 300)}...` : replied;
    text = text ? `[Reply to] ${quoted}\n\n${text}` : `[Reply to] ${quoted}`;
  }

  if (!text && images.length > 0) {
    text = "(image)";
  }

  if (msg.voice) {
    const duration = msg.voice.duration ?? 0;
    text = `[Voice message received, ${duration}s duration. Voice transcription is not yet supported. Please ask user to send text.]`;
  }

  if (!text && images.length === 0) return;

  if (msg.media_group_id) {
    enqueueMediaGroup({
      runtime,
      account,
      ctx,
      mediaGroupId: msg.media_group_id,
      text,
      images,
    });
    return;
  }

  await dispatchInbound({ runtime, account, ctx, text, images, message: msg });
}

async function handleEditedMessage(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const edited = ctx.update?.edited_message;
  if (!edited) return;

  const eventKey = `${edited.chat.id}:${edited.message_id}:${edited.text ?? edited.caption ?? ""}`;
  if (account.seenEditedEvents.has(eventKey)) {
    return;
  }
  account.seenEditedEvents.add(eventKey);
  if (account.seenEditedEvents.size > 3000) {
    const first = account.seenEditedEvents.values().next().value;
    if (first) account.seenEditedEvents.delete(first);
  }

  const augmented = {
    ...ctx,
    chat: edited.chat as any,
    from: edited.from as any,
    message: edited,
  } as TelegramContext;

  await handleMessageCommon(runtime, account, augmented, edited);
}

async function handleReaction(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const text = buildReactionText(account.cfg, ctx, account.botId);
  if (!text) return;

  const reaction = ctx.update?.message_reaction;
  if (!reaction?.chat?.id) return;

  const fakeCtx: TelegramContext = {
    ...ctx,
    chat: {
      id: reaction.chat.id,
      type: "supergroup",
    },
    from: reaction.user,
    message: {
      message_id: 0,
      chat: { id: reaction.chat.id, type: "supergroup" },
      from: reaction.user,
      text,
    },
  };

  await dispatchInbound({ runtime, account, ctx: fakeCtx, text, images: [] });
}

async function handleMigration(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime, ctx: TelegramContext): Promise<void> {
  const msg = ctx.message;
  if (!msg?.migrate_to_chat_id) return;

  const oldId = String(msg.chat.id);
  const newId = String(msg.migrate_to_chat_id);
  const result = migrateTelegramGroupConfig({
    cfg: runtime.channelCfg,
    accountId: account.accountId,
    oldChatId: oldId,
    newChatId: newId,
  });
  runtime.api.logger.info(
    `[telegram:${account.accountId}] group migrated ${oldId} -> ${newId} migrated=${result.migrated} skippedExisting=${result.skippedExisting}`,
  );
}

export async function setupTelegramHandlers(runtime: TelegramPluginRuntime, account: TelegramAccountRuntime): Promise<void> {
  const bot = account.bot;

  bot.on("message", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
      if (account.seenUpdates.size > 5000) {
        const first = account.seenUpdates.values().next().value;
        if (typeof first === "number") account.seenUpdates.delete(first);
      }
    }

    const msg = (ctx as TelegramContext).message;
    if (!msg) return;

    await handleMigration(runtime, account, ctx as TelegramContext);
    await handleMessageCommon(runtime, account, ctx as TelegramContext, msg);
  });

  bot.on("edited_message", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
    }
    await handleEditedMessage(runtime, account, ctx as TelegramContext);
  });

  bot.on("message_reaction", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    if (updateId >= 0) {
      if (account.seenUpdates.has(updateId)) return;
      account.seenUpdates.add(updateId);
    }
    await handleReaction(runtime, account, ctx as TelegramContext);
  });
}

export async function sendOutboundViaAccount(params: {
  runtime: TelegramPluginRuntime;
  defaultAccountId: string;
  target: string;
  text: string;
}): Promise<void> {
  const parsed = parseTelegramTarget(params.target, params.defaultAccountId);
  const account = params.runtime.accounts.get(parsed.accountId)
    ?? params.runtime.accounts.get(params.defaultAccountId)
    ?? Array.from(params.runtime.accounts.values())[0];
  if (!account) {
    throw new Error("Telegram account not started");
  }

  const threadId = parsed.topicId ? Number.parseInt(parsed.topicId, 10) : undefined;

  const chunks = splitMessage(params.text, 4096);
  for (const chunk of chunks) {
    try {
      if (chunk.includes("[photo]") || chunk.includes("[audio]")) {
        await sendTelegramTextAndMedia(account.bot, parsed.chatId, chunk, threadId ? { messageThreadId: threadId } : undefined);
      } else {
        const sent = await account.bot.api.sendMessage(parsed.chatId, markdownToTelegramHtml(chunk), {
          parse_mode: "HTML",
          ...(threadId ? { message_thread_id: threadId } : {}),
        });
        recordSentMessage(parsed.chatId, sent.message_id);
      }
    } catch {
      const sent = await account.bot.api.sendMessage(parsed.chatId, chunk, threadId ? { message_thread_id: threadId } : undefined);
      recordSentMessage(parsed.chatId, sent.message_id);
    }
  }

  params.runtime.api.logger.info(
    `[telegram:${account.accountId}] outbound to=${params.target} textLen=${params.text.length}`,
  );
}
