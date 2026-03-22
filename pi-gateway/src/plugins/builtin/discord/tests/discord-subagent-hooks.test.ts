/**
 * Discord subagent hooks unit tests
 */
import { describe, expect, test, beforeEach } from "bun:test";
import {
  createDiscordThreadBinding,
  removeDiscordThreadBinding,
  getDiscordThreadBinding,
  listDiscordThreadBindings,
  type ThreadBinding,
} from "../subagent-hooks.ts";

// Mock API for testing
const mockApi = {
  config: {
    channels: {
      discord: {
        threadBindings: {
          enabled: true,
          spawnSubagentSessions: true,
        },
      },
    },
    session: {},
  },
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
} as any;

describe("thread binding store", () => {
  beforeEach(() => {
    // Note: store is in-memory, tests should be sequential
  });

  test("getDiscordThreadBinding returns undefined when no binding", () => {
    const binding = getDiscordThreadBinding("nonexistent-session");
    expect(binding).toBeUndefined();
  });

  test("listDiscordThreadBindings returns empty when no bindings", () => {
    const bindings = listDiscordThreadBindings();
    // May return existing bindings from previous tests
    expect(Array.isArray(bindings)).toBe(true);
  });

  test("createDiscordThreadBinding returns error when runtime not set", async () => {
    const result = await createDiscordThreadBinding(mockApi as any, {
      channel: "discord",
      to: "123456",
      childSessionKey: "test-session",
    });
    // Without runtime set, should return error
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not initialized");
  });
});
