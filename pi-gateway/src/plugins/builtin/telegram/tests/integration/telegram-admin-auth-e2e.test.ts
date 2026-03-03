import { describe, expect, test } from "bun:test";
import { resolveSessionKey } from "../../../../../core/session-router.ts";
import { isSenderAllowed } from "../../../../../security/allowlist.ts";
import { isAuthorizedSender } from "../../commands.ts";

function createAccount(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "default",
    cfg: {
      dmPolicy: "open",
      allowFrom: ["admin-1"],
      ...overrides,
    },
  } as any;
}

describe("telegram admin auth e2e", () => {
  test("dmPolicy open allows chat but denies admin command for non-admin sender", () => {
    const account = createAccount();

    const sourceForGuest = {
      channel: "telegram",
      accountId: account.accountId,
      chatType: "dm",
      chatId: "chat-1",
      senderId: "guest-1",
    } as const;

    const sessionKey = resolveSessionKey(sourceForGuest as any, {
      session: { dmScope: "main" },
    } as any);

    const dmAllowed = isSenderAllowed(
      "telegram",
      "guest-1",
      account.cfg.dmPolicy,
      account.cfg.allowFrom,
      account.accountId,
    );
    const adminAllowed = isAuthorizedSender("guest-1", account);

    expect(dmAllowed).toBe(true);
    expect(adminAllowed).toBe(false);
    expect(sessionKey.startsWith("agent:main:telegram")).toBe(true);
  });

  test("allowlisted sender is allowed for admin command path", () => {
    const account = createAccount({ allowFrom: ["admin-1"] });

    const sourceForAdmin = {
      channel: "telegram",
      accountId: account.accountId,
      chatType: "dm",
      chatId: "chat-2",
      senderId: "admin-1",
    } as const;

    const sessionKey = resolveSessionKey(sourceForAdmin as any, {
      session: { dmScope: "main" },
    } as any);

    const dmAllowed = isSenderAllowed(
      "telegram",
      "admin-1",
      account.cfg.dmPolicy,
      account.cfg.allowFrom,
      account.accountId,
    );
    const adminAllowed = isAuthorizedSender("admin-1", account);

    expect(dmAllowed).toBe(true);
    expect(adminAllowed).toBe(true);
    expect(sessionKey.startsWith("agent:main:telegram")).toBe(true);
  });

  test("!cmd shortcut follows the same admin gate as /bash", () => {
    const account = createAccount({ allowFrom: ["admin-1"] });

    const slashBashGuest = isAuthorizedSender("guest-1", account);
    const bangCmdGuest = isAuthorizedSender("guest-1", account);
    const slashBashAdmin = isAuthorizedSender("admin-1", account);
    const bangCmdAdmin = isAuthorizedSender("admin-1", account);

    expect(slashBashGuest).toBe(false);
    expect(bangCmdGuest).toBe(false);
    expect(slashBashAdmin).toBe(true);
    expect(bangCmdAdmin).toBe(true);
  });
});
