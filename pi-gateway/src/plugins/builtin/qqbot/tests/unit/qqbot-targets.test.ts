import { describe, expect, test } from "bun:test";
import { encodeQqbotTarget, parseQqbotTarget } from "../../outbound.ts";

describe("qqbot target encode/parse", () => {
  test("round-trips group target", () => {
    const encoded = encodeQqbotTarget({ peerType: "group", id: "g-1", msgId: "m-1", msgSeq: 2 });
    const parsed = parseQqbotTarget(encoded);
    expect(parsed.peerType).toBe("group");
    expect(parsed.id).toBe("g-1");
    expect(parsed.msgId).toBe("m-1");
    expect(parsed.msgSeq).toBe(2);
  });

  test("round-trips guild target", () => {
    const encoded = encodeQqbotTarget({ peerType: "guild", id: "channel-1", guildId: "guild-1", channelId: "channel-1", eventId: "evt-1" });
    const parsed = parseQqbotTarget(encoded);
    expect(parsed.peerType).toBe("guild");
    expect(parsed.guildId).toBe("guild-1");
    expect(parsed.channelId).toBe("channel-1");
    expect(parsed.eventId).toBe("evt-1");
  });

  test("round-trips dm target", () => {
    const encoded = encodeQqbotTarget({ peerType: "dm", id: "guild-1", guildId: "guild-1", channelId: "channel-9", msgId: "m-9", msgSeq: 3 });
    const parsed = parseQqbotTarget(encoded);
    expect(parsed.peerType).toBe("dm");
    expect(parsed.id).toBe("guild-1");
    expect(parsed.guildId).toBe("guild-1");
    expect(parsed.channelId).toBe("channel-9");
    expect(parsed.msgSeq).toBe(3);
  });

});
