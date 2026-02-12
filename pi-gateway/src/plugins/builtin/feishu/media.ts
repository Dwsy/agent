/**
 * Feishu media: inbound download + outbound upload/send.
 */
import type * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuChannelConfig } from "./types.ts";
import { createFeishuClient } from "./client.ts";
import { resolveReceiveIdType } from "./send.ts";
import { Readable } from "stream";
import * as fs from "fs";
import * as path from "path";

// ── MIME detection ─────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", opus: "audio/opus",
  mp4: "video/mp4", mov: "video/quicktime",
  pdf: "application/pdf", doc: "application/msword",
  xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
};

export function inferMimeType(fileName?: string): string {
  if (!fileName) return "application/octet-stream";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

// ── Inbound: download media from message ───────────────────────────────────

/**
 * Parse media keys from message content based on type.
 */
export function parseMediaKeys(content: string, messageType: string): {
  imageKey?: string;
  fileKey?: string;
  fileName?: string;
} {
  try {
    const parsed = JSON.parse(content);
    switch (messageType) {
      case "image": return { imageKey: parsed.image_key };
      case "file": return { fileKey: parsed.file_key, fileName: parsed.file_name };
      case "audio": return { fileKey: parsed.file_key };
      case "video": return { fileKey: parsed.file_key, imageKey: parsed.image_key };
      case "sticker": return { fileKey: parsed.file_key };
      default: return {};
    }
  } catch { return {}; }
}

/**
 * Download a message resource (image/file) from Feishu.
 * Returns base64-encoded data + mimeType for InboundMessage.images.
 */
export async function downloadFeishuMedia(params: {
  client: Lark.Client;
  messageId: string;
  fileKey: string;
  type: "image" | "file";
  maxBytes: number;
}): Promise<{ data: string; mimeType: string } | null> {
  const { client, messageId, fileKey, type, maxBytes } = params;

  try {
    const response = await client.im.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type },
    });

    const buffer = await responseToBuffer(response);
    if (!buffer || buffer.byteLength > maxBytes) return null;

    const mimeType = inferMimeType(fileKey);
    const data = Buffer.from(buffer).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

/**
 * Resolve all media from a Feishu message event.
 * Returns array of { data (base64), mimeType } for images.
 */
export async function resolveInboundMedia(params: {
  client: Lark.Client;
  messageId: string;
  messageType: string;
  content: string;
  maxBytes: number;
}): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
  const { client, messageId, messageType, content, maxBytes } = params;
  const mediaTypes = ["image", "file", "audio", "video", "sticker"];
  if (!mediaTypes.includes(messageType)) return [];

  const keys = parseMediaKeys(content, messageType);
  const fileKey = keys.imageKey || keys.fileKey;
  if (!fileKey) return [];

  const resourceType = messageType === "image" ? "image" : "file";
  const result = await downloadFeishuMedia({ client, messageId, fileKey, type: resourceType, maxBytes });
  if (!result) return [];

  // Only return as image if it's an image MIME type
  if (isImageMime(result.mimeType)) {
    return [{ type: "image", data: result.data, mimeType: result.mimeType }];
  }
  return [];
}

// ── Outbound: upload + send media ──────────────────────────────────────────

/**
 * Upload an image to Feishu and get an image_key.
 */
export async function uploadFeishuImage(params: {
  client: Lark.Client;
  image: Buffer | string;
}): Promise<string> {
  const { client, image } = params;
  const stream = typeof image === "string" ? fs.createReadStream(image) : Readable.from(image);

  const response = await client.im.image.create({
    data: { image_type: "message", image: stream as any },
  });
  const res = response as any;
  if (res.code !== undefined && res.code !== 0) {
    throw new Error(`Feishu image upload failed: ${res.msg || `code ${res.code}`}`);
  }
  const imageKey = res.image_key ?? res.data?.image_key;
  if (!imageKey) throw new Error("Feishu image upload: no image_key returned");
  return imageKey;
}

/**
 * Upload a file to Feishu and get a file_key.
 */
export async function uploadFeishuFile(params: {
  client: Lark.Client;
  file: Buffer | string;
  fileName: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
}): Promise<string> {
  const { client, file, fileName, fileType } = params;
  const stream = typeof file === "string" ? fs.createReadStream(file) : Readable.from(file);

  const response = await client.im.file.create({
    data: { file_type: fileType, file_name: fileName, file: stream as any },
  });
  const res = response as any;
  if (res.code !== undefined && res.code !== 0) {
    throw new Error(`Feishu file upload failed: ${res.msg || `code ${res.code}`}`);
  }
  const fileKey = res.file_key ?? res.data?.file_key;
  if (!fileKey) throw new Error("Feishu file upload: no file_key returned");
  return fileKey;
}

/**
 * Detect Feishu file type from extension.
 */
export function detectFileType(fileName: string): "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream" {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt"> = {
    ".opus": "opus", ".ogg": "opus",
    ".mp4": "mp4", ".mov": "mp4", ".avi": "mp4",
    ".pdf": "pdf",
    ".doc": "doc", ".docx": "doc",
    ".xls": "xls", ".xlsx": "xls",
    ".ppt": "ppt", ".pptx": "ppt",
  };
  return map[ext] ?? "stream";
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".ico", ".tiff"]);

/**
 * Send a media file (image or document) to a Feishu target.
 * Auto-detects type from file extension.
 */
export async function sendFeishuMedia(params: {
  client: Lark.Client;
  to: string;
  filePath: string;
  caption?: string;
}): Promise<{ messageId: string }> {
  const { client, to, filePath, caption } = params;
  const ext = path.extname(filePath).toLowerCase();
  const receiveIdType = resolveReceiveIdType(to);

  if (IMAGE_EXTS.has(ext)) {
    const imageKey = await uploadFeishuImage({ client, image: filePath });
    const content = JSON.stringify({ image_key: imageKey });
    const response = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: { receive_id: to, content, msg_type: "image" },
    });
    if (response.code !== 0) throw new Error(`Feishu image send failed: ${response.msg}`);

    // Send caption as separate text if provided
    if (caption?.trim()) {
      await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: to,
          content: JSON.stringify({ zh_cn: { content: [[{ tag: "md", text: caption }]] } }),
          msg_type: "post",
        },
      });
    }
    return { messageId: response.data?.message_id ?? "unknown" };
  }

  // Non-image file
  const fileName = path.basename(filePath);
  const fileType = detectFileType(fileName);
  const fileKey = await uploadFeishuFile({ client, file: filePath, fileName, fileType });
  const content = JSON.stringify({ file_key: fileKey });
  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: "file" },
  });
  if (response.code !== 0) throw new Error(`Feishu file send failed: ${response.msg}`);
  return { messageId: response.data?.message_id ?? "unknown" };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert various Lark SDK response formats to Buffer.
 */
async function responseToBuffer(response: unknown): Promise<Buffer | null> {
  const r = response as any;
  if (Buffer.isBuffer(response)) return response;
  if (response instanceof ArrayBuffer) return Buffer.from(response);
  if (r?.data && Buffer.isBuffer(r.data)) return r.data;
  if (r?.data instanceof ArrayBuffer) return Buffer.from(r.data);
  if (typeof r?.getReadableStream === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of r.getReadableStream()) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof r?.[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of r) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return null;
}
