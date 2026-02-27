/**
 * Telegram adapter for chat-sdk.
 *
 * Uses grammy for Telegram Bot API interactions.
 * Supports both polling and webhook modes.
 * Enhanced with media handling, group control, forward/reply context,
 * media group merging, and network resilience.
 */

import { Bot } from "grammy";
import {
  Message,
  type Adapter,
  type AdapterPostableMessage,
  type ChatInstance,
  type EmojiValue,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  type Logger,
  type RawMessage,
  type StreamOptions,
  type ThreadInfo,
  type WebhookOptions,
  ConsoleLogger,
  parseMarkdown,
} from "chat";

import type {
  TelegramAdapterConfig,
  TelegramThreadId,
  TelegramRawMessage,
  TelegramUpdate,
  MediaGroupEntry,
} from "./types.ts";
import { TelegramFormatConverter, markdownToTelegramHtml, escapeHtml } from "./format.ts";
import { verifyWebhookSecret, parseWebhookUpdate, webhookOk, webhookError } from "./webhook.ts";
import { shouldAllowGroupMessage, resolveGroupConfig } from "./groups.ts";
import { detectMediaKind, parseMediaDirectives } from "./media.ts";
import { isTransientError, withRetry } from "./network.ts";

const TELEGRAM_MAX_TEXT_LENGTH = 4096;
const MEDIA_GROUP_DEBOUNCE_MS = 500;

/**
 * Split text into chunks respecting Telegram's 4096 char limit.
 */
function splitText(text: string, max = TELEGRAM_MAX_TEXT_LENGTH): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", max);
    if (splitIdx <= 0) splitIdx = max;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, "");
  }
  return chunks;
}

/**
 * Build forward context string from a Telegram message.
 * Supports both Bot API 7.0+ forward_origin and legacy fields.
 */
export function buildForwardContext(msg: TelegramRawMessage): string | null {
  const origin = msg.forward_origin;
  const parts: string[] = [];

  if (origin) {
    switch (origin.type) {
      case "user": {
        const u = origin.sender_user;
        const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "unknown";
        const handle = u?.username ? ` (@${u.username})` : "";
        parts.push(`from: ${name}${handle}`);
        break;
      }
      case "hidden_user":
        parts.push(`from: ${origin.sender_user_name ?? "hidden user"}`);
        break;
      case "chat": {
        const c = origin.sender_chat;
        const title = c?.title ?? "unknown chat";
        const handle = c?.username ? ` (@${c.username})` : "";
        parts.push(`from chat: ${title}${handle}`);
        if (origin.author_signature) parts.push(`author: ${origin.author_signature}`);
        break;
      }
      case "channel": {
        const ch = origin.chat;
        const title = ch?.title ?? "unknown channel";
        const handle = ch?.username ? ` (@${ch.username})` : "";
        parts.push(`from channel: ${title}${handle}`);
        if (origin.message_id && ch?.username) {
          parts.push(`link: https://t.me/${ch.username}/${origin.message_id}`);
        }
        if (origin.author_signature) parts.push(`author: ${origin.author_signature}`);
        break;
      }
    }
    if (origin.date) {
      parts.push(`date: ${new Date(origin.date * 1000).toISOString()}`);
    }
  } else if (msg.forward_from || msg.forward_from_chat || msg.forward_sender_name) {
    if (msg.forward_from) {
      const u = msg.forward_from;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "unknown";
      const handle = u.username ? ` (@${u.username})` : "";
      parts.push(`from: ${name}${handle}`);
    } else if (msg.forward_from_chat) {
      const c = msg.forward_from_chat;
      const title = c.title ?? "unknown";
      const handle = c.username ? ` (@${c.username})` : "";
      parts.push(`from ${c.type ?? "chat"}: ${title}${handle}`);
      if (msg.forward_from_message_id && c.username) {
        parts.push(`link: https://t.me/${c.username}/${msg.forward_from_message_id}`);
      }
    } else if (msg.forward_sender_name) {
      parts.push(`from: ${msg.forward_sender_name}`);
    }
    if (msg.forward_date) {
      parts.push(`date: ${new Date(msg.forward_date * 1000).toISOString()}`);
    }
  } else {
    return null;
  }

  if (parts.length === 0) return null;
  return `[Forwarded | ${parts.join(" | ")}]`;
}

/**
 * Build reply context string from a replied-to message.
 */
export function buildReplyContext(replyMsg: TelegramRawMessage, botId?: number): string | null {
  // Skip replies to own bot messages
  if (botId && replyMsg.from?.is_bot && replyMsg.from?.id === botId) return null;

  const repliedText = (replyMsg.text ?? replyMsg.caption ?? "").trim();
  const parts: string[] = [];

  if (replyMsg.photo?.length) parts.push("[photo]");
  if (replyMsg.document) parts.push(`[document: ${replyMsg.document.file_name ?? "file"}]`);
  if (replyMsg.video) parts.push(`[video: ${replyMsg.video.file_name ?? "video"}]`);
  if (replyMsg.audio) parts.push(`[audio: ${replyMsg.audio.file_name ?? replyMsg.audio.title ?? "audio"}]`);
  if (replyMsg.voice) parts.push("[voice message]");
  if (replyMsg.video_note) parts.push("[video note]");
  if (replyMsg.animation) parts.push("[animation/GIF]");
  if (replyMsg.sticker) parts.push(`[sticker${replyMsg.sticker.emoji ? ` ${replyMsg.sticker.emoji}` : ""}]`);

  const mediaHint = parts.length ? ` ${parts.join(" ")}` : "";
  const quoted = repliedText.length > 300 ? `${repliedText.slice(0, 300)}...` : repliedText;
  const replyContent = quoted ? `${quoted}${mediaHint}` : mediaHint.trim();

  if (!replyContent) return null;
  return `[Reply to: ${replyContent}]`;
}

export class TelegramAdapter implements Adapter<TelegramThreadId, TelegramRawMessage> {
  readonly name = "telegram";
  readonly userName: string;
  readonly botUserId?: string;

  private bot: Bot;
  private secondaryBots: Map<string, Bot> = new Map();
  private chat: ChatInstance | null = null;
  private logger: Logger;
  private readonly formatConverter: TelegramFormatConverter;
  private readonly config: TelegramAdapterConfig;
  private botInfo: { id: number; username?: string } | null = null;
  private mediaGroups: Map<string, MediaGroupEntry> = new Map();

  constructor(config: TelegramAdapterConfig & { logger?: Logger; userName?: string }) {
    this.config = config;
    this.bot = new Bot(config.botToken);
    this.logger = config.logger ?? new ConsoleLogger("info", "telegram");
    this.userName = config.userName ?? "bot";
    this.formatConverter = new TelegramFormatConverter();

    this.bot.catch((err) => {
      this.logger.error(`grammy error: ${err.message ?? err}`);
    });

    // Initialize secondary bots for multi-account
    if (config.accounts) {
      for (const [accountId, accountCfg] of Object.entries(config.accounts)) {
        if (accountCfg?.botToken) {
          const secondaryBot = new Bot(accountCfg.botToken);
          secondaryBot.catch((err) => {
            this.logger.error(`grammy error [${accountId}]: ${err.message ?? err}`);
          });
          this.secondaryBots.set(accountId, secondaryBot);
        }
      }
    }
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger = chat.getLogger("telegram");

    try {
      const me = await this.bot.api.getMe();
      this.botInfo = { id: me.id, username: me.username };
      (this as { botUserId?: string }).botUserId = String(me.id);
      this.logger.info("Telegram adapter initialized", {
        botId: me.id,
        botUsername: me.username,
      });
    } catch (err) {
      this.logger.warn(`Failed to fetch bot info: ${err}`);
    }

    this.bot.on("message", async (ctx) => {
      if (!this.chat) return;
      const msg = ctx.message;
      if (!msg) return;

      const rawMsg = msg as unknown as TelegramRawMessage;
      const chatId = String(rawMsg.chat.id);
      const threadPart = rawMsg.message_thread_id ? `:${rawMsg.message_thread_id}` : "";
      const threadId = `telegram:${chatId}${threadPart}`;

      // Group message control
      const isGroup = rawMsg.chat.type === "group" || rawMsg.chat.type === "supergroup";
      if (isGroup && this.config.groups) {
        const groupCfg = resolveGroupConfig(this.config.groups, chatId);
        const text = rawMsg.text ?? rawMsg.caption ?? "";
        const gate = shouldAllowGroupMessage({
          groupCfg,
          senderId: String(rawMsg.from?.id ?? "unknown"),
          text,
          botUsername: this.botInfo?.username,
        });
        if (!gate.allowed) return;
        // Update text with mention stripped
        if (gate.text !== text) {
          (rawMsg as any)._cleanedText = gate.text;
        }
      }

      // Media group merging
      if (rawMsg.media_group_id) {
        this.enqueueMediaGroup(rawMsg, threadId);
        return;
      }

      const parsed = this.parseTelegramMessage(rawMsg, threadId);
      try {
        await this.chat.handleIncomingMessage(this, threadId, parsed);
      } catch (err) {
        this.logger.error(`Error handling message: ${err}`);
      }
    });
  }

  private enqueueMediaGroup(msg: TelegramRawMessage, threadId: string): void {
    const groupId = msg.media_group_id!;
    const existing = this.mediaGroups.get(groupId);

    const attachments = this.extractAttachments(msg);
    const text = (msg as any)._cleanedText ?? msg.text ?? msg.caption ?? "";

    if (existing) {
      if (text) existing.texts.push(text);
      existing.attachments.push(...attachments);
      existing.lastMsg = msg;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flushMediaGroup(groupId, threadId), MEDIA_GROUP_DEBOUNCE_MS);
      return;
    }

    const entry: MediaGroupEntry = {
      texts: text ? [text] : [],
      attachments: [...attachments],
      timer: setTimeout(() => this.flushMediaGroup(groupId, threadId), MEDIA_GROUP_DEBOUNCE_MS),
      lastMsg: msg,
    };
    this.mediaGroups.set(groupId, entry);
  }

  private flushMediaGroup(groupId: string, threadId: string): void {
    const entry = this.mediaGroups.get(groupId);
    if (!entry) return;
    this.mediaGroups.delete(groupId);

    const combinedText = entry.texts.join("\n\n").trim() || "(album)";
    // Build a synthetic message with merged data
    const syntheticMsg: TelegramRawMessage = {
      ...entry.lastMsg,
      text: combinedText,
      caption: undefined,
    };
    (syntheticMsg as any)._mergedAttachments = entry.attachments;

    const parsed = this.parseTelegramMessage(syntheticMsg, threadId);
    if (this.chat) {
      this.chat.handleIncomingMessage(this, threadId, parsed).catch((err) => {
        this.logger.error(`Error handling media group: ${err}`);
      });
    }
  }

  async handleWebhook(request: Request, options?: WebhookOptions): Promise<Response> {
    if (!verifyWebhookSecret(request, this.config.webhook?.secretToken)) {
      this.logger.warn("Webhook secret verification failed");
      return webhookError("Invalid secret token", 401);
    }

    const update = await parseWebhookUpdate(request);
    if (!update) {
      return webhookError("Invalid update payload");
    }

    const processUpdate = async () => {
      await this.processUpdate(update);
    };

    if (options?.waitUntil) {
      options.waitUntil(processUpdate());
    } else {
      await processUpdate();
    }

    return webhookOk();
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.chat) return;

    const msg = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (!msg) return;

    const chatId = String(msg.chat.id);
    const threadPart = msg.message_thread_id ? `:${msg.message_thread_id}` : "";
    const threadId = `telegram:${chatId}${threadPart}`;

    // Group message control for webhook updates
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    if (isGroup && this.config.groups) {
      const groupCfg = resolveGroupConfig(this.config.groups, chatId);
      const text = msg.text ?? msg.caption ?? "";
      const gate = shouldAllowGroupMessage({
        groupCfg,
        senderId: String(msg.from?.id ?? "unknown"),
        text,
        botUsername: this.botInfo?.username,
      });
      if (!gate.allowed) return;
      if (gate.text !== text) {
        (msg as any)._cleanedText = gate.text;
      }
    }

    // Media group merging for webhook
    if (msg.media_group_id) {
      this.enqueueMediaGroup(msg, threadId);
      return;
    }

    const parsed = this.parseTelegramMessage(msg, threadId);
    try {
      await this.chat.handleIncomingMessage(this, threadId, parsed);
    } catch (err) {
      this.logger.error(`Error handling webhook update: ${err}`);
    }
  }

  async postMessage(threadId: string, message: AdapterPostableMessage): Promise<RawMessage<TelegramRawMessage>> {
    const { chatId, messageThreadId } = this.decodeThreadId(threadId);
    const text = this.formatConverter.renderPostable(message);
    const html = markdownToTelegramHtml(text);
    const threadOpts = messageThreadId ? { message_thread_id: Number(messageThreadId) } : {};

    let firstResult: TelegramRawMessage | null = null;
    const chunks = splitText(html);

    for (const chunk of chunks) {
      try {
        const sent = await withRetry(() =>
          this.bot.api.sendMessage(chatId, chunk, { parse_mode: "HTML", ...threadOpts }),
        );
        if (!firstResult) firstResult = sent as unknown as TelegramRawMessage;
      } catch {
        const sent = await this.bot.api.sendMessage(chatId, text, threadOpts);
        if (!firstResult) firstResult = sent as unknown as TelegramRawMessage;
      }
    }

    const msgId = String((firstResult as any)?.message_id ?? "0");
    return { id: msgId, threadId, raw: firstResult! };
  }

  async editMessage(threadId: string, messageId: string, message: AdapterPostableMessage): Promise<RawMessage<TelegramRawMessage>> {
    const { chatId } = this.decodeThreadId(threadId);
    const text = this.formatConverter.renderPostable(message);
    const html = markdownToTelegramHtml(text);

    try {
      const result = await withRetry(() =>
        this.bot.api.editMessageText(chatId, Number(messageId), html, { parse_mode: "HTML" }),
      );
      return { id: messageId, threadId, raw: result as unknown as TelegramRawMessage };
    } catch {
      const result = await this.bot.api.editMessageText(chatId, Number(messageId), text);
      return { id: messageId, threadId, raw: result as unknown as TelegramRawMessage };
    }
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const { chatId } = this.decodeThreadId(threadId);
    await withRetry(() => this.bot.api.deleteMessage(chatId, Number(messageId)));
  }

  async addReaction(threadId: string, messageId: string, emoji: EmojiValue | string): Promise<void> {
    const { chatId } = this.decodeThreadId(threadId);
    const emojiStr = typeof emoji === "string" ? emoji : emoji.name;
    try {
      await this.bot.api.setMessageReaction(chatId, Number(messageId), [{ type: "emoji", emoji: emojiStr }] as any);
    } catch (err) {
      this.logger.warn(`Failed to add reaction: ${err}`);
    }
  }

  async removeReaction(threadId: string, messageId: string, _emoji: EmojiValue | string): Promise<void> {
    const { chatId } = this.decodeThreadId(threadId);
    try {
      await this.bot.api.setMessageReaction(chatId, Number(messageId), [] as any);
    } catch (err) {
      this.logger.warn(`Failed to remove reaction: ${err}`);
    }
  }

  async startTyping(threadId: string, _status?: string): Promise<void> {
    const { chatId } = this.decodeThreadId(threadId);
    try {
      await this.bot.api.sendChatAction(chatId, "typing");
    } catch (err) {
      this.logger.warn(`Failed to send typing action: ${err}`);
    }
  }

  async fetchMessages(_threadId: string, _options?: FetchOptions): Promise<FetchResult<TelegramRawMessage>> {
    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { chatId, messageThreadId } = this.decodeThreadId(threadId);
    try {
      const chatInfo = await this.bot.api.getChat(chatId);
      return {
        id: threadId,
        channelId: `telegram:${chatId}`,
        channelName: (chatInfo as any).title ?? (chatInfo as any).first_name ?? chatId,
        isDM: (chatInfo as any).type === "private",
        metadata: { chatType: (chatInfo as any).type, messageThreadId, raw: chatInfo },
      };
    } catch {
      return {
        id: threadId,
        channelId: `telegram:${chatId}`,
        isDM: false,
        metadata: { chatId, messageThreadId },
      };
    }
  }

  async openDM(userId: string): Promise<string> {
    return this.encodeThreadId({ chatId: userId });
  }

  isDM(threadId: string): boolean {
    const { chatId } = this.decodeThreadId(threadId);
    const numId = Number(chatId);
    return !isNaN(numId) && numId > 0;
  }

  encodeThreadId(platformData: TelegramThreadId): string {
    const threadPart = platformData.messageThreadId ? `:${platformData.messageThreadId}` : "";
    return `telegram:${platformData.chatId}${threadPart}`;
  }

  decodeThreadId(threadId: string): TelegramThreadId {
    const parts = threadId.split(":");
    if (parts.length < 2 || parts[0] !== "telegram") {
      throw new Error(`Invalid Telegram thread ID: ${threadId}`);
    }
    return { chatId: parts[1]!, messageThreadId: parts[2] };
  }

  parseMessage(raw: unknown): Message<TelegramRawMessage> {
    const msg = raw as TelegramRawMessage;
    const chatId = String(msg.chat.id);
    const threadPart = msg.message_thread_id ? `:${msg.message_thread_id}` : "";
    const threadId = `telegram:${chatId}${threadPart}`;
    return this.parseTelegramMessage(msg, threadId);
  }

  private parseTelegramMessage(msg: TelegramRawMessage, threadId: string): Message<TelegramRawMessage> {
    let text = (msg as any)._cleanedText ?? msg.text ?? msg.caption ?? "";
    const author = msg.from;
    const isBot = author?.is_bot ?? false;
    const isMe = this.botInfo ? author?.id === this.botInfo.id : false;

    const fullName = author
      ? [author.first_name, author.last_name].filter(Boolean).join(" ")
      : "Unknown";

    // Forward context
    const forwardMeta = buildForwardContext(msg);
    if (forwardMeta) {
      text = `${forwardMeta}\n${text}`;
    }

    // Reply context
    if (msg.reply_to_message) {
      const replyCtx = buildReplyContext(msg.reply_to_message, this.botInfo?.id);
      if (replyCtx) {
        text = `${replyCtx}\n${text}`;
      }
    }

    // Sticker context
    if (msg.sticker) {
      const stickerParts: string[] = [];
      if (msg.sticker.emoji) stickerParts.push(msg.sticker.emoji);
      if (msg.sticker.set_name) stickerParts.push(`from "${msg.sticker.set_name}"`);
      if (msg.sticker.is_animated) stickerParts.push("(animated)");
      if (msg.sticker.is_video) stickerParts.push("(video)");
      const stickerCtx = `[Sticker${stickerParts.length ? ` ${stickerParts.join(" ")}` : ""}]`;
      text = text ? `${stickerCtx}\n${text}` : stickerCtx;
    }

    // Voice/audio metadata
    if (msg.voice) {
      const duration = msg.voice.duration ? ` ${msg.voice.duration}s` : "";
      const mime = msg.voice.mime_type ? ` ${msg.voice.mime_type}` : " audio/ogg";
      text = text ? `${text}\n[Voice message${duration}${mime}]` : `[Voice message${duration}${mime}]`;
    }

    if (msg.audio && !msg.voice) {
      const parts: string[] = [];
      if (msg.audio.performer) parts.push(msg.audio.performer);
      if (msg.audio.title) parts.push(msg.audio.title);
      const titleInfo = parts.length ? ` — ${parts.join(" - ")}` : "";
      const duration = msg.audio.duration ? ` ${msg.audio.duration}s` : "";
      const mime = msg.audio.mime_type ? ` ${msg.audio.mime_type}` : "";
      text = text ? `${text}\n[Audio${titleInfo}${duration}${mime}]` : `[Audio${titleInfo}${duration}${mime}]`;
    }

    // Video note context
    if (msg.video_note) {
      const duration = msg.video_note.duration ? ` ${msg.video_note.duration}s` : "";
      text = text ? `${text}\n[Video note (round video)${duration}]` : `[Video note (round video)${duration}]`;
    }

    // Document context for non-image documents
    if (msg.document && !msg.photo?.length && !msg.animation) {
      const fileName = msg.document.file_name ?? "file";
      const mimeType = msg.document.mime_type ?? "";
      text = text ? `${text}\n[Document: ${fileName} (${mimeType})]` : `[Document: ${fileName} (${mimeType})]`;
    }

    // Use merged attachments if available (from media group)
    const attachments = (msg as any)._mergedAttachments ?? this.extractAttachments(msg);

    return new Message<TelegramRawMessage>({
      id: String(msg.message_id),
      threadId,
      text,
      formatted: this.formatConverter.toAst(text),
      raw: msg,
      author: {
        userId: String(author?.id ?? "unknown"),
        userName: author?.username ?? author?.first_name ?? "unknown",
        fullName,
        isBot,
        isMe,
      },
      metadata: {
        dateSent: new Date((msg.date ?? 0) * 1000),
        edited: !!msg.edit_date,
        editedAt: msg.edit_date ? new Date(msg.edit_date * 1000) : undefined,
      },
      attachments,
    });
  }

  private extractAttachments(msg: TelegramRawMessage): Array<{
    type: "image" | "file" | "video" | "audio";
    url?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    fileId?: string;
  }> {
    const attachments: Array<{
      type: "image" | "file" | "video" | "audio";
      url?: string;
      name?: string;
      mimeType?: string;
      size?: number;
      fileId?: string;
    }> = [];

    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1]!;
      attachments.push({
        type: "image",
        name: `photo-${largest.file_id.slice(0, 8)}`,
        size: largest.file_size,
        fileId: largest.file_id,
      });
    }

    if (msg.sticker) {
      attachments.push({
        type: "image",
        name: `sticker-${msg.sticker.emoji ?? msg.sticker.file_unique_id}`,
        mimeType: msg.sticker.is_video ? "video/webm" : "image/webp",
        fileId: msg.sticker.file_id,
      });
    }

    if (msg.document) {
      attachments.push({
        type: "file",
        name: msg.document.file_name,
        mimeType: msg.document.mime_type,
        size: msg.document.file_size,
        fileId: msg.document.file_id,
      });
    }

    if (msg.video) {
      attachments.push({
        type: "video",
        name: msg.video.file_name,
        mimeType: msg.video.mime_type,
        fileId: msg.video.file_id,
      });
    }

    if (msg.audio) {
      attachments.push({
        type: "audio",
        name: msg.audio.file_name,
        mimeType: msg.audio.mime_type,
        fileId: msg.audio.file_id,
      });
    }

    if (msg.voice) {
      attachments.push({
        type: "audio",
        name: "voice",
        mimeType: msg.voice.mime_type ?? "audio/ogg",
        fileId: msg.voice.file_id,
      });
    }

    if (msg.video_note) {
      attachments.push({
        type: "video",
        name: "video_note",
        mimeType: "video/mp4",
        fileId: msg.video_note.file_id,
      });
    }

    if (msg.animation) {
      attachments.push({
        type: "video",
        name: msg.animation.file_name ?? "animation",
        mimeType: msg.animation.mime_type ?? "video/mp4",
        fileId: msg.animation.file_id,
      });
    }

    return attachments;
  }

  renderFormatted(content: FormattedContent): string {
    return this.formatConverter.fromAst(content);
  }

  async stream(
    threadId: string,
    textStream: AsyncIterable<string>,
    options?: StreamOptions,
  ): Promise<RawMessage<TelegramRawMessage>> {
    const updateIntervalMs = options?.updateIntervalMs ?? 1000;
    const { chatId, messageThreadId } = this.decodeThreadId(threadId);
    const threadOpts = messageThreadId ? { message_thread_id: Number(messageThreadId) } : {};

    let accumulated = "";
    let sentMessageId: string | null = null;
    let lastUpdateTime = 0;
    let rawResult: TelegramRawMessage | null = null;

    for await (const chunk of textStream) {
      accumulated += chunk;
      const now = Date.now();

      if (!sentMessageId) {
        if (accumulated.trim()) {
          try {
            const sent = await this.bot.api.sendMessage(chatId, markdownToTelegramHtml(accumulated), { parse_mode: "HTML", ...threadOpts });
            sentMessageId = String(sent.message_id);
            rawResult = sent as unknown as TelegramRawMessage;
            lastUpdateTime = now;
          } catch {
            const sent = await this.bot.api.sendMessage(chatId, accumulated, threadOpts);
            sentMessageId = String(sent.message_id);
            rawResult = sent as unknown as TelegramRawMessage;
            lastUpdateTime = now;
          }
        }
      } else if (now - lastUpdateTime >= updateIntervalMs) {
        try {
          await this.bot.api.editMessageText(chatId, Number(sentMessageId), markdownToTelegramHtml(accumulated), { parse_mode: "HTML" });
          lastUpdateTime = now;
        } catch { /* ignore */ }
      }
    }

    if (sentMessageId && accumulated.trim()) {
      try {
        const result = await this.bot.api.editMessageText(chatId, Number(sentMessageId), markdownToTelegramHtml(accumulated), { parse_mode: "HTML" });
        rawResult = result as unknown as TelegramRawMessage;
      } catch { /* ignore */ }
    }

    if (!sentMessageId) {
      const sent = await this.bot.api.sendMessage(chatId, "...", threadOpts);
      sentMessageId = String(sent.message_id);
      rawResult = sent as unknown as TelegramRawMessage;
    }

    return { id: sentMessageId!, threadId, raw: rawResult! };
  }

  channelIdFromThreadId(threadId: string): string {
    const parts = threadId.split(":");
    return `${parts[0]}:${parts[1]}`;
  }

  getBot(): Bot {
    return this.bot;
  }

  /** Get a secondary bot by account ID, or the primary bot. */
  getBotForAccount(accountId?: string): Bot {
    if (accountId && this.secondaryBots.has(accountId)) {
      return this.secondaryBots.get(accountId)!;
    }
    return this.bot;
  }
}

export function createTelegramAdapter(
  config?: Partial<TelegramAdapterConfig> & { logger?: Logger; userName?: string },
): TelegramAdapter {
  const botToken = config?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error(
      "Telegram bot token is required. Provide botToken in config or set TELEGRAM_BOT_TOKEN env var.",
    );
  }

  return new TelegramAdapter({
    botToken,
    webhook: config?.webhook,
    apiBaseUrl: config?.apiBaseUrl,
    proxy: config?.proxy,
    accounts: config?.accounts,
    groups: config?.groups,
    media: config?.media,
    logger: config?.logger,
    userName: config?.userName,
  });
}
