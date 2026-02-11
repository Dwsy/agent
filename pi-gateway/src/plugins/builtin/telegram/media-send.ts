import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { Bot, InputFile } from "grammy";
import type { TelegramMediaDirective, TelegramParsedOutbound } from "./types.ts";
import { clipCaption, markdownToTelegramHtml, splitCaption, splitTelegramText } from "./format.ts";
import { validateMediaPath } from "../../../core/media-security.ts";

export interface TelegramSendOptions {
  messageThreadId?: number;
  replyToMessageId?: number;
}


function normalizePath(pathRaw: string): string {
  if (pathRaw.startsWith("file://")) {
    return decodeURIComponent(pathRaw.slice("file://".length));
  }
  // Don't expand ~ — system prompt tells agents to avoid ~ paths
  return pathRaw;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function parseTargetAndCaption(raw: string): { target: string; caption?: string } | null {
  const input = raw.trim();
  if (!input) return null;

  // Supports quoted path/url: /photo "./a b.png" caption
  const m = input.match(/^(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+([\s\S]+))?$/);
  if (!m) return null;
  const target = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  const caption = m[4]?.trim();
  if (!target) return null;
  return { target, caption: caption || undefined };
}

export function parseMediaCommandArgs(raw: string): { target: string; caption?: string } | null {
  return parseTargetAndCaption(raw);
}

export function parseOutboundMediaDirectives(text: string): TelegramParsedOutbound {
  const lines = text.split("\n");
  const media: TelegramMediaDirective[] = [];
  const remain: string[] = [];
  const directiveRe = /^\s*\[(photo|audio)\]\s+(.+?)(?:\s*\|\s*(.+))?\s*$/i;
  const mediaRe = /^\s*MEDIA:(.+)$/;

  for (const line of lines) {
    const match = line.match(directiveRe);
    if (match) {
      media.push({
        kind: match[1].toLowerCase() as "photo" | "audio",
        url: match[2].trim(),
        caption: match[3]?.trim() || undefined,
      });
      continue;
    }

    const mediaMatch = line.match(mediaRe);
    if (mediaMatch) {
      const path = mediaMatch[1].trim();
      // Security: validate path via centralized checker
      if (!isHttpUrl(path) && !validateMediaPath(path)) {
        remain.push(line); // treat as normal text
        continue;
      }
      // Infer kind from extension
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
      const audioExts = new Set(["mp3", "ogg", "wav", "m4a", "flac"]);
      const kind = imageExts.has(ext) ? "photo" : audioExts.has(ext) ? "audio" : "document";
      media.push({ kind: kind as any, url: path });
      continue;
    }

    remain.push(line);
  }

  return {
    text: remain.join("\n").trim(),
    media,
  };
}

async function sendLocalFileByKind(bot: Bot, chatId: string, item: TelegramMediaDirective, opts?: TelegramSendOptions): Promise<void> {
  const localPath = normalizePath(item.url);

  // Security: final guard via centralized validator
  if (!validateMediaPath(item.url)) {
    throw new Error(`Blocked unsafe media path: ${item.url}`);
  }

  if (!existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  const threadOpts = opts?.messageThreadId ? { message_thread_id: opts.messageThreadId } : undefined;
  const replyOpts = opts?.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : undefined;

  const data = readFileSync(localPath);
  const fileName = basename(localPath) || "file";
  const file = new InputFile(data, fileName);
  const { caption, followUpText } = splitCaption(item.caption);
  const htmlCaption = caption ? markdownToTelegramHtml(clipCaption(caption)) : undefined;

  if (item.kind === "photo") {
    const lower = fileName.toLowerCase();
    const isGif = lower.endsWith(".gif");
    if (isGif) {
      await bot.api.sendAnimation(chatId, file, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    } else {
      await bot.api.sendPhoto(chatId, file, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    }
  } else {
    // Audio kind: prefer sendAudio. Voice mode is explicit by extension/ogg.
    if (fileName.toLowerCase().endsWith(".ogg")) {
      await bot.api.sendVoice(chatId, file, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    } else {
      await bot.api.sendAudio(chatId, file, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    }
  }

  if (followUpText) {
    for (const chunk of splitTelegramText(followUpText, 4096)) {
      try {
        await bot.api.sendMessage(chatId, markdownToTelegramHtml(chunk), { parse_mode: "HTML", ...threadOpts, ...replyOpts });
      } catch {
        await bot.api.sendMessage(chatId, chunk, { ...threadOpts, ...replyOpts });
      }
    }
  }
}

async function sendRemoteByKind(bot: Bot, chatId: string, item: TelegramMediaDirective, opts?: TelegramSendOptions): Promise<void> {
  const threadOpts = opts?.messageThreadId ? { message_thread_id: opts.messageThreadId } : undefined;
  const replyOpts = opts?.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : undefined;
  const caption = item.caption ? clipCaption(item.caption) : undefined;
  const { caption: captionShort, followUpText } = splitCaption(caption);
  const htmlCaption = captionShort ? markdownToTelegramHtml(captionShort) : undefined;

  if (item.kind === "photo") {
    const isGif = item.url.toLowerCase().includes(".gif");
    if (isGif) {
      await bot.api.sendAnimation(chatId, item.url, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    } else {
      await bot.api.sendPhoto(chatId, item.url, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    }
  } else {
    const isVoiceLike = /\.ogg(?:\?|$)/i.test(item.url);
    if (isVoiceLike) {
      await bot.api.sendVoice(chatId, item.url, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    } else {
      await bot.api.sendAudio(chatId, item.url, htmlCaption ? { caption: htmlCaption, parse_mode: "HTML", ...threadOpts, ...replyOpts } : { ...threadOpts, ...replyOpts });
    }
  }

  if (followUpText) {
    for (const chunk of splitTelegramText(followUpText, 4096)) {
      try {
        await bot.api.sendMessage(chatId, markdownToTelegramHtml(chunk), { parse_mode: "HTML", ...threadOpts, ...replyOpts });
      } catch {
        await bot.api.sendMessage(chatId, chunk, { ...threadOpts, ...replyOpts });
      }
    }
  }
}

export async function sendTelegramMedia(bot: Bot, chatId: string, item: TelegramMediaDirective, opts?: TelegramSendOptions): Promise<void> {
  if (isHttpUrl(item.url)) {
    await sendRemoteByKind(bot, chatId, item, opts);
    return;
  }
  await sendLocalFileByKind(bot, chatId, item, opts);
}

export async function sendTelegramTextAndMedia(bot: Bot, chatId: string, text: string, opts?: TelegramSendOptions): Promise<void> {
  const parsed = parseOutboundMediaDirectives(text);
  const threadOpts = opts?.messageThreadId ? { message_thread_id: opts.messageThreadId } : undefined;
  const replyOpts = opts?.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : undefined;

  if (parsed.text) {
    const chunks = splitTelegramText(parsed.text, 4096);
    for (const chunk of chunks) {
      try {
        await bot.api.sendMessage(chatId, markdownToTelegramHtml(chunk), { parse_mode: "HTML", ...threadOpts, ...replyOpts });
      } catch {
        await bot.api.sendMessage(chatId, chunk, { ...threadOpts, ...replyOpts });
      }
    }
  }

  for (const item of parsed.media) {
    try {
      await sendTelegramMedia(bot, chatId, item, opts);
    } catch (err: any) {
      const reason = err?.message ?? "unknown";
      await bot.api.sendMessage(chatId, `Failed to send ${item.kind}: ${reason}`).catch(() => {});
    }
  }
}
