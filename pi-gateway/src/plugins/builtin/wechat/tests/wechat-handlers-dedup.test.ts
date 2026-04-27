import { describe, expect, test } from "bun:test";
import { handleWechatMessage, parseWechatMessage } from "../handlers.ts";
import { isDuplicate } from "../session.ts";
import type { WechatAccountRuntime, WechatInboundMessage } from "../types.ts";

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
});
