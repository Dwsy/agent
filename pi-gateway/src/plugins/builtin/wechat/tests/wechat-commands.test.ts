import { describe, expect, mock, test } from "bun:test";
import { handleSlashCommand } from "../commands.ts";

function createCtx() {
  const sent: string[] = [];
  return {
    sent,
    ctx: {
      accountId: "wx-bot",
      to: "user@im.wechat",
      contextToken: "ctx",
      baseUrl: "https://ilinkai.weixin.qq.com",
      token: "token",
      send: async (text: string) => {
        sent.push(text);
      },
      log: () => {},
      errLog: () => {},
      isDebug: () => false,
      toggleDebug: () => {},
      getStatus: () => ({
        accountId: "wx-bot",
        connected: true,
        contextTokensSize: 1,
        dedupSize: 0,
        syncBufSize: 0,
        sessionPaused: false,
        sessionExpired: false,
        sessionExpiryCount: 0,
      }),
    },
  } as any;
}

describe("wechat slash commands", () => {
  test("known local command /status is handled locally", async () => {
    const { ctx, sent } = createCtx();

    const result = await handleSlashCommand("/status", ctx);

    expect(result).toEqual({ handled: true });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain("WeChat Bot 状态");
  });

  test("unknown slash command like /new falls through to agent", async () => {
    const { ctx, sent } = createCtx();

    const result = await handleSlashCommand("/new", ctx);

    expect(result).toEqual({ handled: false });
    expect(sent).toEqual([]);
  });
});
