/**
 * v3.5 Security tests: allowlist.ts + pairing.ts
 *
 * Covers:
 * - isSenderAllowed: 4 DM policies (open/disabled/allowlist/pairing)
 * - approveSender / revokeSender + persisted allowlist
 * - createPairingRequest: generation, dedup, expiry cleanup, max pending cap
 * - approvePairingRequest: approve, expiry rejection, case-insensitive code
 * - listPendingRequests: per-channel and cross-channel
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to override CREDENTIALS_DIR before importing modules.
// Both allowlist.ts and pairing.ts use a module-level const derived from homedir().
// Strategy: use a temp dir and patch the file paths by importing the functions
// and testing them with accountId-scoped keys that write to a known location.
//
// Since CREDENTIALS_DIR is not exported, we'll monkey-patch homedir() via Bun's mock.

import { mock } from "bun:test";

const TEST_HOME = join(tmpdir(), `pi-gw-security-test-${Date.now()}`);
const TEST_CREDS_DIR = join(TEST_HOME, ".pi", "gateway", "credentials");

// Mock homedir before importing modules
mock.module("node:os", () => ({
  homedir: () => TEST_HOME,
  tmpdir,
  platform: () => process.platform,
}));

// Now import — they'll use our mocked homedir
const { isSenderAllowed, approveSender, revokeSender, getPersistedAllowlist } = await import("./allowlist.ts");
const { createPairingRequest, approvePairingRequest, listPendingRequests } = await import("./pairing.ts");

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  mkdirSync(TEST_CREDS_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// ============================================================================
// allowlist.ts — isSenderAllowed
// ============================================================================

describe("isSenderAllowed", () => {
  test("open policy allows anyone", () => {
    expect(isSenderAllowed("telegram", "user123", "open")).toBe(true);
    expect(isSenderAllowed("telegram", "unknown", "open")).toBe(true);
  });

  test("disabled policy blocks everyone", () => {
    expect(isSenderAllowed("telegram", "user123", "disabled")).toBe(false);
    expect(isSenderAllowed("telegram", "admin", "disabled", ["admin"])).toBe(false);
  });

  test("allowlist policy allows config allowFrom", () => {
    expect(isSenderAllowed("telegram", "user1", "allowlist", ["user1", "user2"])).toBe(true);
    expect(isSenderAllowed("telegram", "user3", "allowlist", ["user1", "user2"])).toBe(false);
  });

  test("allowlist policy allows wildcard *", () => {
    expect(isSenderAllowed("telegram", "anyone", "allowlist", ["*"])).toBe(true);
  });

  test("allowlist policy allows persisted sender", () => {
    approveSender("telegram", "approved-user", "acc1");
    expect(isSenderAllowed("telegram", "approved-user", "allowlist", [], "acc1")).toBe(true);
    expect(isSenderAllowed("telegram", "other-user", "allowlist", [], "acc1")).toBe(false);
  });

  test("allowlist policy coerces numeric IDs to string", () => {
    expect(isSenderAllowed("telegram", "12345", "allowlist", [12345])).toBe(true);
  });

  test("pairing policy allows config allowFrom", () => {
    expect(isSenderAllowed("telegram", "admin", "pairing", ["admin"])).toBe(true);
  });

  test("pairing policy allows persisted sender", () => {
    approveSender("discord", "paired-user", "acc1");
    expect(isSenderAllowed("discord", "paired-user", "pairing", [], "acc1")).toBe(true);
  });

  test("pairing policy blocks unknown sender", () => {
    expect(isSenderAllowed("telegram", "stranger", "pairing", ["admin"])).toBe(false);
  });

  test("unknown policy defaults to false", () => {
    expect(isSenderAllowed("telegram", "user", "unknown-policy" as any)).toBe(false);
  });
});

// ============================================================================
// allowlist.ts — approveSender / revokeSender
// ============================================================================

describe("approveSender / revokeSender", () => {
  test("approveSender persists to file", () => {
    approveSender("telegram", "user-a", "default");
    const list = getPersistedAllowlist("telegram", "default");
    expect(list).toContain("user-a");
  });

  test("approveSender is idempotent", () => {
    approveSender("telegram", "user-b", "default");
    approveSender("telegram", "user-b", "default");
    const list = getPersistedAllowlist("telegram", "default");
    expect(list.filter((id: string) => id === "user-b").length).toBe(1);
  });

  test("revokeSender removes from persisted list", () => {
    approveSender("telegram", "user-c", "default");
    expect(getPersistedAllowlist("telegram", "default")).toContain("user-c");
    revokeSender("telegram", "user-c", "default");
    expect(getPersistedAllowlist("telegram", "default")).not.toContain("user-c");
  });

  test("account scoping isolates allowlists", () => {
    approveSender("telegram", "user-d", "account-1");
    approveSender("telegram", "user-e", "account-2");
    expect(getPersistedAllowlist("telegram", "account-1")).toContain("user-d");
    expect(getPersistedAllowlist("telegram", "account-1")).not.toContain("user-e");
    expect(getPersistedAllowlist("telegram", "account-2")).toContain("user-e");
  });

  test("legacy migration reads channel-level file for default account", () => {
    // Write a legacy (unscoped) allowlist file
    const legacyPath = join(TEST_CREDS_DIR, "telegram-allowFrom.json");
    writeFileSync(legacyPath, JSON.stringify(["legacy-user"]), "utf-8");
    const list = getPersistedAllowlist("telegram", "default");
    expect(list).toContain("legacy-user");
    // Should have migrated to scoped file
    const scopedPath = join(TEST_CREDS_DIR, "telegram__default-allowFrom.json");
    expect(existsSync(scopedPath)).toBe(true);
  });
});

// ============================================================================
// pairing.ts — createPairingRequest
// ============================================================================

describe("createPairingRequest", () => {
  test("generates 8-char uppercase code", () => {
    const code = createPairingRequest("telegram", "sender1", "Alice", "default");
    expect(code).not.toBeNull();
    expect(code!.length).toBe(8);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  test("returns same code for same sender (dedup)", () => {
    const code1 = createPairingRequest("telegram", "sender2", "Bob", "default");
    const code2 = createPairingRequest("telegram", "sender2", "Bob", "default");
    expect(code1).toBe(code2);
  });

  test("returns null when max pending reached", () => {
    createPairingRequest("telegram", "s1", undefined, "default");
    createPairingRequest("telegram", "s2", undefined, "default");
    createPairingRequest("telegram", "s3", undefined, "default");
    const code = createPairingRequest("telegram", "s4", undefined, "default");
    expect(code).toBeNull();
  });

  test("expired requests are cleaned on create", () => {
    // Manually write an expired request
    const scopedPath = join(TEST_CREDS_DIR, "telegram__default-pairing.json");
    const expired = [{
      code: "EXPIRED1",
      senderId: "old-sender",
      channel: "telegram",
      createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    }];
    writeFileSync(scopedPath, JSON.stringify(expired), "utf-8");

    // Create new request — should clean expired and succeed
    const code = createPairingRequest("telegram", "new-sender", undefined, "default");
    expect(code).not.toBeNull();

    // Verify expired was cleaned
    const data = JSON.parse(readFileSync(scopedPath, "utf-8"));
    expect(data.find((r: any) => r.senderId === "old-sender")).toBeUndefined();
    expect(data.find((r: any) => r.senderId === "new-sender")).toBeDefined();
  });

  test("different channels have independent limits", () => {
    createPairingRequest("telegram", "t1", undefined, "default");
    createPairingRequest("telegram", "t2", undefined, "default");
    createPairingRequest("telegram", "t3", undefined, "default");
    // Telegram full, but discord should still work
    const code = createPairingRequest("discord", "d1", undefined, "default");
    expect(code).not.toBeNull();
  });
});

// ============================================================================
// pairing.ts — approvePairingRequest
// ============================================================================

describe("approvePairingRequest", () => {
  test("approves valid code and adds to allowlist", () => {
    const code = createPairingRequest("telegram", "pending-user", "Charlie", "default")!;
    const senderId = approvePairingRequest("telegram", code, "default");
    expect(senderId).toBe("pending-user");
    // Should now be in allowlist
    expect(isSenderAllowed("telegram", "pending-user", "pairing", [], "default")).toBe(true);
  });

  test("returns null for unknown code", () => {
    const result = approvePairingRequest("telegram", "NONEXIST", "default");
    expect(result).toBeNull();
  });

  test("rejects expired code", () => {
    // Write an expired pairing request
    const scopedPath = join(TEST_CREDS_DIR, "telegram__default-pairing.json");
    const expired = [{
      code: "EXPCODE1",
      senderId: "expired-sender",
      channel: "telegram",
      createdAt: Date.now() - 2 * 60 * 60 * 1000,
    }];
    writeFileSync(scopedPath, JSON.stringify(expired), "utf-8");

    const result = approvePairingRequest("telegram", "EXPCODE1", "default");
    expect(result).toBeNull();
    // Should NOT be in allowlist
    expect(isSenderAllowed("telegram", "expired-sender", "pairing", [], "default")).toBe(false);
  });

  test("code matching is case-insensitive", () => {
    const code = createPairingRequest("telegram", "case-user", undefined, "default")!;
    const result = approvePairingRequest("telegram", code.toLowerCase(), "default");
    expect(result).toBe("case-user");
  });

  test("removes approved request from pending list", () => {
    const code = createPairingRequest("discord", "approve-me", undefined, "default")!;
    approvePairingRequest("discord", code, "default");
    const pending = listPendingRequests("discord", "default");
    expect(pending.find((r) => r.senderId === "approve-me")).toBeUndefined();
  });
});

// ============================================================================
// pairing.ts — listPendingRequests
// ============================================================================

describe("listPendingRequests", () => {
  test("returns empty for channel with no requests", () => {
    expect(listPendingRequests("telegram", "default")).toEqual([]);
  });

  test("returns pending requests for specific channel", () => {
    createPairingRequest("telegram", "p1", "Alice", "default");
    createPairingRequest("telegram", "p2", "Bob", "default");
    const pending = listPendingRequests("telegram", "default");
    expect(pending.length).toBe(2);
    expect(pending.map((r) => r.senderId)).toContain("p1");
    expect(pending.map((r) => r.senderId)).toContain("p2");
  });

  test("cross-channel list returns all pending", () => {
    createPairingRequest("telegram", "t-user", undefined, "default");
    createPairingRequest("discord", "d-user", undefined, "default");
    const all = listPendingRequests();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
