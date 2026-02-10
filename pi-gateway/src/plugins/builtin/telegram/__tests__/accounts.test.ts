import { describe, expect, test } from "bun:test";
import type { TelegramChannelConfig } from "../../../../core/config.ts";
import { resolveDefaultAccountId, resolveTelegramAccounts } from "../accounts.ts";

describe("telegram accounts resolver", () => {
  test("uses top-level token as default account when accounts is empty", () => {
    const cfg: TelegramChannelConfig = {
      enabled: true,
      botToken: "token-top",
    };

    const accounts = resolveTelegramAccounts(cfg);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.accountId).toBe("default");
    expect(accounts[0]?.token).toBe("token-top");
    expect(resolveDefaultAccountId(cfg)).toBe("default");
  });

  test("merges account overrides and backfills default from top-level token", () => {
    const cfg: TelegramChannelConfig = {
      enabled: true,
      botToken: "token-top",
      dmPolicy: "pairing",
      messageMode: "steer",
      accounts: {
        alpha: {
          botToken: "token-alpha",
          dmPolicy: "open",
          allowFrom: ["*"],
          messageMode: "follow-up",
        },
      },
    };

    const accounts = resolveTelegramAccounts(cfg);
    expect(accounts.map((a) => a.accountId)).toEqual(["default", "alpha"]);

    const alpha = accounts.find((a) => a.accountId === "alpha");
    expect(alpha?.cfg.dmPolicy).toBe("open");
    expect(alpha?.cfg.allowFrom).toEqual(["*"]);
    expect(alpha?.cfg.messageMode).toBe("follow-up");

    const def = accounts.find((a) => a.accountId === "default");
    expect(def?.token).toBe("token-top");
    expect(def?.cfg.messageMode).toBe("steer");
  });
});
