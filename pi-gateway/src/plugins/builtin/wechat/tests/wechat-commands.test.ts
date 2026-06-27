import { describe, expect, test } from "bun:test";
import { handleSlashCommand, normalizeWechatCommandText } from "../commands.ts";

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
  test("/help explains WeChat dollar command usage", async () => {
    const { ctx, sent } = createCtx();

    const result = await handleSlashCommand("/help", ctx);

    expect(result).toEqual({ handled: true });
    expect(sent[0]).toContain("微信命令用法");
    expect(sent[0]).toContain("$new");
    expect(sent[0]).toContain("$压缩");
    expect(sent[0]).toContain("/new -> $new");

    sent.length = 0;
    const dollarResult = await handleSlashCommand("$help", ctx);
    expect(dollarResult).toEqual({ handled: true });
    expect(sent[0]).toContain("微信命令用法");
  });

  test("known local command /wechat-status is handled locally", async () => {
    const { ctx, sent } = createCtx();

    const result = await handleSlashCommand("/wechat-status", ctx);

    expect(result).toEqual({ handled: true });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain("WeChat Bot 状态");
  });

  test("generic gateway commands fall through to the command pipeline", async () => {
    const { ctx, sent } = createCtx();

    for (const command of ["/status", "/ping", "/version", "/new", "/model anthropic/foo", "$new", "$压缩", "$model anthropic/foo"]) {
      const result = await handleSlashCommand(command, ctx);
      expect(result).toEqual({ handled: false });
    }

    expect(sent).toEqual([]);
  });

  test("openclaw-aligned local commands are still handled", async () => {
    const { ctx, sent } = createCtx();

    const echoResult = await handleSlashCommand("/echo hello", ctx);
    const debugResult = await handleSlashCommand("/toggle-debug", ctx);

    expect(echoResult).toEqual({ handled: true });
    expect(debugResult).toEqual({ handled: true });
    expect(sent[0]).toBe("hello");
    expect(sent.some((line: string) => line.includes("Debug 模式"))).toBe(true);
  });

  test("dollar commands normalize to gateway slash commands", () => {
    expect(normalizeWechatCommandText("$new")).toBe("/new");
    expect(normalizeWechatCommandText("$压缩")).toBe("/compact");
    expect(normalizeWechatCommandText("$model anthropic/claude")).toBe("/model anthropic/claude");
    expect(normalizeWechatCommandText("$100")).toBe("$100");
  });
});
