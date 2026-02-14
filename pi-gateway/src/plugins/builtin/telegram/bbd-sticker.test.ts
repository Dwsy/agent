/**
 * Sticker support tests — storage, cache, outbound, and cleanup.
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, unlinkSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DATA_DIR = join(import.meta.dir, ".test-sticker-data");

// ============================================================================
// Media Storage
// ============================================================================

describe("media-storage: saveMediaBuffer", () => {
  const { saveMediaBuffer, resolveMediaDir } = require("./media-storage.ts");

  afterAll(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true }); } catch {}
  });

  test("saves file to channel/chatId/date directory", () => {
    const result = saveMediaBuffer({
      channel: "telegram",
      chatId: "123456",
      buffer: Buffer.from("FAKE_WEBP"),
      contentType: "image/webp",
      filename: "sticker-abc123.webp",
      dataDir: TEST_DATA_DIR,
    });

    expect(result.path).toContain("telegram");
    expect(result.path).toContain("123456");
    expect(result.path).toContain("sticker-abc123.webp");
    expect(existsSync(result.path)).toBe(true);
  });

  test("resolveMediaDir includes today's date", () => {
    const dir = resolveMediaDir("telegram", "999", { dataDir: TEST_DATA_DIR });
    const today = new Date().toISOString().slice(0, 10);
    expect(dir).toContain(today);
    expect(dir).toContain("telegram");
    expect(dir).toContain("999");
  });

  test("sanitizes unsafe filename characters", () => {
    const result = saveMediaBuffer({
      channel: "telegram",
      chatId: "123",
      buffer: Buffer.from("DATA"),
      contentType: "image/webp",
      filename: "sticker/../../../etc/passwd",
      dataDir: TEST_DATA_DIR,
    });
    // Path traversal dots are replaced with underscores
    expect(result.path).not.toContain("/../");
    expect(existsSync(result.path)).toBe(true);
  });
});

// ============================================================================
// Media Cleanup
// ============================================================================

describe("media-storage: cleanupMedia", () => {
  const { cleanupMedia, getMediaStats } = require("./media-storage.ts");
  const cleanupDir = join(TEST_DATA_DIR, "cleanup-test");

  beforeEach(() => {
    try { rmSync(cleanupDir, { recursive: true }); } catch {}
  });

  afterAll(() => {
    try { rmSync(cleanupDir, { recursive: true }); } catch {}
  });

  test("removes files in old date directories", () => {
    // Create an old date directory
    const oldDir = join(cleanupDir, "media", "telegram", "chat1", "2020-01-01");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(join(oldDir, "sticker-old.webp"), "OLD");

    // Create a recent date directory
    const today = new Date().toISOString().slice(0, 10);
    const newDir = join(cleanupDir, "media", "telegram", "chat1", today);
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, "sticker-new.webp"), "NEW");

    const result = cleanupMedia({ maxAgeDays: 7, dataDir: cleanupDir });
    expect(result.filesRemoved).toBe(1);
    expect(result.bytesFreed).toBe(3); // "OLD" = 3 bytes
    expect(existsSync(join(newDir, "sticker-new.webp"))).toBe(true);
  });

  test("dry-run does not delete files", () => {
    const oldDir = join(cleanupDir, "media", "telegram", "chat2", "2020-06-15");
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(join(oldDir, "file.webp"), "DATA");

    const result = cleanupMedia({ maxAgeDays: 1, dryRun: true, dataDir: cleanupDir });
    expect(result.filesRemoved).toBe(1);
    expect(existsSync(join(oldDir, "file.webp"))).toBe(true); // still exists
  });

  test("getMediaStats counts files and bytes", () => {
    const dir = join(cleanupDir, "media", "telegram", "chat3", "2026-01-01");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.webp"), "AAAA");
    writeFileSync(join(dir, "b.webp"), "BB");

    const stats = getMediaStats({ dataDir: cleanupDir });
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalBytes).toBe(6);
    expect(stats.channels.telegram.chats).toBe(1);
  });
});

// ============================================================================
// Sticker Cache
// ============================================================================

describe("sticker-cache", () => {
  const {
    getCachedSticker,
    cacheSticker,
    pruneStickerCache,
    getStickerCacheStats,
    clearStickerCache,
    resetStickerCacheMemory,
  } = require("./sticker-cache.ts");

  const cacheDir = join(TEST_DATA_DIR, "cache-test");

  beforeEach(() => {
    resetStickerCacheMemory();
    try { rmSync(cacheDir, { recursive: true }); } catch {}
  });

  afterAll(() => {
    try { rmSync(cacheDir, { recursive: true }); } catch {}
  });

  test("cache miss returns null", () => {
    expect(getCachedSticker("nonexistent", { dataDir: cacheDir })).toBeNull();
  });

  test("cache hit returns stored entry", () => {
    cacheSticker({
      fileId: "file123",
      fileUniqueId: "unique456",
      emoji: "😀",
      setName: "TestSet",
      cachedAt: new Date().toISOString(),
    }, { dataDir: cacheDir });

    const cached = getCachedSticker("unique456", { dataDir: cacheDir });
    expect(cached).not.toBeNull();
    expect(cached!.fileId).toBe("file123");
    expect(cached!.emoji).toBe("😀");
  });

  test("prune removes entries with missing files", () => {
    cacheSticker({
      fileId: "f1",
      fileUniqueId: "u1",
      filePath: "/nonexistent/path/sticker.webp",
      cachedAt: new Date().toISOString(),
    }, { dataDir: cacheDir });

    cacheSticker({
      fileId: "f2",
      fileUniqueId: "u2",
      cachedAt: new Date().toISOString(),
      // no filePath — should not be pruned
    }, { dataDir: cacheDir });

    const pruned = pruneStickerCache({ dataDir: cacheDir });
    expect(pruned).toBe(1);
    expect(getCachedSticker("u1", { dataDir: cacheDir })).toBeNull();
    expect(getCachedSticker("u2", { dataDir: cacheDir })).not.toBeNull();
  });

  test("clear removes all entries", () => {
    cacheSticker({ fileId: "a", fileUniqueId: "a1", cachedAt: "" }, { dataDir: cacheDir });
    cacheSticker({ fileId: "b", fileUniqueId: "b1", cachedAt: "" }, { dataDir: cacheDir });

    const count = clearStickerCache({ dataDir: cacheDir });
    expect(count).toBe(2);
    expect(getStickerCacheStats({ dataDir: cacheDir }).totalEntries).toBe(0);
  });

  test("stats reports correct counts", () => {
    // Create a real file for one entry
    const tmpFile = join(cacheDir, "real-sticker.webp");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(tmpFile, "DATA");

    cacheSticker({
      fileId: "f1",
      fileUniqueId: "u1",
      filePath: tmpFile,
      isThumbnail: true,
      cachedAt: "",
    }, { dataDir: cacheDir });

    cacheSticker({
      fileId: "f2",
      fileUniqueId: "u2",
      filePath: "/missing.webp",
      cachedAt: "",
    }, { dataDir: cacheDir });

    const stats = getStickerCacheStats({ dataDir: cacheDir });
    expect(stats.totalEntries).toBe(2);
    expect(stats.withFile).toBe(1); // only the real file
    expect(stats.thumbnails).toBe(1);
  });
});

// ============================================================================
// Outbound: parseOutboundMediaDirectives recognizes [sticker]
// ============================================================================

describe("sticker outbound: parseOutboundMediaDirectives", () => {
  const { parseOutboundMediaDirectives } = require("./media-send.ts");

  test("recognizes [sticker] directive with file_id", () => {
    const result = parseOutboundMediaDirectives("[sticker] CAACAgIAAxkBAAI_sticker_file_id");
    expect(result.media).toHaveLength(1);
    expect(result.media[0].kind).toBe("sticker");
    expect(result.media[0].url).toBe("CAACAgIAAxkBAAI_sticker_file_id");
    expect(result.text).toBe("");
  });

  test("[sticker] is case-insensitive", () => {
    const result = parseOutboundMediaDirectives("[STICKER] some_file_id");
    expect(result.media).toHaveLength(1);
    expect(result.media[0].kind).toBe("sticker");
  });

  test("mixed text and [sticker] directive", () => {
    const input = "Hello!\n[sticker] CAACAgIAAxkBAAI_id\nGoodbye!";
    const result = parseOutboundMediaDirectives(input);
    expect(result.media).toHaveLength(1);
    expect(result.text).toBe("Hello!\nGoodbye!");
  });
});

// ============================================================================
// Outbound: sendTelegramMedia dispatches sticker kind
// ============================================================================

describe("sticker outbound: sendTelegramMedia kind dispatch", () => {
  function createMockBot() {
    const calls: { method: string; chatId: string }[] = [];
    return {
      calls,
      api: {
        sendSticker: async (chatId: string) => { calls.push({ method: "sendSticker", chatId }); },
        sendPhoto: async (chatId: string) => { calls.push({ method: "sendPhoto", chatId }); },
        sendMessage: async () => {},
      },
    };
  }

  const tmpDir = join(TEST_DATA_DIR, "send-test");

  function writeTmpFile(name: string): string {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, name);
    writeFileSync(path, Buffer.from("FAKE_STICKER_DATA"));
    return path;
  }

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  const { sendTelegramMedia } = require("./media-send.ts");

  test("local sticker.webp with kind=sticker → sendSticker", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.webp");
    await sendTelegramMedia(bot as any, "123", { kind: "sticker", url: path }, { skipPathValidation: true });
    expect(bot.calls[0].method).toBe("sendSticker");
  });

  test("remote sticker URL → sendSticker", async () => {
    const bot = createMockBot();
    await sendTelegramMedia(bot as any, "456", {
      kind: "sticker",
      url: "https://example.com/sticker.webp",
    });
    expect(bot.calls[0].method).toBe("sendSticker");
  });
});

// ============================================================================
// Outbound: sendMediaViaAccount kind mapping for sticker
// ============================================================================

describe("sticker outbound: sendMediaViaAccount kind mapping", () => {
  const { sendMediaViaAccount } = require("./outbound.ts");

  test("typeHint=sticker → sticker kind", async () => {
    const runtime = {
      accounts: new Map([
        ["default", {
          accountId: "default",
          token: "test-token",
          cfg: {},
          bot: {
            api: {
              sendSticker: async () => {},
              sendPhoto: async () => {},
              sendMessage: async () => {},
            },
          },
        }],
      ]),
      api: { logger: { info: () => {}, error: () => {}, warn: () => {} } },
    };

    const result = await sendMediaViaAccount({
      runtime: runtime as any,
      defaultAccountId: "default",
      target: "123",
      filePath: "/tmp/test.webp",
      opts: { type: "sticker" },
    });
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Cleanup test artifacts
// ============================================================================

afterAll(() => {
  try { rmSync(TEST_DATA_DIR, { recursive: true }); } catch {}
});
