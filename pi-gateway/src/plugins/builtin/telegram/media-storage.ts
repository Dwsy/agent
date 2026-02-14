/**
 * Media Storage — persist inbound media files to disk.
 *
 * Layout:
 *   {dataDir}/media/{channel}/{chatId}/{YYYY-MM-DD}/{filename}
 *
 * dataDir defaults to ~/.pi/gateway/
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const DEFAULT_DATA_DIR = join(homedir(), ".pi", "gateway");

export interface SavedMedia {
  /** Absolute path to the saved file. */
  path: string;
  /** Relative path from dataDir (for logging). */
  relativePath: string;
  /** Content type of the saved file. */
  contentType: string;
}

export interface MediaStorageOptions {
  /** Override data directory (default: ~/.pi/gateway). */
  dataDir?: string;
}

/**
 * Resolve the media directory for a given channel, chatId, and date.
 */
export function resolveMediaDir(
  channel: string,
  chatId: string,
  opts?: MediaStorageOptions,
): string {
  const dataDir = opts?.dataDir ?? DEFAULT_DATA_DIR;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(dataDir, "media", channel, chatId, today);
}

/**
 * Save a media buffer to disk, organized by channel/chatId/date.
 */
export function saveMediaBuffer(params: {
  channel: string;
  chatId: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
  dataDir?: string;
}): SavedMedia {
  const { channel, chatId, buffer, contentType, filename, dataDir } = params;
  const dir = resolveMediaDir(channel, chatId, { dataDir });

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = join(dir, safeName);
  writeFileSync(filePath, buffer);

  const base = dataDir ?? DEFAULT_DATA_DIR;
  const relativePath = filePath.slice(base.length + 1);

  return { path: filePath, relativePath, contentType };
}

// ============================================================================
// Cleanup
// ============================================================================

export interface CleanupResult {
  filesRemoved: number;
  bytesFreed: number;
  dirsRemoved: number;
  errors: string[];
}

/**
 * Clean media files older than `maxAgeDays`.
 * Removes empty directories after cleanup.
 */
export function cleanupMedia(opts: {
  maxAgeDays: number;
  channel?: string;
  dryRun?: boolean;
  dataDir?: string;
}): CleanupResult {
  const { maxAgeDays, channel, dryRun = false, dataDir } = opts;
  const base = dataDir ?? DEFAULT_DATA_DIR;
  const mediaRoot = join(base, "media");
  const result: CleanupResult = { filesRemoved: 0, bytesFreed: 0, dirsRemoved: 0, errors: [] };

  if (!existsSync(mediaRoot)) return result;

  const cutoff = Date.now() - maxAgeDays * 86400_000;
  const channels = channel ? [channel] : listDirs(mediaRoot);

  for (const ch of channels) {
    const channelDir = join(mediaRoot, ch);
    if (!existsSync(channelDir)) continue;

    for (const chatId of listDirs(channelDir)) {
      const chatDir = join(channelDir, chatId);

      for (const dateDir of listDirs(chatDir)) {
        const fullDateDir = join(chatDir, dateDir);

        // Parse date from directory name (YYYY-MM-DD)
        const dirDate = Date.parse(dateDir);
        if (isNaN(dirDate)) continue;

        // Skip if directory date is within retention period
        if (dirDate >= cutoff) continue;

        // Remove all files in this date directory
        try {
          const files = readdirSync(fullDateDir);
          for (const file of files) {
            const filePath = join(fullDateDir, file);
            try {
              const stat = statSync(filePath);
              if (stat.isFile()) {
                if (!dryRun) unlinkSync(filePath);
                result.filesRemoved++;
                result.bytesFreed += stat.size;
              }
            } catch (err) {
              result.errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          // Remove empty date directory
          if (!dryRun) {
            try {
              rmdirSync(fullDateDir);
              result.dirsRemoved++;
            } catch { /* not empty, skip */ }
          } else {
            result.dirsRemoved++;
          }
        } catch (err) {
          result.errors.push(`${fullDateDir}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Remove empty chat directory
      if (!dryRun) {
        try { rmdirSync(chatDir); result.dirsRemoved++; } catch { /* not empty */ }
      }
    }

    // Remove empty channel directory
    if (!dryRun) {
      try { rmdirSync(channelDir); result.dirsRemoved++; } catch { /* not empty */ }
    }
  }

  return result;
}

/**
 * Get media storage statistics.
 */
export function getMediaStats(opts?: { channel?: string; dataDir?: string }): {
  totalFiles: number;
  totalBytes: number;
  channels: Record<string, { files: number; bytes: number; chats: number }>;
} {
  const base = opts?.dataDir ?? DEFAULT_DATA_DIR;
  const mediaRoot = join(base, "media");
  const stats: ReturnType<typeof getMediaStats> = {
    totalFiles: 0,
    totalBytes: 0,
    channels: {},
  };

  if (!existsSync(mediaRoot)) return stats;

  const channels = opts?.channel ? [opts.channel] : listDirs(mediaRoot);

  for (const ch of channels) {
    const channelDir = join(mediaRoot, ch);
    if (!existsSync(channelDir)) continue;

    const chStats = { files: 0, bytes: 0, chats: 0 };
    const chatDirs = listDirs(channelDir);
    chStats.chats = chatDirs.length;

    for (const chatId of chatDirs) {
      const chatDir = join(channelDir, chatId);
      for (const dateDir of listDirs(chatDir)) {
        const fullDateDir = join(chatDir, dateDir);
        try {
          for (const file of readdirSync(fullDateDir)) {
            const filePath = join(fullDateDir, file);
            try {
              const stat = statSync(filePath);
              if (stat.isFile()) {
                chStats.files++;
                chStats.bytes += stat.size;
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
    }

    stats.channels[ch] = chStats;
    stats.totalFiles += chStats.files;
    stats.totalBytes += chStats.bytes;
  }

  return stats;
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter(name => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch { return false; }
    });
  } catch { return []; }
}
