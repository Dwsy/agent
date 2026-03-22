import { describe, expect, test } from "bun:test";
import { normalizeQqbotTarget } from "../../outbound.ts";
import { formatVoiceText } from "../../inbound-attachments.ts";

describe("normalizeQqbotTarget", () => {
  test("sets msgSeq to 1 when passive with msgId but no seq", () => {
    const result = normalizeQqbotTarget({ peerType: "group", id: "g-1", msgId: "m-1" });
    expect(result.msgSeq).toBe(1);
  });

  test("sets msgSeq to 1 when passive with eventId but no seq", () => {
    const result = normalizeQqbotTarget({ peerType: "c2c", id: "u-1", eventId: "e-1" });
    expect(result.msgSeq).toBe(1);
  });

  test("keeps existing msgSeq when passive", () => {
    const result = normalizeQqbotTarget({ peerType: "group", id: "g-1", msgId: "m-1", msgSeq: 5 });
    expect(result.msgSeq).toBe(5);
  });

  test("clears msgSeq when not passive (no msgId/eventId)", () => {
    const result = normalizeQqbotTarget({ peerType: "c2c", id: "u-1", msgSeq: 3 });
    expect(result.msgSeq).toBeUndefined();
  });

  test("preserves all other target fields", () => {
    const input = { peerType: "guild" as const, id: "ch-1", guildId: "g-1", channelId: "ch-1" };
    const result = normalizeQqbotTarget(input);
    expect(result.peerType).toBe("guild");
    expect(result.id).toBe("ch-1");
    expect(result.guildId).toBe("g-1");
    expect(result.channelId).toBe("ch-1");
  });
});

describe("formatVoiceText", () => {
  test("returns empty string for no transcripts", () => {
    expect(formatVoiceText([])).toBe("");
  });

  test("filters falsy values", () => {
    expect(formatVoiceText(["hello", "", "world"])).toBe("🎤 hello\n🎤 world");
  });

  test("formats single transcript with emoji prefix", () => {
    expect(formatVoiceText(["hello"])).toBe("🎤 hello");
  });

  test("joins multiple transcripts with newlines", () => {
    expect(formatVoiceText(["first", "second", "third"])).toBe("🎤 first\n🎤 second\n🎤 third");
  });
});
