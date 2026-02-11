import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, type Config } from "../../../../core/config.ts";
import { setupTelegramCommands } from "../commands.ts";
import type { TelegramAccountRuntime, TelegramPluginRuntime } from "../types.ts";

class FakeBot {
  commands = new Map<string, (ctx: any) => Promise<void>>();
  nativeCommands: Array<{ command: string; description: string }> = [];
  api = {
    setMyCommands: async (commands: Array<{ command: string; description: string }>) => {
      this.nativeCommands = commands;
    },
    editMessageText: async () => {},
  };

  command(name: string, handler: (ctx: any) => Promise<void>) {
    this.commands.set(name, handler);
  }

  on(_event: string, _handler: (ctx: any) => Promise<void>) {}
}

function buildRuntime(overrides?: {
  resolvedMode?: "steer" | "follow-up" | "interrupt";
  accountMode?: "steer" | "follow-up" | "interrupt";
  channelMode?: "steer" | "follow-up" | "interrupt";
}) {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
  config.channels.telegram = { enabled: true };
  const bot = new FakeBot();
  const setCalls: Array<{ sessionKey: string; mode: "steer" | "follow-up" | "interrupt" }> = [];

  const runtime: TelegramPluginRuntime = {
    api: {
      id: "telegram",
      name: "telegram",
      source: "gateway",
      config,
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      registerChannel() {},
      registerTool() {},
      registerHook() {},
      registerHttpRoute() {},
      registerGatewayMethod() {},
      registerCommand() {},
      registerService() {},
      registerCli() {},
      on() {},
      async dispatch() {},
      async sendToChannel() {},
      getSessionState() { return null; },
      async resetSession() {},
      async setThinkingLevel() {},
      async setModel() {},
      async getAvailableModels() { return []; },
      async getSessionMessageMode() { return overrides?.resolvedMode ?? "steer"; },
      async setSessionMessageMode(
        sessionKey: string,
        mode: "steer" | "follow-up" | "interrupt",
      ) {
        setCalls.push({ sessionKey, mode });
      },
      async compactSession() {},
      async abortSession() {},
      async getPiCommands() { return []; },
    } as any,
    channelCfg: {
      enabled: true,
      messageMode: overrides?.channelMode,
    },
    accounts: new Map(),
  };

  const account: TelegramAccountRuntime = {
    accountId: "default",
    token: "token",
    cfg: {
      messageMode: overrides?.accountMode,
    },
    bot: bot as any,
    api: runtime.api,
    started: false,
    startMode: "polling",
    debounceMap: new Map(),
    mediaGroupMap: new Map(),
    seenUpdates: new Set(),
    seenCallbacks: new Set(),
    seenEditedEvents: new Set(),
  };

  return { runtime, account, bot, setCalls };
}

function createCtx(match: string, replies: string[]) {
  return {
    chat: { id: 1001, type: "private" },
    from: { id: 2002, first_name: "tester" },
    message: { message_id: 7 },
    match,
    async reply(text: string) {
      replies.push(text);
    },
  };
}

describe("telegram /queue command", () => {
  test("registers /queue in native commands", async () => {
    const { runtime, account, bot } = buildRuntime();
    await setupTelegramCommands(runtime, account);
    expect(bot.nativeCommands.some((c) => c.command === "queue")).toBe(true);
  });

  test("shows current queue mode and source", async () => {
    const { runtime, account, bot } = buildRuntime({
      resolvedMode: "follow-up",
      channelMode: "steer",
    });
    await setupTelegramCommands(runtime, account);

    const replies: string[] = [];
    const handler = bot.commands.get("queue");
    expect(handler).toBeDefined();
    await handler!(createCtx("", replies));

    expect(replies[0]).toContain("Queue Mode");
    expect(replies[0]).toContain("follow-up");
    expect(replies[0]).toContain("override");
  });

  test("sets session override and rejects invalid value", async () => {
    const { runtime, account, bot, setCalls } = buildRuntime();
    await setupTelegramCommands(runtime, account);
    const handler = bot.commands.get("queue");
    expect(handler).toBeDefined();

    const replies: string[] = [];
    await handler!(createCtx("interrupt", replies));
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]?.mode).toBe("interrupt");
    expect(replies[0]).toContain("interrupt");

    const badReplies: string[] = [];
    await handler!(createCtx("bad-mode", badReplies));
    expect(badReplies[0]).toContain("Invalid mode");
  });
});
