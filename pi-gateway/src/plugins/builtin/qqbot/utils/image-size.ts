/**
 * 图片尺寸工具
 *
 * 从 PNG/JPEG 文件头解析图片宽高，无需完整加载文件。
 */
import { readFileSync } from "node:fs";

export interface ImageSize {
  width: number;
  height: number;
}

export const DEFAULT_IMAGE_SIZE: ImageSize = { width: 512, height: 512 };

function parsePngSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function parseJpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let offset = 2;
  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xFF) { offset++; continue; }
    const marker = buf[offset + 1];
    // SOF0/SOF1/SOF2 markers
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

/**
 * 从本地图片文件获取宽高
 */
export function getImageSize(filePath: string): Promise<ImageSize> {
  return new Promise((resolve) => {
    try {
      const buf = readFileSync(filePath);
      const png = parsePngSize(buf);
      if (png) return resolve(png);
      const jpeg = parseJpegSize(buf);
      if (jpeg) return resolve(jpeg);
      resolve(DEFAULT_IMAGE_SIZE);
    } catch {
      resolve(DEFAULT_IMAGE_SIZE);
    }
  });
}

/**
 * 判断图片尺寸是否已知
 */
export function hasQQBotImageSize(url: string): boolean {
  return url.includes("#") && (url.includes("px") || /\d+x\d+/.test(url));
}

/**
 * 格式化 QQBot markdown 图片 URL，附加尺寸信息
 * QQBot markdown 图片格式: ![#宽px #高px](url)
 */
export function formatQQBotMarkdownImage(url: string, width?: number, height?: number): string {
  if (hasQQBotImageSize(url)) return url;
  if (width && height) return `${url}#${width}px #${height}px`;
  if (width) return `${url}#${width}px`;
  return url;
}
