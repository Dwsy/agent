/**
 * WeChat session management: sync buffer persistence, session expiry handling.
 *
 * Ported from @tencent-weixin/openclaw-weixin src/storage/sync-buf.ts and src/api/session-guard.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { WechatAccountRuntime } from "./types.ts";
import { logger } from "./logger.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_EXPIRED_ERRCODE = -14;
const SESSION_PAUSE_DURATION_MS = 8 * 60 * 1000; // 8 minutes

// ---------------------------------------------------------------------------
// State Directory
// ---------------------------------------------------------------------------

function resolveStateDir(): string {
  const envDir = process.env.PI_STATE_DIR?.trim();
  if (envDir) return envDir;
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(homeDir, ".pi", "state");
}

function resolveSyncDir(accountId: string): string {
  return path.join(resolveStateDir(), "wechat", normalizeId(accountId));
}

function normalizeId(accountId: string): string {
  return accountId.replace(/[@.]/g, "-");
}

// ---------------------------------------------------------------------------
// Sync Buffer Persistence (get_updates_buf)
// ---------------------------------------------------------------------------

export interface SyncBufData {
  get_updates_buf: string;
  savedAt: number;
}

/**
 * Get the file path for sync buffer storage.
 */
export function getSyncBufPath(accountId: string): string {
  return path.join(resolveSyncDir(accountId), "sync-buf.json");
}

/**
 * Load the sync buffer from disk.
 * Returns null if not found or invalid.
 */
export function loadSyncBuf(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as SyncBufData;

    if (typeof data.get_updates_buf === "string" && data.get_updates_buf.length > 0) {
      logger.debug(`[wechat:sync] loaded sync buf (${data.get_updates_buf.length} chars, saved at ${new Date(data.savedAt).toISOString()})`);
      return data.get_updates_buf;
    }

    return null;
  } catch (err) {
    logger.warn(`[wechat:sync] failed to load sync buf: ${String(err)}`);
    return null;
  }
}

/**
 * Save the sync buffer to disk.
 */
export function saveSyncBuf(filePath: string, buf: string): void {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const data: SyncBufData = {
      get_updates_buf: buf,
      savedAt: Date.now(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    logger.debug(`[wechat:sync] saved sync buf (${buf.length} chars)`);
  } catch (err) {
    logger.error(`[wechat:sync] failed to save sync buf: ${String(err)}`);
  }
}

/**
 * Initialize sync buffer for an account runtime.
 * Loads from disk if available, otherwise starts fresh.
 */
export function initSyncBuf(runtime: WechatAccountRuntime): void {
  const syncBufPath = getSyncBufPath(runtime.accountId);
  const loaded = loadSyncBuf(syncBufPath);

  runtime.syncBufPath = syncBufPath;
  runtime.syncBuf = loaded ?? "";

  if (loaded) {
    logger.info(`[wechat:sync] resumed from previous sync buf (${loaded.length} chars)`);
  } else {
    logger.info(`[wechat:sync] starting fresh (no previous sync buf)`);
  }
}

/**
 * Update sync buffer after receiving new messages.
 */
export function updateSyncBuf(runtime: WechatAccountRuntime, newBuf: string): void {
  if (newBuf && newBuf !== runtime.syncBuf) {
    runtime.syncBuf = newBuf;
    saveSyncBuf(runtime.syncBufPath, newBuf);
  }
}

// ---------------------------------------------------------------------------
// Session Expiry Handling (errcode -14)
// ---------------------------------------------------------------------------

const sessionPauseStore = new Map<string, number>(); // accountId -> pauseUntil timestamp

/**
 * Pause a session due to expiry (errcode -14).
 * The session will be paused for 8 minutes.
 */
export function pauseSession(accountId: string): void {
  const pauseUntil = Date.now() + SESSION_PAUSE_DURATION_MS;
  sessionPauseStore.set(normalizeId(accountId), pauseUntil);

  logger.warn(
    `[wechat:session] session expired for accountId=${accountId}, pausing for ${Math.ceil(SESSION_PAUSE_DURATION_MS / 60_000)} minutes`
  );
}

/**
 * Check if a session is currently paused.
 */
export function isSessionPaused(accountId: string): boolean {
  const key = normalizeId(accountId);
  const pauseUntil = sessionPauseStore.get(key);

  if (!pauseUntil) return false;

  if (Date.now() >= pauseUntil) {
    sessionPauseStore.delete(key);
    logger.info(`[wechat:session] session pause ended for accountId=${accountId}`);
    return false;
  }

  return true;
}

/**
 * Get remaining pause time in milliseconds.
 */
export function getRemainingPauseMs(accountId: string): number {
  const key = normalizeId(accountId);
  const pauseUntil = sessionPauseStore.get(key);

  if (!pauseUntil) return 0;

  const remaining = pauseUntil - Date.now();
  return Math.max(0, remaining);
}

/**
 * Resume a paused session immediately.
 */
export function resumeSession(accountId: string): void {
  const key = normalizeId(accountId);
  sessionPauseStore.delete(key);
  logger.info(`[wechat:session] session resumed for accountId=${accountId}`);
}

// ---------------------------------------------------------------------------
// Session State for Account Runtime
// ---------------------------------------------------------------------------

/**
 * Check session state before making API calls.
 * Returns true if the session is active, false if paused.
 */
export function checkSessionActive(runtime: WechatAccountRuntime): boolean {
  if (isSessionPaused(runtime.accountId)) {
    const remaining = getRemainingPauseMs(runtime.accountId);
    logger.debug(
      `[wechat:session] session paused for accountId=${runtime.accountId}, ${Math.ceil(remaining / 1000)}s remaining`
    );
    return false;
  }
  return true;
}

/**
 * Handle session expiry from API response.
 * Returns true if the error indicates session expiry.
 */
export function handleSessionExpiry(accountId: string, errcode?: number, ret?: number): boolean {
  if (errcode === SESSION_EXPIRED_ERRCODE || ret === SESSION_EXPIRED_ERRCODE) {
    pauseSession(accountId);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Deduplication (message ID cache)
// ---------------------------------------------------------------------------

const DEDUP_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_MAX_SIZE = 1000;

/**
 * Check if a message ID is a duplicate.
 * Also cleans up expired entries.
 */
export function isDuplicate(runtime: WechatAccountRuntime, messageId: string): boolean {
  const now = Date.now();

  // Cleanup expired entries
  for (const [key, ts] of runtime.dedup) {
    if (now - ts > DEDUP_TTL_MS) {
      runtime.dedup.delete(key);
    }
  }

  // Enforce max size
  while (runtime.dedup.size > DEDUP_MAX_SIZE) {
    const first = runtime.dedup.keys().next().value;
    if (!first) break;
    runtime.dedup.delete(first);
  }

  // Check for duplicate
  if (runtime.dedup.has(messageId)) {
    return true;
  }

  // Record this message
  runtime.dedup.set(messageId, now);
  return false;
}

/**
 * Clear deduplication cache.
 */
export function clearDedup(runtime: WechatAccountRuntime): void {
  runtime.dedup.clear();
  logger.debug(`[wechat:dedup] cleared dedup cache for accountId=${runtime.accountId}`);
}
