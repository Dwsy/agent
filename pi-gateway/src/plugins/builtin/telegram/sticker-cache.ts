/**
 * Sticker Cache — persist sticker metadata to avoid re-downloading.
 *
 * Cache file: {dataDir}/cache/sticker-cache.json
 * Keyed by file_unique_id (stable across bots, unlike file_id).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_DATA_DIR = join(homedir(), ".pi", "gateway");

export interface CachedSticker {
  fileId: string;
  fileUniqueId: string;
  emoji?: string;
  setName?: string;
  /** Absolute path to the saved sticker file on disk. */
  filePath?: string;
  /** Content type (image/webp, etc.). */
  contentType?: string;
  /** Whether this is a thumbnail (for animated/video stickers). */
  isThumbnail?: boolean;
  cachedAt: string;
  receivedFrom?: string;
}

export interface StickerCacheOptions {
  dataDir?: string;
}

type CacheData = Record<string, CachedSticker>;

let memoryCache: CacheData | null = null;
let cacheDataDir: string = DEFAULT_DATA_DIR;

function getCachePath(dataDir?: string): string {
  const base = dataDir ?? cacheDataDir;
  return join(base, "cache", "sticker-cache.json");
}

function loadCache(dataDir?: string): CacheData {
  if (memoryCache) return memoryCache;

  const path = getCachePath(dataDir);
  if (!existsSync(path)) {
    memoryCache = {};
    return memoryCache;
  }

  try {
    const raw = readFileSync(path, "utf-8");
    memoryCache = JSON.parse(raw) as CacheData;
    return memoryCache;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

function saveCache(dataDir?: string): void {
  if (!memoryCache) return;

  const path = getCachePath(dataDir);
  const dir = join(dataDir ?? cacheDataDir, "cache");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(memoryCache, null, 2));
}

/**
 * Initialize the sticker cache with a custom data directory.
 */
export function initStickerCache(dataDir: string): void {
  cacheDataDir = dataDir;
  memoryCache = null; // force reload on next access
}

/**
 * Look up a cached sticker by its stable file_unique_id.
 */
export function getCachedSticker(fileUniqueId: string, opts?: StickerCacheOptions): CachedSticker | null {
  const cache = loadCache(opts?.dataDir);
  return cache[fileUniqueId] ?? null;
}

/**
 * Store or update a sticker in the cache.
 */
export function cacheSticker(entry: CachedSticker, opts?: StickerCacheOptions): void {
  const cache = loadCache(opts?.dataDir);
  cache[entry.fileUniqueId] = entry;
  memoryCache = cache;
  saveCache(opts?.dataDir);
}

/**
 * Remove stickers from cache whose files no longer exist on disk.
 * Returns the number of entries pruned.
 */
export function pruneStickerCache(opts?: StickerCacheOptions): number {
  const cache = loadCache(opts?.dataDir);
  let pruned = 0;

  for (const [key, entry] of Object.entries(cache)) {
    if (entry.filePath && !existsSync(entry.filePath)) {
      delete cache[key];
      pruned++;
    }
  }

  if (pruned > 0) {
    memoryCache = cache;
    saveCache(opts?.dataDir);
  }

  return pruned;
}

/**
 * Get cache statistics.
 */
export function getStickerCacheStats(opts?: StickerCacheOptions): {
  totalEntries: number;
  withFile: number;
  thumbnails: number;
} {
  const cache = loadCache(opts?.dataDir);
  const entries = Object.values(cache);
  return {
    totalEntries: entries.length,
    withFile: entries.filter(e => e.filePath && existsSync(e.filePath)).length,
    thumbnails: entries.filter(e => e.isThumbnail).length,
  };
}

/**
 * Clear the entire sticker cache.
 */
export function clearStickerCache(opts?: StickerCacheOptions): number {
  const cache = loadCache(opts?.dataDir);
  const count = Object.keys(cache).length;
  memoryCache = {};
  saveCache(opts?.dataDir);
  return count;
}

/** Reset in-memory cache (for testing). */
export function resetStickerCacheMemory(): void {
  memoryCache = null;
}
