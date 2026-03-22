import { describe, expect, test } from "bun:test";
import { getCommandCount, getPluginVersion } from "../../slash-commands.ts";

describe("slash-commands module", () => {
  test("getCommandCount returns number of registered commands", () => {
    const count = getCommandCount();
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe("number");
  });

  test("getPluginVersion returns a semver-like string", () => {
    const version = getPluginVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
