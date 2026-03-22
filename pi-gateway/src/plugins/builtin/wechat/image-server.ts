/**
 * WeChat image server — local image storage + HTTP serving via pi-gateway routes.
 *
 * Stores locally generated images (AI-generated, screenshots, etc.) and serves
 * them via the pi-gateway HTTP server so the WeChat CDN upload can reference them.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { GatewayPluginApi } from "../../types.ts";

export interface WechatImageServerConfig {
  storageDir: string;
  /** Path prefix for HTTP routes (default: /wechat/img) */
  routePrefix?: string;
  /** TTL in seconds, 0 = never expire (default: 3600) */
  ttlSeconds?: number;
}

interface StoredImage {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: number;
  ttl: number;
}

const DEFAULT_CONFIG: Required<WechatImageServerConfig> = {
  storageDir: "",
  routePrefix: "/wechat/img",
  ttlSeconds: 3600,
};

let imageIndex = new Map<string, StoredImage>();
let currentConfig: Required<WechatImageServerConfig> | null = null;
let apiRef: GatewayPluginApi | null = null;

function generateImageId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function resolveStorageDir(): string {
  if (currentConfig?.storageDir) return currentConfig.storageDir;
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(home, ".pi", "state", "wechat", "images");
}

function resolveIndexPath(): string {
  return path.join(resolveStorageDir(), ".index.json");
}

function loadIndex(): void {
  try {
    const idxPath = resolveIndexPath();
    if (fs.existsSync(idxPath)) {
      const data = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
      imageIndex = new Map(Object.entries(data));
    }
  } catch {
    imageIndex = new Map();
  }
}

function saveIndex(): void {
  try {
    const idxPath = resolveIndexPath();
    fs.mkdirSync(path.dirname(idxPath), { recursive: true });
    fs.writeFileSync(idxPath, JSON.stringify(Object.fromEntries(imageIndex), null, 2), "utf-8");
  } catch {
    // ignore
  }
}

function cleanupExpired(): void {
  const now = Date.now();
  const expired: string[] = [];
  for (const [id, img] of imageIndex) {
    if (img.ttl > 0 && now - img.createdAt > img.ttl * 1000) {
      expired.push(id);
    }
  }
  for (const id of expired) {
    const img = imageIndex.get(id);
    if (img) {
      try {
        const fp = path.join(resolveStorageDir(), img.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch { /* ignore */ }
      imageIndex.delete(id);
    }
  }
  if (expired.length) saveIndex();
}

/**
 * Initialize the image server, register HTTP routes via the pi-gateway API.
 */
export function initWechatImageServer(api: GatewayPluginApi, config?: Partial<WechatImageServerConfig>): void {
  currentConfig = { ...DEFAULT_CONFIG, ...config } as Required<WechatImageServerConfig>;
  if (!currentConfig.storageDir) {
    currentConfig.storageDir = resolveStorageDir();
  }
  apiRef = api;

  // Ensure storage dir
  if (!fs.existsSync(currentConfig.storageDir)) {
    fs.mkdirSync(currentConfig.storageDir, { recursive: true });
  }

  loadIndex();

  // Periodic cleanup
  setInterval(cleanupExpired, 60_000);

  // Register GET route for serving images
  const prefix = currentConfig.routePrefix;
  api.registerHttpRoute("GET", `${prefix}/:id`, async (req) => {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // segments: ['', 'wechat', 'img', '<id>']  or ['', 'wechat', 'img', '<id>', '<ext>']
    const id = segments[segments.length - 1] ?? "";
    const img = imageIndex.get(id);
    if (!img) {
      return new Response("Not Found", { status: 404 });
    }
    if (img.ttl > 0 && Date.now() - img.createdAt > img.ttl * 1000) {
      return new Response("Gone", { status: 410 });
    }
    const fp = path.join(currentConfig!.storageDir, img.filename);
    if (!fs.existsSync(fp)) {
      return new Response("File Not Found", { status: 404 });
    }
    const data = fs.readFileSync(fp);
    return new Response(data, {
      headers: {
        "Content-Type": img.mimeType,
        "Content-Length": String(data.length),
        "Cache-Control": img.ttl > 0 ? `max-age=${img.ttl}` : "max-age=31536000",
      },
    });
  });

  api.logger.debug(`[wechat:image-server] registered route ${currentConfig.routePrefix}/:id`);
}

/**
 * Save image data and return the local HTTP URL.
 */
export function saveWechatImage(
  imageData: Buffer | Uint8Array,
  mimeType = "image/png",
  ttlSeconds?: number
): string {
  const id = generateImageId();
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const filename = `${id}.${ext}`;
  const dir = resolveStorageDir();
  const fp = path.join(dir, filename);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, Buffer.from(imageData));

  const img: StoredImage = {
    id,
    filename,
    mimeType,
    createdAt: Date.now(),
    ttl: ttlSeconds ?? currentConfig?.ttlSeconds ?? 3600,
  };
  imageIndex.set(id, img);
  saveIndex();

  return `${currentConfig?.routePrefix ?? "/wechat/img"}/${id}`;
}

/**
 * Save image from a local file path.
 */
export function saveWechatImageFromPath(filePath: string, ttlSeconds?: number): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return saveWechatImage(data, mimeType, ttlSeconds);
  } catch {
    return null;
  }
}
