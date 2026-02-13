import { resolveSessionKey, resolveAgentId } from "../../../core/session-router.ts";
import type { ImageContent, MessageSource } from "../../../core/types.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { resolveStreamCompat } from "./config-compat.ts";
import { downloadTelegramFile } from "./media-download.ts";
import { migrateTelegramGroupConfig } from "./group-migration.ts";
import { buildReactionText } from "./reaction-level.ts";
import { wasRecentlySent } from "./sent-message-cache.ts";
import { dispatchAgentTurn } from "./streaming.ts";
import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramDebouncedEntry,
  TelegramMessage,
  TelegramPendingMediaGroup,
  TelegramPluginRuntime,
} from "./types.ts";

// chatType, clipInline, codeInline, pickArgString, formatToolStartLine → streaming.ts
// parseTelegramTarget, sendOutbound/Media, message actions → outbound.ts

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

// dispatchAgentTurn → streaming.ts

async function resolveImagesFromMessage(account: TelegramAccountRuntime, msg: TelegramMessage): Promise<{ images: ImageContent[]; documentContext?: string }> {
  const images: ImageContent[] = [];
  let documentContext: string | undefined;
  const maxMb = Math.max(1, account.cfg.mediaMaxMb ?? 10);
  const maxBytes = maxMb * 1024 * 1024;

  console.log(`[telegram-media] resolveImages: photo=${msg.photo?.length ?? 0} document=${msg.document?.file_id ? 'yes' : 'no'} sticker=${msg.sticker ? 'yes' : 'no'}`);

  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    console.log(`[telegram-media] downloading photo: file_id=${largest?.file_id?.slice(0, 20)}... maxBytes=${maxBytes}`);
    if (largest?.file_id) {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: largest.file_id,
        maxBytes,
      });
      console.log(`[telegram-media] photo download result: ${downloaded ? `${downloaded.mimeType} ${downloaded.data.length} chars base64` : 'null'}`);
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
    if (downloaded) {
      if (downloaded.mimeType.startsWith("image/")) {
        images.push({ type: "image", data: downloaded.data, mimeType: downloaded.mimeType });
      }
      // Non-image documents: store metadata for text context
      if (!downloaded.mimeType.startsWith("image/")) {
        const fileName = msg.document.file_name ?? "unknown";
        const mimeType = msg.document.mime_type ?? downloaded.mimeType;
        // For text-based documents, decode content and attach as context
        if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") {
          try {
            const textContent = Buffer.from(downloaded.data, "base64").toString("utf-8");
            const truncated = textContent.length > 10000 ? textContent.slice(0, 10000) + "\n...(truncated)" : textContent;
            documentContext = `[Document: ${fileName} (${mimeType})]\n\`\`\`\n${truncated}\n\`\`\``;
          } catch {
            documentContext = `[Document: ${fileName} (${mimeType}, ${downloaded.data.length} bytes base64)]`;
          }
        } else {
          documentContext = `[Document: ${fileName} (${mimeType}, binary file — content not readable)]`;
        }
      }
    }
  }

  return { images, documentContext };
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

// dispatchAgentTurn → streaming.ts

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
  const debounceMs = resolveStreamCompat(account.cfg).debounceMs;

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

    // v3.0 routing: resolve agent via binding/prefix/default
    const { agentId, text: routedText } = resolveAgentId(entry.source, combinedText, runtime.api.config);
    const sessionKey = resolveSessionKey(entry.source, runtime.api.config, agentId);

    void dispatchAgentTurn({
      runtime,
      account,
      ctx: entry.ctx,
      source: entry.source,
      sessionKey,
      text: routedText || "(image)",
      images: entry.images,
      inboundMessageId: entry.ctx.message?.message_id,
    });
    params.runtime.api.logger.info(
      `[telegram:${account.accountId}] inbound chat=${chatId} sender=${entry.source.senderId} type=${entry.source.chatType} agentId=${agentId} textLen=${routedText.length} images=${entry.images.length}`,
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

  const { images, documentContext } = await resolveImagesFromMessage(account, msg);
  let text = (msg.text ?? msg.caption ?? "").trim();

  // Media note injection — tell agent what media is attached
  if (images.length > 0) {
    const mediaNote = images.length === 1
      ? `[media attached: 1 image]`
      : `[media attached: ${images.length} images]`;
    text = text ? `${mediaNote}\n${text}` : mediaNote;
  }

  // Document context (non-image files)
  if (documentContext) {
    text = text ? `${text}\n\n${documentContext}` : documentContext;
  }

  // Forward context
  const fwd = (msg as any).forward_origin ?? (msg as any).forward_from ?? (msg as any).forward_from_chat;
  if (fwd) {
    const fwdName = fwd.sender_user?.first_name
      ?? fwd.sender_user_name
      ?? fwd.chat?.title
      ?? (msg as any).forward_from?.first_name
      ?? (msg as any).forward_from_chat?.title
      ?? "unknown";
    text = `[Forwarded from ${fwdName}]\n${text}`;
  }

  // Reply context
  const replied = (msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "").trim();
  if (replied) {
    const repliedIsBot = msg.reply_to_message?.from?.is_bot && msg.reply_to_message?.from?.id === account.bot.botInfo?.id;
    if (!repliedIsBot) {
      const quoted = replied.length > 300 ? `${replied.slice(0, 300)}...` : replied;
      text = text ? `[Reply to] ${quoted}\n\n${text}` : `[Reply to] ${quoted}`;
    }
    // Skip quoting bot's own messages — agent already has that context
  }

  if (!text && images.length > 0) {
    text = "(image)";
  }

  if (msg.voice) {
    const audioCfg = account.cfg.audio;
    if (!audioCfg?.apiKey) {
      await ctx.reply("语音消息暂不支持，请发送文字。");
      return;
    }
    // Download voice and transcribe
    try {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: msg.voice.file_id,
        maxBytes: (account.cfg.mediaMaxMb ?? 10) * 1024 * 1024,
      });
      if (!downloaded) {
        await ctx.reply("语音下载失败，请重试。");
        return;
      }
      const buffer = Buffer.from(downloaded.data, "base64");
      const { transcribeAudio } = await import("./audio-transcribe.ts");
      const transcript = await transcribeAudio(buffer, downloaded.mimeType || "audio/ogg", {
        provider: audioCfg.provider ?? "groq",
        model: audioCfg.model ?? "whisper-large-v3-turbo",
        apiKey: audioCfg.apiKey,
        language: audioCfg.language,
        timeoutMs: (audioCfg.timeoutSeconds ?? 30) * 1000,
      });
      if (transcript) {
        text = text ? `${text}\n\n[Voice message] ${transcript}` : `[Voice message] ${transcript}`;
      } else {
        await ctx.reply("语音转录失败，请重试或发送文字。");
        return;
      }
    } catch (err: unknown) {
      runtime.api.logger.warn(`[telegram] Voice transcription failed: ${err instanceof Error ? err.message : String(err)}`);
      await ctx.reply("语音转录失败，请重试或发送文字。");
      return;
    }
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

  // 本地命令列表（由 bot.command() 处理）
  const localCommands = new Set(["new", "stop", "status", "queue", "cron", "help", "media", "photo", "audio", "model", "refresh", "skills"]);

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

    const text = msg.text ?? msg.caption ?? "";
    
    // 检查是否是本地命令（由 bot.command() 处理）
    if (text.trim().startsWith("/")) {
      const cmdMatch = text.trim().match(/^\/([a-zA-Z0-9_]+)/);
      if (cmdMatch) {
        const cmdName = cmdMatch[1].toLowerCase();
        if (localCommands.has(cmdName)) {
          // 本地命令，由 bot.command() 处理，跳过
          return;
        }
      }
      // 非本地命令（可能是 pi 命令），继续处理
    }

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
