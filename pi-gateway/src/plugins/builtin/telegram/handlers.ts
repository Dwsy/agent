import { resolveSessionKey, resolveAgentRoute } from "../../../core/session-router.ts";
import type { ImageContent, MessageSource } from "../../../core/types.ts";
import { isSenderAllowed, type DmPolicy } from "../../../security/allowlist.ts";
import { createPairingRequest } from "../../../security/pairing.ts";
import { resolveStreamCompat } from "./config-compat.ts";
import { executeBashCommand, isAuthorizedSender } from "./commands.ts";
import { downloadTelegramFile } from "./media-download.ts";
import { compressImageForAgent } from "./image-compress.ts";
import { migrateTelegramGroupConfig } from "./group-migration.ts";
import { buildReactionText } from "./reaction-level.ts";
import { wasRecentlySent } from "./sent-message-cache.ts";
import { dispatchAgentTurn } from "./streaming.ts";
import { saveMediaBuffer } from "./media-storage.ts";
import { getCachedSticker, cacheSticker } from "./sticker-cache.ts";
import type {
  StickerMetadata,
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
    messageId: msg?.message_id ? String(msg.message_id) : undefined,
    timestamp: msg?.date,
  };
}

/**
 * Build rich forward context from Telegram forward_origin (Bot API 7.0+) or legacy fields.
 * Returns null if the message is not forwarded.
 */
function buildForwardContext(msg: TelegramMessage): string | null {
  const origin = msg.forward_origin;
  const parts: string[] = [];

  if (origin) {
    // Bot API 7.0+ forward_origin
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
    // Legacy forward fields
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

// dispatchAgentTurn → streaming.ts

async function resolveImagesFromMessage(
  account: TelegramAccountRuntime,
  msg: TelegramMessage,
  chatId?: string,
): Promise<{ images: ImageContent[]; documentContext?: string; stickerMetadata?: StickerMetadata }> {
  const images: ImageContent[] = [];
  let documentContext: string | undefined;
  let stickerMetadata: StickerMetadata | undefined;
  const maxMb = Math.max(1, account.cfg.mediaMaxMb ?? 10);
  const maxBytes = maxMb * 1024 * 1024;
  const imageMaxBytes = Math.min(maxBytes, Math.floor(4.5 * 1024 * 1024));

  const pushImageForAgent = async (source: string, data: string, mimeType: string): Promise<void> => {
    const compressed = await compressImageForAgent(
      { type: "image", data, mimeType },
      { maxBytes: imageMaxBytes },
    );

    if (compressed.wasResized) {
      console.log(
        `[telegram-media] ${source} compressed: ${compressed.originalWidth}x${compressed.originalHeight} -> ${compressed.width}x${compressed.height}, mime=${compressed.mimeType}, base64=${compressed.data.length}`,
      );
    }

    images.push({ type: "image", data: compressed.data, mimeType: compressed.mimeType });
  };

  console.log(`[telegram-media] resolveImages: photo=${msg.photo?.length ?? 0} document=${msg.document?.file_id ? 'yes' : 'no'} sticker=${msg.sticker ? 'yes' : 'no'} video=${msg.video ? 'yes' : 'no'} audio=${msg.audio ? 'yes' : 'no'} animation=${msg.animation ? 'yes' : 'no'} video_note=${msg.video_note ? 'yes' : 'no'}`);

  // ── Sticker handling (reference: openclaw/openclaw) ──
  if (msg.sticker?.file_id) {
    const sticker = msg.sticker;
    const isAnimated = sticker.is_animated;
    const isVideo = sticker.is_video;
    const fileUniqueId = sticker.file_unique_id;

    console.log(`[telegram-media] sticker: file_id=${sticker.file_id.slice(0, 20)}... emoji=${sticker.emoji ?? ''} set=${sticker.set_name ?? ''} animated=${isAnimated} video=${isVideo}`);

    // Check cache first — avoid re-downloading known stickers
    const cached = fileUniqueId ? getCachedSticker(fileUniqueId) : null;
    if (cached) {
      console.log(`[telegram-media] sticker cache hit: ${fileUniqueId}`);
      // Refresh metadata if changed (file_id rotates, emoji/set may update)
      const needsRefresh =
        cached.fileId !== sticker.file_id ||
        cached.emoji !== (sticker.emoji ?? cached.emoji) ||
        cached.setName !== (sticker.set_name ?? cached.setName);
      if (needsRefresh) {
        cacheSticker({
          ...cached,
          fileId: sticker.file_id,
          emoji: sticker.emoji ?? cached.emoji,
          setName: sticker.set_name ?? cached.setName,
        });
      }
    }

    // For animated (TGS) and video (WEBM) stickers, use thumbnail instead
    // Static stickers (WEBP) are downloaded directly
    const downloadFileId = (isAnimated || isVideo)
      ? sticker.thumbnail?.file_id  // thumbnail is jpg/webp
      : sticker.file_id;
    const isThumbnail = isAnimated || isVideo;

    if (downloadFileId) {
      const downloaded = await downloadTelegramFile({
        token: account.token,
        fileId: downloadFileId,
        maxBytes,
      });

      if (downloaded) {
        const mime = downloaded.mimeType.startsWith("image/")
          ? downloaded.mimeType
          : "image/webp";

        // Save to disk: .pi/gateway/media/telegram/{chatId}/{date}/sticker-{id}.ext
        const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
        const filename = `sticker-${fileUniqueId}${isThumbnail ? "-thumb" : ""}.${ext}`;
        let savedPath: string | undefined;
        try {
          const saved = saveMediaBuffer({
            channel: "telegram",
            chatId: chatId ?? "unknown",
            buffer: Buffer.from(downloaded.data, "base64"),
            contentType: mime,
            filename,
          });
          savedPath = saved.path;
          console.log(`[telegram-media] sticker saved: ${saved.relativePath}`);
        } catch (err) {
          console.error(`[telegram-media] sticker save failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Pass image to agent
        await pushImageForAgent("sticker", downloaded.data, mime);

        // Build metadata
        stickerMetadata = {
          emoji: sticker.emoji ?? undefined,
          setName: sticker.set_name ?? undefined,
          fileId: sticker.file_id,
          fileUniqueId,
          isThumbnail,
          savedPath,
        };

        // Cache the sticker
        if (fileUniqueId) {
          cacheSticker({
            fileId: sticker.file_id,
            fileUniqueId,
            emoji: sticker.emoji ?? undefined,
            setName: sticker.set_name ?? undefined,
            filePath: savedPath,
            contentType: mime,
            isThumbnail,
            cachedAt: new Date().toISOString(),
            receivedFrom: chatId,
          });
        }

        // Build context string for agent
        const parts: string[] = [];
        if (sticker.emoji) parts.push(sticker.emoji);
        if (sticker.set_name) parts.push(`from "${sticker.set_name}"`);
        if (isThumbnail) parts.push("(thumbnail — animated/video sticker)");
        const stickerCtx = parts.length ? parts.join(" ") : "";
        const stickerPathNote = savedPath ? `\nFile saved to: ${savedPath}` : "";
        documentContext = `[Sticker${stickerCtx ? ` ${stickerCtx}` : ""}${stickerPathNote}]`;

        console.log(`[telegram-media] sticker resolved: ${mime} ${downloaded.data.length} chars base64, thumbnail=${isThumbnail}`);
      }
    } else if (isAnimated || isVideo) {
      // No thumbnail available — provide metadata only
      const parts: string[] = [];
      if (sticker.emoji) parts.push(sticker.emoji);
      if (sticker.set_name) parts.push(`from "${sticker.set_name}"`);
      parts.push(isVideo ? "(video sticker, no preview)" : "(animated sticker, no preview)");
      documentContext = `[Sticker ${parts.join(" ")}]`;
      console.log(`[telegram-media] sticker skipped (no thumbnail): animated=${isAnimated} video=${isVideo}`);
    }
  }

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
        await pushImageForAgent("photo", downloaded.data, downloaded.mimeType);

        // Save photo to disk for agent file access
        const ext = downloaded.mimeType === "image/png" ? "png" : downloaded.mimeType === "image/webp" ? "webp" : "jpg";
        const filename = `photo-${Date.now()}.${ext}`;
        try {
          const saved = saveMediaBuffer({
            channel: "telegram",
            chatId: chatId ?? "unknown",
            buffer: Buffer.from(downloaded.data, "base64"),
            contentType: downloaded.mimeType,
            filename,
          });
          console.log(`[telegram-media] photo saved: ${saved.relativePath}`);
          if (!documentContext) {
            documentContext = `[Photo saved to: ${saved.path}]`;
          }
        } catch (err) {
          console.error(`[telegram-media] photo save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  if (msg.document?.file_id && !msg.animation) {
    const downloaded = await downloadTelegramFile({
      token: account.token,
      fileId: msg.document.file_id,
      maxBytes,
    });
    if (downloaded) {
      if (downloaded.mimeType.startsWith("image/")) {
        await pushImageForAgent("document-image", downloaded.data, downloaded.mimeType);

        // Save image document to disk
        const ext = downloaded.mimeType === "image/png" ? "png" : downloaded.mimeType === "image/webp" ? "webp" : "jpg";
        const docFileName = msg.document.file_name ?? `doc-image-${Date.now()}.${ext}`;
        try {
          const saved = saveMediaBuffer({
            channel: "telegram",
            chatId: chatId ?? "unknown",
            buffer: Buffer.from(downloaded.data, "base64"),
            contentType: downloaded.mimeType,
            filename: docFileName,
          });
          console.log(`[telegram-media] document-image saved: ${saved.relativePath}`);
          if (!documentContext) {
            documentContext = `[Image: ${docFileName}, saved to: ${saved.path}]`;
          }
        } catch (err) {
          console.error(`[telegram-media] document-image save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      // Non-image documents: save to disk and attach context
      if (!downloaded.mimeType.startsWith("image/")) {
        const fileName = msg.document.file_name ?? "unknown";
        const mimeType = msg.document.mime_type ?? downloaded.mimeType;

        // Save all documents to disk for agent access
        let savedPath: string | undefined;
        try {
          const saved = saveMediaBuffer({
            channel: "telegram",
            chatId: chatId ?? "unknown",
            buffer: Buffer.from(downloaded.data, "base64"),
            contentType: mimeType,
            filename: fileName,
          });
          savedPath = saved.path;
          console.log(`[telegram-media] document saved: ${saved.relativePath}`);
        } catch (err) {
          console.error(`[telegram-media] document save failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // For text-based documents, decode content and attach as context
        if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") {
          try {
            const textContent = Buffer.from(downloaded.data, "base64").toString("utf-8");
            const truncated = textContent.length > 10000 ? textContent.slice(0, 10000) + "\n...(truncated)" : textContent;
            const pathNote = savedPath ? `\nFile saved to: ${savedPath}` : "";
            documentContext = `[Document: ${fileName} (${mimeType})]${pathNote}\n\`\`\`\n${truncated}\n\`\`\``;
          } catch {
            const pathNote = savedPath ? `, saved to: ${savedPath}` : "";
            documentContext = `[Document: ${fileName} (${mimeType}, ${downloaded.data.length} bytes base64${pathNote})]`;
          }
        } else {
          const pathNote = savedPath ? `\nFile saved to: ${savedPath}` : "";
          documentContext = `[Document: ${fileName} (${mimeType})${pathNote}]`;
        }
      }
    }
  }

  // ── Video handling ──
  if (msg.video?.file_id) {
    const downloaded = await downloadTelegramFile({ token: account.token, fileId: msg.video.file_id, maxBytes });
    if (downloaded) {
      const fileName = msg.video.file_name ?? `video-${Date.now()}.mp4`;
      const mimeType = msg.video.mime_type ?? downloaded.mimeType;
      try {
        const saved = saveMediaBuffer({
          channel: "telegram", chatId: chatId ?? "unknown",
          buffer: Buffer.from(downloaded.data, "base64"), contentType: mimeType, filename: fileName,
        });
        console.log(`[telegram-media] video saved: ${saved.relativePath}`);
        const ctx = `[Video: ${fileName} (${mimeType})\nFile saved to: ${saved.path}]`;
        documentContext = documentContext ? `${documentContext}\n\n${ctx}` : ctx;
      } catch (err) {
        console.error(`[telegram-media] video save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Video note (round video) handling ──
  if (msg.video_note?.file_id) {
    const downloaded = await downloadTelegramFile({ token: account.token, fileId: msg.video_note.file_id, maxBytes });
    if (downloaded) {
      const fileName = `video-note-${Date.now()}.mp4`;
      try {
        const saved = saveMediaBuffer({
          channel: "telegram", chatId: chatId ?? "unknown",
          buffer: Buffer.from(downloaded.data, "base64"), contentType: "video/mp4", filename: fileName,
        });
        console.log(`[telegram-media] video_note saved: ${saved.relativePath}`);
        const ctx = `[Video Note (round video)\nFile saved to: ${saved.path}]`;
        documentContext = documentContext ? `${documentContext}\n\n${ctx}` : ctx;
      } catch (err) {
        console.error(`[telegram-media] video_note save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Audio handling ──
  if (msg.audio?.file_id) {
    const downloaded = await downloadTelegramFile({ token: account.token, fileId: msg.audio.file_id, maxBytes });
    if (downloaded) {
      const fileName = msg.audio.file_name ?? `audio-${Date.now()}.mp3`;
      const mimeType = msg.audio.mime_type ?? downloaded.mimeType;
      const titleParts: string[] = [];
      if (msg.audio.performer) titleParts.push(msg.audio.performer);
      if (msg.audio.title) titleParts.push(msg.audio.title);
      const titleInfo = titleParts.length ? ` — ${titleParts.join(" - ")}` : "";
      try {
        const saved = saveMediaBuffer({
          channel: "telegram", chatId: chatId ?? "unknown",
          buffer: Buffer.from(downloaded.data, "base64"), contentType: mimeType, filename: fileName,
        });
        console.log(`[telegram-media] audio saved: ${saved.relativePath}`);
        const ctx = `[Audio: ${fileName}${titleInfo} (${mimeType})\nFile saved to: ${saved.path}]`;
        documentContext = documentContext ? `${documentContext}\n\n${ctx}` : ctx;
      } catch (err) {
        console.error(`[telegram-media] audio save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Animation (GIF) handling ──
  // Telegram sends both animation and document for GIFs; document is skipped above when animation exists.
  if (msg.animation?.file_id) {
    const downloaded = await downloadTelegramFile({ token: account.token, fileId: msg.animation.file_id, maxBytes });
    if (downloaded) {
      const fileName = msg.animation.file_name ?? `animation-${Date.now()}.mp4`;
      const mimeType = msg.animation.mime_type ?? downloaded.mimeType;
      try {
        const saved = saveMediaBuffer({
          channel: "telegram", chatId: chatId ?? "unknown",
          buffer: Buffer.from(downloaded.data, "base64"), contentType: mimeType, filename: fileName,
        });
        console.log(`[telegram-media] animation saved: ${saved.relativePath}`);
        const ctx = `[Animation/GIF: ${fileName} (${mimeType})\nFile saved to: ${saved.path}]`;
        documentContext = documentContext ? `${documentContext}\n\n${ctx}` : ctx;
      } catch (err) {
        console.error(`[telegram-media] animation save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { images, documentContext, stickerMetadata };
}

function shouldAllowGroupMessage(account: TelegramAccountRuntime, ctx: TelegramContext, text: string): { allowed: boolean; text: string } {
  const chatId = String(ctx.chat?.id ?? "");
  const groupCfg = account.cfg.groups?.[chatId] ?? account.cfg.groups?.["*"];
  let finalText = text;

  console.log(`[telegram:group-gate] chatId=${chatId} groupCfg=${JSON.stringify(groupCfg)} hasGroups=${!!account.cfg.groups} keys=${Object.keys(account.cfg.groups ?? {}).join(",")}`);

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
    const route = resolveAgentRoute(entry.source, combinedText, runtime.api.config);
    const { agentId, text: routedText } = route;
    const sessionKey = resolveSessionKey(entry.source, runtime.api.config, agentId);

    void dispatchAgentTurn({
      runtime,
      account,
      ctx: entry.ctx,
      source: { ...entry.source, agentId },
      sessionKey,
      text: routedText || "(image)",
      images: entry.images,
      inboundMessageId: entry.ctx.message?.message_id,
    });
    params.runtime.api.logger.info(
      `[telegram:${account.accountId}] inbound chat=${chatId} sender=${entry.source.senderId} type=${entry.source.chatType} agentId=${agentId} agentSource=${route.source}${route.bindingScore !== undefined ? ` bindingScore=${route.bindingScore}` : ""} textLen=${routedText.length} images=${entry.images.length}`,
    );
  };

  // !cmd shortcut — execute shell on gateway host (authorized senders only)
  if (text.startsWith("!") && text.length > 1 && !text.startsWith("!!")) {
    if (isAuthorizedSender(source.senderId, account)) {
      await executeBashCommand(ctx, text.slice(1).trim(), runtime, account.accountId);
      return;
    }
  }

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

  const { images, documentContext } = await resolveImagesFromMessage(account, msg, chatId);
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

  // Forward context — full metadata injection
  const forwardMeta = buildForwardContext(msg);
  if (forwardMeta) {
    text = `${forwardMeta}\n${text}`;
  }

  // Reply context — include text and media type hints from the replied message
  const replyMsg = msg.reply_to_message;
  if (replyMsg) {
    const repliedIsBot = replyMsg.from?.is_bot && replyMsg.from?.id === account.bot.botInfo?.id;
    if (!repliedIsBot) {
      const repliedText = (replyMsg.text ?? replyMsg.caption ?? "").trim();
      const parts: string[] = [];

      // Media type hints for the replied message
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

      if (replyContent) {
        text = text ? `[Reply to]${replyContent ? ` ${replyContent}` : ""}\n\n${text}` : `[Reply to] ${replyContent}`;
      }
    }
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

      // Save voice to disk
      let voiceSavedPath: string | undefined;
      try {
        const voiceFilename = `voice-${Date.now()}.ogg`;
        const saved = saveMediaBuffer({
          channel: "telegram",
          chatId,
          buffer,
          contentType: downloaded.mimeType || "audio/ogg",
          filename: voiceFilename,
        });
        voiceSavedPath = saved.path;
        console.log(`[telegram-media] voice saved: ${saved.relativePath}`);
      } catch (err) {
        console.error(`[telegram-media] voice save failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      const { transcribeAudio } = await import("./audio-transcribe.ts");
      const transcript = await transcribeAudio(buffer, downloaded.mimeType || "audio/ogg", {
        provider: audioCfg.provider ?? "groq",
        model: audioCfg.model ?? "whisper-large-v3-turbo",
        apiKey: audioCfg.apiKey,
        language: audioCfg.language,
        timeoutMs: (audioCfg.timeoutSeconds ?? 30) * 1000,
      });
      if (transcript) {
        const pathNote = voiceSavedPath ? ` (saved to: ${voiceSavedPath})` : "";
        text = text ? `${text}\n\n[Voice message${pathNote}] ${transcript}` : `[Voice message${pathNote}] ${transcript}`;
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
  const localCommands = new Set(["new", "stop", "status", "queue", "cron", "help", "media", "photo", "audio", "model", "refresh", "skills", "sys"]);

  bot.on("message", async (ctx: any) => {
    const updateId = Number((ctx.update as any)?.update_id ?? -1);
    console.log(`[telegram:${account.accountId}] on:message updateId=${updateId} chatId=${ctx.chat?.id} chatType=${ctx.chat?.type} text="${(ctx.message?.text ?? ctx.message?.caption ?? "").slice(0, 40)}"`);
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
