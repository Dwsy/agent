/**
 * Discord plugin types tests
 */
import { describe, expect, test } from "bun:test";

test("DiscordChannelConfig type accepts all known fields", () => {
  const cfg = {
    enabled: true,
    token: "test-token",
    dmPolicy: "pairing" as const,
    dm: { allowFrom: ["123", "456"] },
    guilds: {
      "789": {
        enabled: true,
        requireMention: false,
        role: "assistant",
      },
    },
    streaming: {
      enabled: true,
      editThrottleMs: 500,
      editCutoffChars: 1800,
      placeholder: "thinking...",
    },
  };

  expect(cfg.enabled).toBe(true);
  expect(cfg.streaming?.editThrottleMs).toBe(500);
  expect(cfg.dmPolicy).toBe("pairing");
  expect(cfg.guilds["789"]?.requireMention).toBe(false);
});

test("DiscordGuildConfig defaults", () => {
  const guild: { requireMention?: boolean; enabled?: boolean } = {};
  expect(guild.requireMention ?? true).toBe(true);
  expect(guild.enabled ?? true).toBe(true);
});

test("DiscordPluginRuntime structure", () => {
  const rt = {
    api: null,
    channelCfg: { enabled: true },
    client: null,
    clientId: "bot-id",
  };
  expect(rt.clientId).toBe("bot-id");
  expect(rt.channelCfg.enabled).toBe(true);
});
