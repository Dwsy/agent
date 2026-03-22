import { describe, expect, test } from "bun:test";
import { isAdmin, resolveAdminOpenIds, getFirstAdmin } from "../../admin-resolver.ts";

function createRuntime(overrides?: Record<string, unknown>): any {
  return {
    api: {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: {},
    },
    channelCfg: {
      enabled: true,
      appId: "123",
      clientSecret: "secret",
      adminIds: ["admin-1", "admin-2"],
      dmPolicy: "open" as const,
      groupPolicy: "open" as const,
    },
    ...overrides,
  };
}

describe("admin-resolver", () => {
  test("isAdmin returns true for admin openid", () => {
    const runtime = createRuntime();
    expect(isAdmin(runtime, "admin-1")).toBeTrue();
    expect(isAdmin(runtime, "admin-2")).toBeTrue();
  });

  test("isAdmin returns false for non-admin openid", () => {
    const runtime = createRuntime();
    expect(isAdmin(runtime, "user-1")).toBeFalse();
    expect(isAdmin(runtime, "")).toBeFalse();
  });

  test("isAdmin returns false when no adminIds configured", () => {
    const runtime = createRuntime({ channelCfg: { ...createRuntime().channelCfg, adminIds: [] } });
    expect(isAdmin(runtime, "admin-1")).toBeFalse();
  });

  test("resolveAdminOpenIds returns configured list", () => {
    const runtime = createRuntime();
    expect(resolveAdminOpenIds(runtime)).toEqual(["admin-1", "admin-2"]);
  });

  test("resolveAdminOpenIds returns empty when none configured", () => {
    const runtime = createRuntime({ channelCfg: { ...createRuntime().channelCfg, adminIds: undefined } });
    expect(resolveAdminOpenIds(runtime)).toEqual([]);
  });

  test("getFirstAdmin returns first admin openid", () => {
    const runtime = createRuntime();
    expect(getFirstAdmin(runtime)).toBe("admin-1");
  });

  test("getFirstAdmin returns undefined when no admins", () => {
    const runtime = createRuntime({ channelCfg: { ...createRuntime().channelCfg, adminIds: [] } });
    expect(getFirstAdmin(runtime)).toBeUndefined();
  });
});
