import { afterEach, describe, expect, mock, test } from "bun:test";
import type { WechatAccountRuntime } from "../types.ts";

const sendMessageMock = mock(async () => ({ messageId: "mid-1" }));

await mock.module("../api.ts", () => ({
  sendWechatMessage: sendMessageMock,
  generateClientId: () => "client-1",
}));

const { sendWechatText } = await import("../outbound.ts");

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

afterEach(() => {
  sendMessageMock.mockClear();
});

describe("wechat outbound context token", () => {
  test("sendWechatText uses cached context token stored by userId", async () => {
    const runtime = createRuntime();
    runtime.contextTokens.set("user@im.wechat", "ctx-user-only");

    const result = await sendWechatText(runtime, "c2c|user@im.wechat", "hello");

    expect(result.ok).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.to_user_id).toBe("user@im.wechat");
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.context_token).toBe("ctx-user-only");
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.message_type).toBe(2);
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.message_state).toBe(2);
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.item_list?.[0]?.type).toBe(1);
  });

  test("sendWechatText also supports account-scoped cached context token", async () => {
    const runtime = createRuntime();
    runtime.contextTokens.set("wx-bot:user@im.wechat", "ctx-account-user");

    const result = await sendWechatText(runtime, "c2c|user@im.wechat", "hello");

    expect(result.ok).toBe(true);
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.context_token).toBe("ctx-account-user");
    expect(sendMessageMock.mock.calls[0]?.[1]?.msg?.to_user_id).toBe("user@im.wechat");
  });
});
