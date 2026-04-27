import { afterEach, describe, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;
const { default: registerWechatPlugin } = await import("../index.ts");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("wechat plugin outbound target encoding", () => {
  test("channel outbound.sendText converts accountId:userId target into WeChat c2c target", async () => {
    let registeredChannel: any;
    let capturedBody: any = null;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify({ ret: 0, data: { msg_id: "mid-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const api = {
      config: {
        channels: {
          wechat: {
            enabled: true,
            dmPolicy: "open",
            allowFrom: [],
            textChunkLimit: 4000,
            streaming: { enabled: false },
            accounts: {
              "wx-bot": {
                enabled: true,
                token: "token",
              },
            },
          },
        },
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      registerChannel: (channel: any) => {
        registeredChannel = channel;
      },
      registerHttpRoute: () => {},
    } as any;

    registerWechatPlugin(api);
    await registeredChannel.init(api);

    const result = await registeredChannel.outbound.sendText("wx-bot:user@im.wechat", "hello", {});

    expect(result.ok).toBe(true);
    expect(capturedBody?.msg?.to_user_id).toBe("user@im.wechat");
  });
});
