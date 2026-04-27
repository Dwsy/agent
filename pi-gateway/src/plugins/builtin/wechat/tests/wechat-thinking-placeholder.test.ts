import { afterEach, describe, expect, test } from "bun:test";
import type { WechatAccountRuntime, WechatInboundMessage } from "../types.ts";
import { handleWechatMessage } from "../handlers.ts";

const originalFetch = globalThis.fetch;
const events: string[] = [];

function createRuntime() {
  const dispatchCalls: Array<any> = [];
  const runtime: WechatAccountRuntime = {
    api: {
      config: { session: { dmScope: "per-channel-peer" } },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      dispatch: async (payload: any) => {
        events.push("dispatch");
        dispatchCalls.push(payload);
      },
    } as any,
    channelCfg: {
      enabled: true,
      dmPolicy: "open",
      allowFrom: [],
      textChunkLimit: 4000,
      streaming: { enabled: false },
    },
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
  return { runtime, dispatchCalls };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  events.length = 0;
});

describe("wechat typing behavior", () => {
  test("handleWechatMessage dispatches directly without sending a separate thinking placeholder", async () => {
    const sentBodies: any[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      sentBodies.push(body);
      return new Response(JSON.stringify({ ret: 0, data: { msg_id: "mid-thinking" }, typing_ticket: "ticket-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { runtime, dispatchCalls } = createRuntime();
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185992",
      create_time_ms: 1774500385146,
      context_token: "ctx-1",
      item_list: [{ type: 1, text_item: { text: "hello" } }],
    } as unknown as WechatInboundMessage;

    await handleWechatMessage(runtime, msg);

    expect(dispatchCalls).toHaveLength(1);
    expect(sentBodies).toHaveLength(0);
    expect(events).toEqual(["dispatch"]);
  });
});
