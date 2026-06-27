import { afterEach, describe, expect, test } from "bun:test";
import { handleWechatMessage, parseWechatMessage } from "../handlers.ts";
import { isDuplicate } from "../session.ts";
import type { WechatAccountRuntime, WechatInboundMessage } from "../types.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createRuntime() {
  const dispatchCalls: Array<any> = [];
  const runtime: WechatAccountRuntime = {
    api: {
      config: { session: { dmScope: "per-channel-peer" } },
      dispatch: async (payload: any) => {
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

describe("wechat handlers dedup", () => {
  test("parseWechatMessage supports numeric text item types from ilink payload", () => {
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185991",
      create_time_ms: 1774500385145,
      item_list: [{ type: 1, text_item: { text: "hello from numeric type" } }],
    } as unknown as WechatInboundMessage;

    const parsed = parseWechatMessage(msg, "wx-bot");

    expect(parsed?.text).toBe("hello from numeric type");
    expect(parsed?.messageId).toBe("7442794063518185991");
  });

  test("parseWechatMessage prefers message_id from ilink payload", () => {
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185992",
      create_time_ms: 1774500385146,
      item_list: [{ type: "text", text_item: { text: "hello" } }],
    } as unknown as WechatInboundMessage;

    const parsed = parseWechatMessage(msg, "wx-bot");

    expect(parsed?.messageId).toBe("7442794063518185992");
  });

  test("handleWechatMessage should not treat gateway-accepted message as duplicate", async () => {
    const { runtime, dispatchCalls } = createRuntime();
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185992",
      create_time_ms: 1774500385146,
      context_token: "ctx-1",
      item_list: [{ type: "text", text_item: { text: "hello" } }],
    } as unknown as WechatInboundMessage;

    const gatewayKey = `${msg.from_user_id}-${msg.create_time_ms}`;
    expect(isDuplicate(runtime, gatewayKey)).toBe(false);

    await handleWechatMessage(runtime, msg);

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].text).toBe("hello");
    expect(dispatchCalls[0].source.accountId).toBe("wx-bot");
  });

  test("generic slash command is dispatched to gateway command pipeline", async () => {
    const { runtime, dispatchCalls } = createRuntime();
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185993",
      create_time_ms: 1774500385147,
      context_token: "ctx-2",
      item_list: [{ type: "text", text_item: { text: "/status" } }],
    } as unknown as WechatInboundMessage;

    await handleWechatMessage(runtime, msg);

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].text).toBe("/status");
    expect(dispatchCalls[0].source.channel).toBe("wechat");
  });

  test("dollar command aliases are normalized before gateway dispatch", async () => {
    const cases = [
      { input: "$new", expected: "/new" },
      { input: "$压缩", expected: "/compact" },
      { input: "$custom arg", expected: "/custom arg" },
    ];

    for (const [index, item] of cases.entries()) {
      const { runtime, dispatchCalls } = createRuntime();
      const msg = {
        from_user_id: "user@im.wechat",
        to_user_id: "bot@im.bot",
        message_id: `744279406351818599${4 + index}`,
        create_time_ms: 1774500385148 + index,
        context_token: `ctx-${3 + index}`,
        item_list: [{ type: "text", text_item: { text: item.input } }],
      } as unknown as WechatInboundMessage;

      await handleWechatMessage(runtime, msg);

      expect(dispatchCalls).toHaveLength(1);
      expect(dispatchCalls[0].text).toBe(item.expected);
    }
  });

  test("/help sends WeChat dollar command usage text", async () => {
    const sentBodies: any[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ ret: 0, data: { msg_id: "help-msg" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { runtime, dispatchCalls } = createRuntime();
    const msg = {
      from_user_id: "user@im.wechat",
      to_user_id: "bot@im.bot",
      message_id: "7442794063518185998",
      create_time_ms: 1774500385152,
      context_token: "ctx-help",
      item_list: [{ type: "text", text_item: { text: "/help" } }],
    } as unknown as WechatInboundMessage;

    await handleWechatMessage(runtime, msg);

    expect(dispatchCalls).toHaveLength(0);
    const sentText = sentBodies[0]?.msg?.item_list?.[0]?.text_item?.text;
    expect(sentText).toContain("微信命令用法");
    expect(sentText).toContain("$new");
    expect(sentText).toContain("$压缩");
  });
});
