import { describe, expect, test } from "bun:test";
import { normalizeStreamHints } from "../message-send-normalizer.ts";

describe("message send normalizer", () => {
  test("injects transport and streamId into channelMeta", () => {
    const out = normalizeStreamHints({
      streamMode: "draft",
      streamId: 123,
      channelMeta: {},
    });

    expect(out.streamMode).toBe("draft");
    expect(out.streamId).toBe(123);
    expect(out.channelMeta?.transport).toBe("draft");
    expect(out.channelMeta?.streamId).toBe(123);
  });

  test("falls back to legacy stream id", () => {
    const out = normalizeStreamHints({
      streamMode: "draft",
      legacyStreamId: 999,
    });

    expect(out.streamId).toBe(999);
    expect(out.channelMeta?.streamId).toBe(999);
  });

  test("keeps explicit channelMeta streamId", () => {
    const out = normalizeStreamHints({
      streamMode: "draft",
      streamId: 123,
      channelMeta: { streamId: "abc" },
    });

    expect(out.streamId).toBe(123);
    expect(out.channelMeta?.streamId).toBe("abc");
  });
});
