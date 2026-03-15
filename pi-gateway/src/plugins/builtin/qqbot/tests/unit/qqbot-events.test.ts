import { describe, expect, test } from "bun:test";
import { parseQqbotEvent, parseQqbotInteraction } from "../../handlers.ts";

describe("qqbot event parsing", () => {
  test("parses c2c event", () => {
    const parsed = parseQqbotEvent("C2C_MESSAGE_CREATE", {
      id: "msg-1",
      content: "hello",
      author: { user_openid: "u-1", username: "alice" },
    });
    expect(parsed?.peerType).toBe("c2c");
    expect(parsed?.chatType).toBe("dm");
    expect(parsed?.chatId).toBe("u-1");
    expect(parsed?.text).toBe("hello");
  });

  test("parses group at event", () => {
    const parsed = parseQqbotEvent("GROUP_AT_MESSAGE_CREATE", {
      id: "msg-2",
      content: "<@123> hi group",
      group_openid: "group-1",
      author: { member_openid: "member-1", username: "bob" },
    });
    expect(parsed?.peerType).toBe("group");
    expect(parsed?.chatType).toBe("group");
    expect(parsed?.chatId).toBe("group-1");
    expect(parsed?.text).toBe("hi group");
  });

  test("parses direct message event as channel-scoped dm", () => {
    const parsed = parseQqbotEvent("DIRECT_MESSAGE_CREATE", {
      id: "msg-3",
      event_id: "evt-3",
      guild_id: "guild-1",
      channel_id: "channel-1",
      content: "hello dm",
      author: { id: "user-1", username: "carol" },
    });
    expect(parsed?.peerType).toBe("dm");
    expect(parsed?.chatType).toBe("channel");
    expect(parsed?.chatId).toBe("channel-1");
    expect(parsed?.guildId).toBe("guild-1");
    expect(parsed?.channelId).toBe("channel-1");
  });

  test("parses interaction create event for group keyboard callback", () => {
    const parsed = parseQqbotInteraction("INTERACTION_CREATE", {
      id: "interaction-1",
      scene: "group",
      group_openid: "group-1",
      group_member_openid: "member-1",
      data: {
        type: 11,
        resolved: {
          button_data: "kb:k1:opt-1",
          button_id: "1-1",
        },
      },
    });
    expect(parsed?.interactionId).toBe("interaction-1");
    expect(parsed?.chatType).toBe("group");
    expect(parsed?.chatId).toBe("group-1");
    expect(parsed?.senderId).toBe("member-1");
    expect(parsed?.buttonData).toBe("kb:k1:opt-1");
  });
});
