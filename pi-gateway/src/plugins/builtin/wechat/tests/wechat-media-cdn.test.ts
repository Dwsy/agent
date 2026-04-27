import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadWechatMedia, uploadWechatMedia } from "../media.ts";
import type { WechatAccountRuntime } from "../types.ts";

const originalFetch = globalThis.fetch;

function createRuntime(): WechatAccountRuntime {
  return {
    api: { logger: { info() {}, warn() {}, error() {}, debug() {} } } as any,
    channelCfg: { enabled: true, dmPolicy: "open", allowFrom: [], textChunkLimit: 4000, streaming: { enabled: false } },
    accountId: "wx-bot",
    token: "token",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    disposed: false,
    contextTokens: new Map(),
    dedup: new Map(),
    streamPlaceholders: new Map(),
    syncBuf: "",
    syncBufPath: "",
    pollTimer: null,
    reconnectTimer: null,
    dmPolicy: "open",
    allowFrom: [],
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("wechat cdn media flow", () => {
  test("uploadWechatMedia uses /upload endpoint and x-encrypted-param header", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-media-"));
    const filePath = path.join(tmp, "a.txt");
    fs.writeFileSync(filePath, "hello world");

    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/ilink/bot/getuploadurl")) {
        return new Response(JSON.stringify({ ret: 0, upload_param: "enc-param" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/upload?")) {
        return new Response("", { status: 200, headers: { "x-encrypted-param": "download-param" } });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const runtime = createRuntime();
    const result = await uploadWechatMedia(runtime, { filePath, toUserId: "user@im.wechat", mediaType: "file" });

    expect(result.downloadEncryptedQueryParam).toBe("download-param");
    expect(calls.some((url) => url.includes("/upload?encrypted_query_param=enc-param") && url.includes("filekey="))).toBe(true);
  });

  test("downloadWechatMedia uses /download endpoint with encrypted_query_param", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-download-"));
    const plaintext = Buffer.from("hello world");
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const cipher = require("node:crypto").createCipheriv("aes-128-ecb", key, null);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return new Response(encrypted, { status: 200 });
    }) as typeof fetch;

    const runtime = createRuntime();
    const filePath = await downloadWechatMedia(runtime, "download-param", key.toString("hex"), tmp);
    const content = fs.readFileSync(filePath, "utf-8");

    expect(requestedUrl).toContain("/download?encrypted_query_param=download-param");
    expect(content).toBe("hello world");
  });
});
