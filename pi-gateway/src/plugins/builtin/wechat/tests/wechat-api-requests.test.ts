import { afterEach, describe, expect, test } from "bun:test";
import { getWechatConfig, getWechatUploadUrl, sendWechatTyping } from "../api.ts";
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

describe("wechat api request payloads", () => {
  test("getUploadUrl includes base_info and expected fields", async () => {
    let body: any;
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ret: 0, upload_param: "up" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const runtime = createRuntime();
    const result = await getWechatUploadUrl(runtime, {
      filekey: "fk",
      media_type: 1,
      to_user_id: "user@im.wechat",
      rawsize: 123,
      rawfilemd5: "md5",
      filesize: 128,
      aeskey: "00112233445566778899aabbccddeeff",
      no_need_thumb: true,
    });

    expect(result.uploadParam).toBe("up");
    expect(body.filekey).toBe("fk");
    expect(body.media_type).toBe(1);
    expect(body.to_user_id).toBe("user@im.wechat");
    expect(body.base_info?.channel_version).toBeString();
  });

  test("getConfig includes context_token and base_info", async () => {
    let body: any;
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ret: 0, typing_ticket: "ticket-1" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const runtime = createRuntime();
    const result = await getWechatConfig(runtime, "user@im.wechat", "ctx-1");

    expect(result.typingTicket).toBe("ticket-1");
    expect(body.ilink_user_id).toBe("user@im.wechat");
    expect(body.context_token).toBe("ctx-1");
    expect(body.base_info?.channel_version).toBeString();
  });

  test("sendTyping includes ticket status and base_info", async () => {
    let body: any;
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ret: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const runtime = createRuntime();
    await sendWechatTyping(runtime, {
      ilink_user_id: "user@im.wechat",
      typing_ticket: "ticket-1",
      status: 1,
    });

    expect(body.ilink_user_id).toBe("user@im.wechat");
    expect(body.typing_ticket).toBe("ticket-1");
    expect(body.status).toBe(1);
    expect(body.base_info?.channel_version).toBeString();
  });
});
