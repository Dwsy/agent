import { describe, expect, test } from "bun:test";
import { DeduplicationCache } from "../../dedup-cache.ts";

describe("dedup cache fingerprint", () => {
  test("same prefix different suffix are not deduplicated", () => {
    const cache = new DeduplicationCache({ enabled: true, cacheSize: 100, ttlMs: 60_000 });

    const prefix = "a".repeat(256);
    const msgA = {
      source: {
        senderId: "u1",
        channel: "telegram",
      },
      text: `${prefix}--A`,
    } as any;
    const msgB = {
      source: {
        senderId: "u1",
        channel: "telegram",
      },
      text: `${prefix}--B`,
    } as any;

    expect(cache.isDuplicate(msgA)).toBe(false);
    expect(cache.isDuplicate(msgB)).toBe(false);
  });
});
