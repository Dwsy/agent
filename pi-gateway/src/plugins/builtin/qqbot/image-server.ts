/**
 * 本地图床 HTTP 服务
 *
 * 通过 pi-gateway 的 registerHttpRoute 注册路由，提供本地图片的安全访问。
 * 不需要独立端口，复用 pi-gateway HTTP 服务器。
 *
 * 路由：
 *   GET  /qqbot/img/:id   → 获取图片
 *   POST /qqbot/img/upload → 上传图片，返回 { id, url }
 */
import type { GatewayPluginApi } from "../../types.ts";
import type { QqbotPluginRuntime } from "./types.ts";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import crypto from "node:crypto";

const STORAGE_DIR = `${homedir()}/.pi/agent/qqbot-images`;

const ALLOWED_FORMATS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

interface ImageEntry {
  id: string;
  filename: string;
  originalName: string;
  createdAt: number;
  ttl: number; // 秒，0=永不过期
}

const imageIndex = new Map<string, ImageEntry>();

function generateImageId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function isPathSafe(requestPath: string, baseDir: string): boolean {
  const normalizedBase = join(baseDir);
  const normalizedPath = join(baseDir, requestPath);
  return normalizedPath.startsWith(normalizedBase + "/") || normalizedPath === normalizedBase;
}

function getMimeType(ext: string): string {
  return ALLOWED_FORMATS[ext.toLowerCase()] ?? "application/octet-stream";
}

function getExtFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot) : "";
}

/** 保存图片到本地存储 */
export function saveLocalImage(
  buffer: Buffer,
  originalName: string,
  ttlSeconds = 3600,
): ImageEntry {
  if (!existsSync(STORAGE_DIR)) {
    import("node:fs").then(({ mkdirSync }) => mkdirSync(STORAGE_DIR, { recursive: true }));
  }

  const id = generateImageId();
  const ext = getExtFromFilename(originalName) || ".bin";
  const safeName = `${id}${ext}`;
  const filePath = join(STORAGE_DIR, safeName);

  import("node:fs").then(({ writeFileSync }) => writeFileSync(filePath, buffer));

  const entry: ImageEntry = {
    id,
    filename: safeName,
    originalName,
    createdAt: Date.now(),
    ttl: ttlSeconds,
  };
  imageIndex.set(id, entry);
  return entry;
}

/** 清理过期图片 */
function cleanupExpiredImages(): void {
  const now = Date.now();
  for (const [id, image] of imageIndex) {
    if (image.ttl > 0 && now - image.createdAt > image.ttl * 1000) {
      imageIndex.delete(id);
      const filePath = join(STORAGE_DIR, image.filename);
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}

/** 注册 HTTP 路由 */
export function registerImageServer(api: GatewayPluginApi, runtime: QqbotPluginRuntime): void {
  const basePath = "/qqbot/img";

  // 定期清理过期图片
  setInterval(cleanupExpiredImages, 60_000);

  // GET /qqbot/img/:id — 获取图片
  api.registerHttpRoute("GET", `${basePath}/:id`, async (req) => {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop() ?? "";

    if (!id || id === ":id") {
      return Response.json({ error: "Missing image id" }, { status: 400 });
    }

    const entry = imageIndex.get(id);
    if (!entry) {
      return Response.json({ error: "Image not found" }, { status: 404 });
    }

    // 检查 TTL 过期
    if (entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl * 1000) {
      imageIndex.delete(id);
      return Response.json({ error: "Image expired" }, { status: 410 });
    }

    const filePath = join(STORAGE_DIR, entry.filename);
    if (!isPathSafe(entry.filename, STORAGE_DIR) || !existsSync(filePath)) {
      return Response.json({ error: "Image file missing" }, { status: 404 });
    }

    const ext = getExtFromFilename(entry.filename);
    const mimeType = getMimeType(ext);
    const body = readFileSync(filePath);

    return new Response(body, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(body.byteLength),
      },
    });
  });

  // POST /qqbot/img/upload — 上传图片
  api.registerHttpRoute("POST", `${basePath}/upload`, async (req) => {
    try {
      const contentType = req.headers.get("content-type") ?? "";
      let buffer: Buffer;
      let filename = "upload.bin";

      if (contentType.includes("multipart/form-data")) {
        // 解析 multipart
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
          return Response.json({ error: "No file in formData" }, { status: 400 });
        }
        buffer = Buffer.from(await file.arrayBuffer());
        filename = file.name;
      } else {
        // 原始二进制
        buffer = Buffer.from(await req.arrayBuffer());
        const disposition = req.headers.get("content-disposition");
        const nameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
        if (nameMatch) filename = nameMatch[1]!;
      }

      const ext = getExtFromFilename(filename);
      if (ext && !ALLOWED_FORMATS[ext.toLowerCase()]) {
        return Response.json({ error: `Format not allowed: ${ext}` }, { status: 415 });
      }

      const reqUrl = new URL(req.url);
      const ttlParam = reqUrl.searchParams.get("ttl");
      const ttl = ttlParam ? Number(ttlParam) : 3600;
      const entry = saveLocalImage(buffer, filename, ttl);

      const baseUrl = runtime.channelCfg.baseUrl ?? reqUrl.origin;
      const imageUrl = `${baseUrl}${basePath}/${entry.id}`;

      return Response.json({
        id: entry.id,
        url: imageUrl,
        originalName: entry.originalName,
        createdAt: entry.createdAt,
      }, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });

  api.logger.info(`QQBot image server registered at ${basePath}`);
}
