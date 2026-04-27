import { afterEach, describe, expect, test } from "bun:test";
import {
  getSessionStatus,
  handleSessionExpiry,
  resetSessionState,
  resumeSession,
} from "../session.ts";

describe("wechat session expiry state", () => {
  const accountId = "wx-bot-state";

  afterEach(() => {
    resetSessionState(accountId);
  });

  test("escalates pause windows before marking account expired", () => {
    const first = handleSessionExpiry(accountId, -14, undefined);
    expect(first).toMatchObject({ matched: true, state: "paused", delayMs: 30_000, attempts: 1 });
    expect(getSessionStatus(accountId)).toMatchObject({ paused: true, expired: false, expiryCount: 1 });

    resumeSession(accountId);
    const second = handleSessionExpiry(accountId, -14, undefined);
    expect(second).toMatchObject({ matched: true, state: "paused", delayMs: 120_000, attempts: 2 });
    expect(getSessionStatus(accountId)).toMatchObject({ paused: true, expired: false, expiryCount: 2 });

    resumeSession(accountId);
    const third = handleSessionExpiry(accountId, -14, undefined);
    expect(third).toMatchObject({ matched: true, state: "paused", delayMs: 300_000, attempts: 3 });
    expect(getSessionStatus(accountId)).toMatchObject({ paused: true, expired: false, expiryCount: 3 });

    resumeSession(accountId);
    const fourth = handleSessionExpiry(accountId, -14, undefined);
    expect(fourth).toMatchObject({ matched: true, state: "expired", delayMs: 0, attempts: 4 });
    expect(getSessionStatus(accountId)).toMatchObject({ paused: false, expired: true, expiryCount: 4 });
  });

  test("ignores unrelated errors", () => {
    const result = handleSessionExpiry(accountId, -99, undefined);
    expect(result).toMatchObject({ matched: false, state: "ignored" });
    expect(getSessionStatus(accountId)).toMatchObject({ paused: false, expired: false, expiryCount: 0 });
  });
});
