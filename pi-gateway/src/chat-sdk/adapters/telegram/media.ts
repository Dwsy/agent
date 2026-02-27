/**
 * Telegram media handling — download, send, parse directives, detect kind.
 *
 * Ported from legacy media-send.ts / media-download.ts, adapted for chat-sdk patterns.
 * Self-contained: no imports from legacy telegram plugin.
 */

import type { MediaItem, TelegramRawMessage } from "./types.ts";

// ── Extension sets for media type detection ──

export const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
export const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "m4a", "flac", "aiff", "aac", "opus", "wma"]);
export const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi"]);
export const STICKER_EXTS = new Set(["tgs", "webm_sticker"]);

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

// ── Helpers ──

function inferMime(filePath?: string, headerMime?: string | null): string {
  const cleaned = headerMime?.split(";")[0]?.trim();
  if (cleaned && cleaned !== "application/octet-stream") return cleaned;
  const ext = filePath?.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? cleaned ?? "application/octet-stream";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// ── Download ──

export interface TelegramFileDownload {
  data: string; // base64
  mimeType: string;
  filePath?: string;
}

/**
 * Download a file from Telegram by file_id.
 * Returns base64 data + mimeType, or null on failure.
 */
export async function downloadTelegramFile(params: {
  token: string;
  fileId: string;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}): Promise<TelegramFileDownload | null> {
  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const maxBytes = params.maxBytes ?? 10 * 1024 * 1024;

  try {
    const infoRes = await fetcher(
      `https://api.telegram.org/bot${params.token}/getFile?file_id=${encodeURIComponent(params.fileId)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!infoRes.ok) return null;
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) return null;

    const url = `https://api.telegram.org/file/bot${params.token}/${info.result.file_path}`;
    const fileRes = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!fileRes.ok) return null;

    const arrayBuffer = await fileRes.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) return null;

    const mimeType = inferMime(info.result.file_path, fileRes.headers.get("content-type"));
    const data = Buffer.from(arrayBuffer).toString("base64");

    return { data, mimeType, filePath: info.result.file_path };
  } catch {
    return null;
  }
}

// ── Media kind detection ──

/**
 * Determine media kind from file extension or path.
 */
export function detectMediaKind(filePath: string): "photo" | "audio" | "video" | "document" | "sticker" {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return "photo";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (STICKER_EXTS.has(ext)) return "sticker";
  return "document";
}

// ── Media directive parsing ──

/**
 * Parse outbound text for media directives:
 *   [photo] path/url | caption
 *   [audio] path/url | caption
 *   [video] path/url | caption
 *   [sticker] path/url
 *   MEDIA:path/url
 *
 * Returns cleaned text and extracted media items.
 */
export function parseMediaDirectives(text: string): { cleanText: string; media: MediaItem[] } {
  const lines = text.split("\n");
  const media: MediaItem[] = [];
  const remain: string[] = [];

  const directiveRe = /^\s*\[(photo|audio|video|sticker|document)\]\s+(.+?)(?:\s*\|\s*(.+))?\s*$/i;
  const mediaRe = /^\s*MEDIA:(.+)$/;

  for (const line of lines) {
    const match = line.match(directiveRe);
    if (match) {
      const kind = match[1]!.toLowerCase() as MediaItem["kind"];
      media.push({
        kind,
        source: match[2]!.trim(),
        caption: match[3]?.trim(),
      });
      continue;
    }

    const mediaMatch = line.match(mediaRe);
    if (mediaMatch) {
      const source = mediaMatch[1]!.trim();
      media.push({ kind: detectMediaKind(source), source });
      continue;
    }

    remain.push(line);
  }

  return { cleanText: remain.join("\n").trim(), media };
}

// ── HTTP API fallback for sending media ──

/**
 * Send media via Telegram HTTP API (FormData).
 * Used as fallback when grammy sendPhoto/sendAudio fails.
 */
export async function sendMediaViaHttpApi(params: {
  token: string;
  chatId: string;
  kind: "photo" | "audio" | "video" | "document";
  source: string;
  caption?: string;
  threadId?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const methodMap: Record<string, string> = {
    photo: "sendPhoto",
    audio: "sendAudio",
    video: "sendVideo",
    document: "sendDocument",
  };
  const fieldMap: Record<string, string> = {
    photo: "photo",
    audio: "audio",
    video: "video",
    document: "document",
  };

  const method = methodMap[params.kind] ?? "sendDocument";
  const field = fieldMap[params.kind] ?? "document";

  const form = new FormData();
  form.set("chat_id", params.chatId);
  if (params.threadId) form.set("message_thread_id", String(params.threadId));
  if (params.caption?.trim()) {
    form.set("caption", params.caption.trim());
  }

  if (isHttpUrl(params.source)) {
    form.set(field, params.source);
  } else {
    // Local file — read and attach
    try {
      const file = Bun.file(params.source);
      const name = params.source.split("/").pop() ?? "file";
      form.set(field, file, name);
    } catch {
      return { ok: false, error: `Failed to read local file: ${params.source}` };
    }
  }

  try {
    const res = await fetcher(`https://api.telegram.org/bot${params.token}/${method}`, {
      method: "POST",
      body: form,
    });
    const body = await res.json() as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!body.ok) {
      return { ok: false, error: body.description ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: body.result?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
