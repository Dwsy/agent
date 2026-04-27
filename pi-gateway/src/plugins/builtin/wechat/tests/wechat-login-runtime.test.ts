import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveWechatAccounts } from "../accounts.ts";
import { activateWechatAccount } from "../runtime.ts";
import type { WechatChannelConfig, WechatResolvedAccount } from "../types.ts";

const originalPiStateDir = process.env.PI_STATE_DIR;

function createChannelConfig(overrides: Partial<WechatChannelConfig> = {}): WechatChannelConfig {
  return {
    enabled: true,
    dmPolicy: "pairing",
    allowFrom: [],
    textChunkLimit: 4000,
    streaming: { enabled: false },
    ...overrides,
  };
}

function createResolvedAccount(overrides: Partial<WechatResolvedAccount> = {}): WechatResolvedAccount {
  return {
    accountId: "bot-im-bot",
    enabled: true,
    configured: true,
    baseUrl: "https://ilink.example.com",
    cdnBaseUrl: "https://cdn.example.com",
    token: "bot-token",
    userId: "user-1",
    dmPolicy: "pairing",
    allowFrom: [],
    ...overrides,
  };
}

afterEach(() => {
  if (originalPiStateDir === undefined) {
    delete process.env.PI_STATE_DIR;
  } else {
    process.env.PI_STATE_DIR = originalPiStateDir;
  }
});

describe("wechat login runtime", () => {
  test("resolveWechatAccounts loads persisted indexed accounts without config.accounts", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-state-"));
    process.env.PI_STATE_DIR = stateDir;

    const wechatDir = path.join(stateDir, "wechat");
    const accountsDir = path.join(wechatDir, "accounts");
    fs.mkdirSync(accountsDir, { recursive: true });
    fs.writeFileSync(path.join(wechatDir, "accounts.json"), JSON.stringify(["bot-im-bot"], null, 2));
    fs.writeFileSync(
      path.join(accountsDir, "bot-im-bot.json"),
      JSON.stringify({
        token: "persisted-token",
        baseUrl: "https://persisted.example.com",
        userId: "persisted-user",
      }, null, 2),
    );

    const accounts = resolveWechatAccounts(createChannelConfig());

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      accountId: "bot-im-bot",
      token: "persisted-token",
      baseUrl: "https://persisted.example.com",
      userId: "persisted-user",
    });
  });

  test("activateWechatAccount adds the logged-in account to runtime and starts gateway immediately", async () => {
    const started: string[] = [];
    const stopped: string[] = [];
    const accounts = new Map();

    const result = await activateWechatAccount({
      api: {
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
      } as any,
      channelCfg: createChannelConfig(),
      accounts,
      defaultAccountId: "default",
      account: createResolvedAccount(),
      onMessage: async () => {},
      startGateway: async (runtime) => {
        started.push(runtime.accountId);
      },
      stopGateway: async (runtime) => {
        stopped.push(runtime.accountId);
      },
    });

    expect(stopped).toEqual([]);
    expect(started).toEqual(["bot-im-bot"]);
    expect(result.defaultAccountId).toBe("bot-im-bot");
    expect(accounts.get("bot-im-bot")).toMatchObject({
      accountId: "bot-im-bot",
      token: "bot-token",
      userId: "user-1",
      disposed: false,
    });
  });
});
