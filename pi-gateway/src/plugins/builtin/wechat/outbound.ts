import path from "node:path";
import { splitMessage } from "../../../core/utils.ts";
import type { InlineKeyboardMarkup, MediaSendOptions, SendOptions } from "../../types.ts";
import type {
  WechatAccountRuntime,
  WechatTarget,
  WechatSendMessageReq,
  WechatOutboundItem,
} from "./types.ts";
import { sendWechatMessage, generateClientId } from "./api.ts";
import { WECHAT_PLATFORM_TEXT_LIMIT } from "./config.ts";

export function encodeWechatMediaAesKey(aeskey: Buffer): string {
  return Buffer.from(aeskey.toString("hex"), "utf-8").toString("base64");
}

/**
 * Encode a WechatTarget to a string for internal routing.
 */
export function encodeWechatTarget(target: WechatTarget): string {
  const parts = [target.peerType, target.id];
  if (target.msgId) parts.push(`msg=${target.msgId}`);
  if (target.contextToken) parts.push(`ctx=${target.contextToken.slice(0, 16)}`);
  return parts.join("|");
}

/**
 * Parse a WechatTarget from an encoded string.
 */
export function parseWechatTarget(raw: string): WechatTarget {
  const [peerType, id, ...rest] = raw.split("|");
  const target: WechatTarget = {
    peerType: (peerType as WechatTarget["peerType"]) || "c2c",
    id,
  };
  for (const token of rest) {
    const [key, value] = token.split("=");
    if (!value) continue;
    if (key === "msg") target.msgId = value;
    // contextToken is stored in runtime.contextTokens, not in target string
  }
  return target;
}

/**
 * Get text chunk limit for Weixin.
 */
export function getWechatTextChunkLimit(runtime: WechatAccountRuntime): number {
  const configured = Number(runtime.channelCfg.textChunkLimit ?? WECHAT_PLATFORM_TEXT_LIMIT);
  if (!Number.isFinite(configured) || configured < 1) {
    return WECHAT_PLATFORM_TEXT_LIMIT;
  }
  return Math.min(Math.floor(configured), WECHAT_PLATFORM_TEXT_LIMIT);
}

/**
 * Chunk text for Weixin (splits at ~4000 char limit).
 */
export function chunkWechatText(
  text: string,
  limit: number = WECHAT_PLATFORM_TEXT_LIMIT
): string[] {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : WECHAT_PLATFORM_TEXT_LIMIT;
  if (text.length <= normalizedLimit) return [text];
  return splitMessage(text, normalizedLimit);
}

/**
 * Convert markdown to plain text for Weixin delivery.
 * Preserves newlines; strips markdown syntax.
 */
export function markdownToPlainText(text: string): string {
  let result = text;
  // Code blocks: strip fences, keep code content
  result = result.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim());
  // Images: remove entirely
  result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Links: keep display text only
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Bold/italic: strip markers
  result = result.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  // Headers: strip # markers
  result = result.replace(/^#{1,6}\s+/gm, "");
  return result.trim();
}

/**
 * Get cached context token for a user.
 */
export function getWechatContextToken(
  runtime: WechatAccountRuntime,
  userId: string
): string | undefined {
  return runtime.contextTokens.get(`${runtime.accountId}:${userId}`)
    ?? runtime.contextTokens.get(userId);
}

/**
 * Send a text message via Weixin.
 * contextToken is REQUIRED for conversation association.
 */
export async function sendWechatText(
  runtime: WechatAccountRuntime,
  rawTarget: string,
  text: string,
  opts?: SendOptions
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const target = parseWechatTarget(rawTarget);
    const contextToken = getWechatContextToken(runtime, target.id);

    if (!contextToken) {
      runtime.api.logger.warn(
        `sendWechatText: no contextToken for userId=${target.id}, message may not associate`
      );
    }

    const plainText = markdownToPlainText(text);
    const chunks = chunkWechatText(plainText, getWechatTextChunkLimit(runtime));
    let messageId: string | undefined;

    for (const chunk of chunks) {
      const item: WechatOutboundItem = {
        type: 1,
        text_item: { text: chunk },
      } as WechatOutboundItem;

      const req: WechatSendMessageReq = {
        msg: {
          from_user_id: "",
          to_user_id: target.id,
          client_id: generateClientId(),
          message_type: 2, // BOT
          message_state: 2, // FINISH
          item_list: [item],
          context_token: contextToken,
        },
      };

      const result = await sendWechatMessage(runtime, req);
      messageId = result.messageId;
    }

    return { ok: true, messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send a media file via Weixin.
 * Uploads to CDN with AES-128-ECB encryption and sends.
 */
export async function sendWechatMedia(
  runtime: WechatAccountRuntime,
  rawTarget: string,
  filePath: string,
  opts?: MediaSendOptions
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const target = parseWechatTarget(rawTarget);
    const contextToken = getWechatContextToken(runtime, target.id);

    if (!contextToken) {
      runtime.api.logger.error(
        `sendWechatMedia: no contextToken for userId=${target.id}, refusing to send`
      );
      return { ok: false, error: "contextToken required for media send" };
    }

    // Import media functions dynamically to avoid circular dependencies
    const { uploadWechatMedia, guessWechatMediaType } = await import("./media.ts");

    // Determine media type from file extension
    const mediaType = guessWechatMediaType(filePath);
    
    // Upload to CDN with encryption
    const uploaded = await uploadWechatMedia(runtime, {
      filePath,
      toUserId: target.id,
      mediaType,
    });

    // Build the appropriate item based on media type
    let item: WechatOutboundItem;
    
    const encodedAesKey = encodeWechatMediaAesKey(uploaded.aeskey);
    const rawHexAesKey = uploaded.aeskey.toString("hex");

    if (mediaType === "image") {
      item = {
        type: 2,
        image_item: {
          media: {
            encrypt_query_param: uploaded.downloadEncryptedQueryParam,
            aes_key: encodedAesKey,
            encrypt_type: 1,
          },
          aeskey: rawHexAesKey,
          mid_size: uploaded.fileSizeCiphertext,
          hd_size: uploaded.fileSizeCiphertext,
        },
      } as WechatOutboundItem;
    } else if (mediaType === "video") {
      item = {
        type: 5,
        video_item: {
          media: {
            encrypt_query_param: uploaded.downloadEncryptedQueryParam,
            aes_key: encodedAesKey,
            encrypt_type: 1,
          },
          video_size: uploaded.fileSizeCiphertext,
          video_md5: uploaded.fileMd5,
        },
      } as WechatOutboundItem;
    } else {
      item = {
        type: 4,
        file_item: {
          media: {
            encrypt_query_param: uploaded.downloadEncryptedQueryParam,
            aes_key: encodedAesKey,
            encrypt_type: 1,
          },
          file_name: path.basename(filePath),
          md5: uploaded.fileMd5,
          len: String(uploaded.fileSize),
        },
      } as WechatOutboundItem;
    }

    // Send caption text first if provided
    const caption = opts?.caption;
    if (caption) {
      await sendWechatText(runtime, rawTarget, caption);
    }

    runtime.api.logger.debug(
      `sendWechatMedia: mediaType=${mediaType} to=${target.id} file=${path.basename(filePath)} cipherSize=${uploaded.fileSizeCiphertext} plainSize=${uploaded.fileSize}`,
    );

    // Send the media message
    const req: WechatSendMessageReq = {
      msg: {
        from_user_id: "",
        to_user_id: target.id,
        client_id: generateClientId(),
        message_type: 2, // BOT
        message_state: 2, // FINISH
        item_list: [item],
        context_token: contextToken,
      },
    };

    const result = await sendWechatMessage(runtime, req);
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    runtime.api.logger.error(
      `sendWechatMedia: failed to send ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Weixin does not support inline keyboards in the same way as QQBot.
 * This is a placeholder that sends text with numbered options.
 */
export async function sendWechatKeyboard(
  runtime: WechatAccountRuntime,
  rawTarget: string,
  text: string,
  keyboard: InlineKeyboardMarkup,
  opts?: SendOptions
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  // Convert keyboard to numbered text options
  const lines = [text, ""];
  const buttons = keyboard.inline_keyboard ?? [];
  let optNum = 1;

  for (const row of buttons) {
    for (const btn of row) {
      const label = btn.text ?? `Option ${optNum}`;
      lines.push(`${optNum}. ${label}`);
      optNum++;
    }
  }

  const textWithKeyboard = lines.join("\n");
  return sendWechatText(runtime, rawTarget, textWithKeyboard, opts);
}
