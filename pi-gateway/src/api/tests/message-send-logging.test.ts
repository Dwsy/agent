import { describe, expect, mock, test } from "bun:test";
import { handleMessageSendRequest } from "../message-send.ts";

describe("message-send logging", () => {
  test("includes channel plugin account and rpc context in delivery log", async () => {
    const info = mock((..._args: unknown[]) => {});
    const sendText = mock(async () => ({ ok: true, messageId: "mid-1" }));

    const channelPlugin = {
      id: "wechat-channel",
      __pluginId: "wechat-plugin",
      meta: { label: "WeChat" },
      capabilities: {},
      outbound: {
        maxLength: 4000,
        sendText,
      },
      resolveTarget: ({ chatId, session }: { chatId: string; session?: { lastAccountId?: string } }) =>
        `${session?.lastAccountId ?? "default"}:${chatId}`,
    } as any;

    const sessionKey = "agent:main:wechat:dm:user-1";
    const req = new Request("http://localhost/api/message/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionKey, text: "hello" }),
    });

    const res = await handleMessageSendRequest(req, {
      config: {},
      pool: {
        getForSession: (key: string) => key === sessionKey ? { id: "rpc-7", sessionKey } : null,
      },
      registry: {
        channels: new Map([["wechat", channelPlugin]]),
        hooks: { dispatch: async () => {} },
      },
      sessions: {
        get: (key: string) => key === sessionKey
          ? {
              sessionKey,
              role: null,
              isStreaming: false,
              lastActivity: Date.now(),
              messageCount: 1,
              rpcProcessId: "rpc-7",
              lastChatId: "user-1@im.wechat",
              lastChannel: "wechat",
              lastAccountId: "wx-bot",
              lastChatType: "dm",
            }
          : undefined,
      },
      log: {
        info,
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    } as any);

    expect(res.status).toBe(200);
    const deliveryLog = info.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes("[message-send] channel=wechat"));

    expect(deliveryLog).toBeDefined();
    expect(deliveryLog).toContain("plugin=wechat-plugin");
    expect(deliveryLog).toContain("account=wx-bot");
    expect(deliveryLog).toContain("rpc=rpc-7");
    expect(deliveryLog).toContain("target=wx-bot:user-1@im.wechat");
  });
});
