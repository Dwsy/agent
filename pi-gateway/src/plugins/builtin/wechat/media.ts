import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { WechatAccountRuntime, WechatUploadedFile } from "./types.ts";

/**
 * CDN upload endpoint path.
 */
const CDN_UPLOAD_PATH = "/cgi-bin/mmwebwx-bin/webwxupload";

/**
 * Upload media type constants (from ilink API).
 */
const UploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;

/**
 * Compute AES-128-ECB ciphertext size (PKCS7 padding to 16-byte boundary).
 */
function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

/**
 * Encrypt buffer with AES-128-ECB (PKCS7 padding is default).
 */
function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

/**
 * Decrypt buffer with AES-128-ECB (PKCS7 padding).
 */
function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Generate a random file key (32 hex chars = 16 bytes).
 */
function generateFileKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate a random AES-128 key (16 bytes).
 */
function generateAesKey(): Buffer {
  return crypto.randomBytes(16);
}

/**
 * GetUploadUrl API request.
 */
interface GetUploadUrlReq {
  filekey?: string;
  media_type?: number;
  to_user_id?: string;
  rawsize?: number;
  rawfilemd5?: string;
  filesize?: number;
  no_need_thumb?: boolean;
  aeskey?: string;
}

/**
 * GetUploadUrl API response.
 */
interface GetUploadUrlResp {
  upload_param?: string;
  thumb_upload_param?: string;
}

/**
 * Call ilink getUploadUrl API to get CDN upload parameters.
 */
async function getUploadUrl(
  runtime: WechatAccountRuntime,
  req: GetUploadUrlReq
): Promise<GetUploadUrlResp> {
  // Use the exported API function
  const { getWechatUploadUrl } = await import("./api.ts");
  
  const result = await getWechatUploadUrl(runtime, {
    filekey: req.filekey ?? "",
    media_type: req.media_type ?? 1,
    to_user_id: req.to_user_id ?? "",
    rawsize: req.rawsize ?? 0,
    rawfilemd5: req.rawfilemd5 ?? "",
    filesize: req.filesize ?? 0,
    no_need_thumb: req.no_need_thumb,
    aeskey: req.aeskey ?? "",
  });

  return {
    upload_param: result.uploadParam,
    thumb_upload_param: result.thumbUploadParam,
  };
}

/**
 * Upload encrypted buffer to CDN.
 * Returns the download encrypted query param for sendMessage.
 */
async function uploadBufferToCdn(
  runtime: WechatAccountRuntime,
  params: {
    buf: Buffer;
    uploadParam: string;
    filekey: string;
    cdnBaseUrl: string;
    aeskey: Buffer;
    label: string;
  }
): Promise<{ downloadParam: string }> {
  const { buf, uploadParam, filekey, cdnBaseUrl, aeskey, label } = params;

  // Encrypt the buffer with AES-128-ECB
  const encrypted = encryptAesEcb(buf, aeskey);

  // Parse uploadParam to get CDN URL
  // uploadParam format: typically contains signature, auth info
  const uploadUrl = `${cdnBaseUrl}${CDN_UPLOAD_PATH}?${uploadParam}`;

  runtime.api.logger.debug(
    `${label}: uploading ${encrypted.length} encrypted bytes to CDN`
  );

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(encrypted.length),
    },
    body: encrypted,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label}: CDN upload failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const resp = (await res.json()) as { downloadParam?: string };
  if (!resp.downloadParam) {
    throw new Error(`${label}: CDN upload response missing downloadParam`);
  }

  return { downloadParam: resp.downloadParam };
}

/**
 * Download a remote media URL to a local temp file.
 */

/**
 * Download a remote media URL to a local temp file.
 */
export async function downloadRemoteMediaToTemp(
  url: string,
  destDir: string
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Remote media download failed: ${res.status} ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(destDir, { recursive: true });

  // Infer extension from Content-Type or URL
  const contentType = res.headers.get("content-type") || "";
  let ext = "bin";
  if (contentType.includes("image/png")) ext = "png";
  else if (contentType.includes("image/jpeg")) ext = "jpg";
  else if (contentType.includes("image/gif")) ext = "gif";
  else if (contentType.includes("video/mp4")) ext = "mp4";
  else {
    const urlExt = url.split(".").pop()?.split("?")[0];
    if (urlExt && urlExt.length <= 4) ext = urlExt;
  }

  const fileName = `wechat-media-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = path.join(destDir, fileName);
  await fs.writeFile(filePath, buf);

  return filePath;
}

/**
 * Upload a local file to Weixin CDN with AES-128-ECB encryption.
 * Returns file info for sendMessage.
 */
async function uploadMediaToCdn(
  runtime: WechatAccountRuntime,
  params: {
    filePath: string;
    toUserId: string;
    mediaType: (typeof UploadMediaType)[keyof typeof UploadMediaType];
    label: string;
  }
): Promise<WechatUploadedFile> {
  const { filePath, toUserId, mediaType, label } = params;

  // Read file
  const plaintext = await fs.readFile(filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = generateFileKey();
  const aeskey = generateAesKey();

  runtime.api.logger.debug(
    `${label}: file=${filePath} rawsize=${rawsize} filesize=${filesize} md5=${rawfilemd5}`
  );

  // Get upload URL from ilink API
  const uploadUrlResp = await getUploadUrl(runtime, {
    filekey,
    media_type: mediaType,
    to_user_id: toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    no_need_thumb: true,
    aeskey: aeskey.toString("hex"),
  });

  const uploadParam = uploadUrlResp.upload_param;
  if (!uploadParam) {
    throw new Error(`${label}: getUploadUrl returned no upload_param`);
  }

  // Upload encrypted buffer to CDN
  const { downloadParam } = await uploadBufferToCdn(runtime, {
    buf: plaintext,
    uploadParam,
    filekey,
    cdnBaseUrl: runtime.cdnBaseUrl,
    aeskey,
    label,
  });

  return {
    filekey,
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
    aeskey,
    downloadEncryptedQueryParam: downloadParam,
  };
}

/**
 * Upload an image file to Weixin CDN.
 */
export async function uploadWechatImage(
  runtime: WechatAccountRuntime,
  filePath: string,
  toUserId: string
): Promise<WechatUploadedFile> {
  return uploadMediaToCdn(runtime, {
    filePath,
    toUserId,
    mediaType: UploadMediaType.IMAGE,
    label: "uploadWechatImage",
  });
}

/**
 * Upload a video file to Weixin CDN.
 */
export async function uploadWechatVideo(
  runtime: WechatAccountRuntime,
  filePath: string,
  toUserId: string
): Promise<WechatUploadedFile> {
  return uploadMediaToCdn(runtime, {
    filePath,
    toUserId,
    mediaType: UploadMediaType.VIDEO,
    label: "uploadWechatVideo",
  });
}

/**
 * Upload a file attachment to Weixin CDN.
 */
export async function uploadWechatFile(
  runtime: WechatAccountRuntime,
  filePath: string,
  toUserId: string
): Promise<WechatUploadedFile> {
  return uploadMediaToCdn(runtime, {
    filePath,
    toUserId,
    mediaType: UploadMediaType.FILE,
    label: "uploadWechatFile",
  });
}

/**
 * Upload a media file to Weixin CDN, automatically detecting the type.
 */
export async function uploadWechatMedia(
  runtime: WechatAccountRuntime,
  params: {
    filePath: string;
    toUserId: string;
    mediaType: "image" | "video" | "file";
  }
): Promise<WechatUploadedFile> {
  const { filePath, toUserId, mediaType } = params;

  switch (mediaType) {
    case "image":
      return uploadWechatImage(runtime, filePath, toUserId);
    case "video":
      return uploadWechatVideo(runtime, filePath, toUserId);
    default:
      return uploadWechatFile(runtime, filePath, toUserId);
  }
}

/**
 * Download and decrypt media from Weixin CDN.
 */
export async function downloadWechatMedia(
  runtime: WechatAccountRuntime,
  encryptQueryParam: string,
  aesKeyHex: string,
  destDir: string
): Promise<string> {
  const cdnUrl = `${runtime.cdnBaseUrl}${CDN_UPLOAD_PATH}?${encryptQueryParam}`;

  runtime.api.logger.debug(`downloadWechatMedia: fetching from CDN`);

  const res = await fetch(cdnUrl);
  if (!res.ok) {
    throw new Error(`CDN download failed: ${res.status} ${res.statusText}`);
  }

  const encrypted = Buffer.from(await res.arrayBuffer());
  const aeskey = Buffer.from(aesKeyHex, "hex");

  // Decrypt with AES-128-ECB
  const decrypted = decryptAesEcb(encrypted, aeskey);

  // Save to temp file
  await fs.mkdir(destDir, { recursive: true });
  const fileName = `wechat-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filePath = path.join(destDir, fileName);
  await fs.writeFile(filePath, decrypted);

  runtime.api.logger.debug(`downloadWechatMedia: saved to ${filePath}`);

  return filePath;
}

/**
 * Guess media type from file extension.
 */
export function guessWechatMediaType(
  filePath: string
): "image" | "video" | "file" {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "file";
}
