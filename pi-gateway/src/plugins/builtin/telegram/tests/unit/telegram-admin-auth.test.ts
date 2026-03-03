import { describe, expect, test } from "bun:test";
import { isAdminSenderAllowed, isSenderAllowed } from "../../../../../security/allowlist.ts";

describe("telegram admin auth", () => {
  test("dmPolicy open does not grant admin commands", () => {
    const dmAllowed = isSenderAllowed("telegram", "guest", "open", []);
    const adminAllowed = isAdminSenderAllowed("telegram", "guest", []);

    expect(dmAllowed).toBe(true);
    expect(adminAllowed).toBe(false);
  });

  test("allowlisted sender can run admin commands", () => {
    const adminAllowed = isAdminSenderAllowed("telegram", "admin-1", ["admin-1"]);
    expect(adminAllowed).toBe(true);
  });

  test("!cmd follows admin auth gate", () => {
    const guestAllowed = isAdminSenderAllowed("telegram", "guest-1", ["admin-1"]);
    const adminAllowed = isAdminSenderAllowed("telegram", "admin-1", ["admin-1"]);

    expect(guestAllowed).toBe(false);
    expect(adminAllowed).toBe(true);
  });
});
