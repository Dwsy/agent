import { afterEach, describe, expect, mock, test } from "bun:test";
import type { WechatAccountRuntime } from "../types.ts";

const sendMessageMock = mock(async () => ({ messageId: "mid-1" }));

await mock.module("../api.ts", () => ({
  sendWechatMessage: sendMessageMock,
  generateClientId: () => "client-1",
}));

const { encodeWechatTarget, parseWechatTarget, sendWechatText } = await import("../outbound.ts");

function createRuntime(): WechatAccountRuntime {
  return {
    api: {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
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
}

function sentRequest(index = 0): any {
  return (sendMessageMock.mock.calls as unknown as Array<[WechatAccountRuntime, any]>)[index]?.[1];
}

afterEach(() => {
  sendMessageMock.mockClear();
});

describe("wechat outbound context token", () => {
  test("parseWechatTarget treats a bare user id as c2c target", () => {
    expect(parseWechatTarget("user@im.wechat")).toEqual({ peerType: "c2c", id: "user@im.wechat" });
  });

  test("sendWechatText uses cached context token stored by userId", async () => {
    const runtime = createRuntime();
    runtime.contextTokens.set("user@im.wechat", "ctx-user-only");

    const result = await sendWechatText(runtime, "c2c|user@im.wechat", "hello");

    expect(result.ok).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sentRequest()?.msg?.to_user_id).toBe("user@im.wechat");
    expect(sentRequest()?.msg?.context_token).toBe("ctx-user-only");
    expect(sentRequest()?.msg?.message_type).toBe(2);
    expect(sentRequest()?.msg?.message_state).toBe(2);
    expect(sentRequest()?.msg?.item_list?.[0]?.type).toBe(1);
  });

  test("sendWechatText also supports account-scoped cached context token", async () => {
    const runtime = createRuntime();
    runtime.contextTokens.set("wx-bot:user@im.wechat", "ctx-account-user");

    const result = await sendWechatText(runtime, "c2c|user@im.wechat", "hello");

    expect(result.ok).toBe(true);
    expect(sentRequest()?.msg?.context_token).toBe("ctx-account-user");
    expect(sentRequest()?.msg?.to_user_id).toBe("user@im.wechat");
  });

  test("encoded target can carry full context token as fallback", async () => {
    const runtime = createRuntime();
    const rawTarget = encodeWechatTarget({
      peerType: "c2c",
      id: "user@im.wechat",
      contextToken: "ctx/full+token==",
    });

    expect(parseWechatTarget(rawTarget).contextToken).toBe("ctx/full+token==");

    const result = await sendWechatText(runtime, rawTarget, "hello");

    expect(result.ok).toBe(true);
    expect(sentRequest()?.msg?.context_token).toBe("ctx/full+token==");
  });
});
