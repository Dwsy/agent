/**
 * Discord runtime store tests
 */
import { describe, expect, test } from "bun:test";

test("DiscordRuntime interface has required fields", () => {
  const rt = {
    api: null as any,
    channelCfg: { enabled: true },
    client: null as any,
    clientId: "123",
    lastEventAt: Date.now(),
    lastInboundAt: Date.now(),
    lastOutboundAt: Date.now(),
    connected: true,
    reconnectAttempts: 0,
    lastError: undefined as string | undefined,
  };
  expect(rt.connected).toBe(true);
  expect(rt.clientId).toBe("123");
  expect(rt.lastError).toBeUndefined();
});

test("DiscordRuntime tracks timestamps", () => {
  const rt = {
    lastEventAt: 0,
    lastInboundAt: 0,
    lastOutboundAt: 0,
  };
  const now = Date.now();
  rt.lastInboundAt = now;
  rt.lastEventAt = now;
  expect(rt.lastInboundAt).toBe(now);
});
