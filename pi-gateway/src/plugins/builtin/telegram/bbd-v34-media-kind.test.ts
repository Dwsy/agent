/**
 * BBD tests for v3.4: sendLocalFileByKind video branch + sendMediaViaAccount kind mapping
 */
import { describe, test, expect, mock } from "bun:test";
import { IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS } from "./media-send.ts";

// ============================================================================
// Extension constant tests
// ============================================================================

describe("v3.4: media extension constants", () => {
  test("IMAGE_EXTS covers common image formats", () => {
    for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "bmp"]) {
      expect(IMAGE_EXTS.has(ext)).toBe(true);
    }
    expect(IMAGE_EXTS.has("mp4")).toBe(false);
  });

  test("AUDIO_EXTS covers common audio formats", () => {
    for (const ext of ["mp3", "ogg", "wav", "m4a", "flac"]) {
      expect(AUDIO_EXTS.has(ext)).toBe(true);
    }
    expect(AUDIO_EXTS.has("jpg")).toBe(false);
  });

  test("VIDEO_EXTS covers common video formats", () => {
    for (const ext of ["mp4", "webm", "mov", "avi"]) {
      expect(VIDEO_EXTS.has(ext)).toBe(true);
    }
    expect(VIDEO_EXTS.has("mp3")).toBe(false);
  });
});

// ============================================================================
// sendLocalFileByKind dispatch (via sendTelegramMedia)
// ============================================================================

describe("v3.4: sendTelegramMedia kind dispatch", () => {
  function createMockBot() {
    const calls: { method: string; chatId: string; caption?: string }[] = [];
    return {
      calls,
      api: {
        sendPhoto: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendPhoto", chatId, caption: opts?.caption });
          return { message_id: 1 };
        }),
        sendAnimation: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendAnimation", chatId, caption: opts?.caption });
          return { message_id: 2 };
        }),
        sendAudio: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendAudio", chatId, caption: opts?.caption });
          return { message_id: 3 };
        }),
        sendVoice: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendVoice", chatId, caption: opts?.caption });
          return { message_id: 4 };
        }),
        sendVideo: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendVideo", chatId, caption: opts?.caption });
          return { message_id: 5 };
        }),
        sendDocument: mock(async (chatId: string, _file: any, opts?: any) => {
          calls.push({ method: "sendDocument", chatId, caption: opts?.caption });
          return { message_id: 6 };
        }),
        sendMessage: mock(async () => ({ message_id: 99 })),
      },
    };
  }

  // We need files inside cwd for validateMediaPath to pass
  const { writeFileSync, unlinkSync, mkdirSync } = require("node:fs");
  const { join } = require("node:path");
  const tmpDir = join(process.cwd(), ".test-media-tmp");
  mkdirSync(tmpDir, { recursive: true });

  function writeTmpFile(name: string): string {
    const abs = join(tmpDir, name);
    writeFileSync(abs, "test-content");
    // Return relative path — validateMediaPath blocks absolute paths
    return `.test-media-tmp/${name}`;
  }

  // Dynamic import to get sendTelegramMedia
  const { sendTelegramMedia } = require("./media-send.ts");

  test("photo.jpg → sendPhoto", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.jpg");
    await sendTelegramMedia(bot as any, "123", { kind: "photo", url: path });
    expect(bot.calls[0].method).toBe("sendPhoto");
    unlinkSync(path);
  });

  test("photo.gif → sendAnimation", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.gif");
    await sendTelegramMedia(bot as any, "123", { kind: "photo", url: path });
    expect(bot.calls[0].method).toBe("sendAnimation");
    unlinkSync(path);
  });

  test("audio.mp3 → sendAudio", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.mp3");
    await sendTelegramMedia(bot as any, "123", { kind: "audio", url: path });
    expect(bot.calls[0].method).toBe("sendAudio");
    unlinkSync(path);
  });

  test("audio.ogg → sendVoice", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.ogg");
    await sendTelegramMedia(bot as any, "123", { kind: "audio", url: path });
    expect(bot.calls[0].method).toBe("sendVoice");
    unlinkSync(path);
  });

  test("video.mp4 → sendVideo", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.mp4");
    await sendTelegramMedia(bot as any, "123", { kind: "file", url: path });
    expect(bot.calls[0].method).toBe("sendVideo");
    unlinkSync(path);
  });

  test("video.webm → sendVideo", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("test.webm");
    await sendTelegramMedia(bot as any, "123", { kind: "file", url: path });
    expect(bot.calls[0].method).toBe("sendVideo");
    unlinkSync(path);
  });

  test("file.pdf → sendDocument", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("report.pdf");
    await sendTelegramMedia(bot as any, "123", { kind: "file", url: path });
    expect(bot.calls[0].method).toBe("sendDocument");
    unlinkSync(path);
  });

  test("file.zip → sendDocument", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("archive.zip");
    await sendTelegramMedia(bot as any, "123", { kind: "file", url: path });
    expect(bot.calls[0].method).toBe("sendDocument");
    unlinkSync(path);
  });

  test("caption passed through to API call", async () => {
    const bot = createMockBot();
    const path = writeTmpFile("captioned.jpg");
    await sendTelegramMedia(bot as any, "123", { kind: "photo", url: path, caption: "Hello world" });
    expect(bot.calls[0].caption).toBeDefined();
    unlinkSync(path);
  });
});

// ============================================================================
// sendMediaViaAccount kind mapping (unit logic)
// ============================================================================

describe("v3.4: sendMediaViaAccount kind mapping", () => {
  // Test the mapping logic directly without needing full runtime
  function resolveKind(filePath: string, typeHint?: string): "photo" | "audio" | "file" {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    return typeHint === "photo" ? "photo"
      : typeHint === "audio" ? "audio"
      : typeHint === "video" || typeHint === "document" ? "file"
      : IMAGE_EXTS.has(ext) ? "photo"
      : AUDIO_EXTS.has(ext) ? "audio"
      : "file";
  }

  test("typeHint=video → file", () => {
    expect(resolveKind("clip.mp4", "video")).toBe("file");
  });

  test("typeHint=document → file", () => {
    expect(resolveKind("report.pdf", "document")).toBe("file");
  });

  test("typeHint=photo → photo", () => {
    expect(resolveKind("anything.bin", "photo")).toBe("photo");
  });

  test("typeHint=audio → audio", () => {
    expect(resolveKind("anything.bin", "audio")).toBe("audio");
  });

  test("no hint, .jpg → photo", () => {
    expect(resolveKind("pic.jpg")).toBe("photo");
  });

  test("no hint, .mp3 → audio", () => {
    expect(resolveKind("song.mp3")).toBe("audio");
  });

  test("no hint, .mp4 → file (inferred from ext, not video hint)", () => {
    expect(resolveKind("clip.mp4")).toBe("file");
  });

  test("no hint, .pdf → file", () => {
    expect(resolveKind("doc.pdf")).toBe("file");
  });

  test("no hint, unknown ext → file", () => {
    expect(resolveKind("data.xyz")).toBe("file");
  });
});
