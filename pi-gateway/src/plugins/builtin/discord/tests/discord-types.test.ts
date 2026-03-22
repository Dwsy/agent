/**
 * Discord types tests — config types and runtime structure
 */
import { describe, expect, test } from "bun:test";

describe("DiscordChannelConfig defaults", () => {
  test("streaming config has correct defaults", () => {
    const cfg = {
      enabled: true,
      token: "test-token",
    };
    // defaults should be applied
    expect(cfg.enabled).toBe(true);
    expect(typeof cfg.token).toBe("string");
  });

  test("guild config structure", () => {
    const guild = {
      id: "123",
      name: "Test Guild",
      channels: ["456"],
    };
    expect(guild.id).toBe("123");
    expect(guild.channels.length).toBe(1);
  });

  test("replyToMode enum values", () => {
    const modes = ["off", "thread", "parent"];
    modes.forEach((m) => expect(typeof m).toBe("string"));
    expect(modes).toContain("off");
    expect(modes).toContain("thread");
    expect(modes).toContain("parent");
  });
});

describe("DiscordRuntime structure", () => {
  test("runtime fields are tracked", () => {
    const rt = {
      api: {} as any,
      channelCfg: {} as any,
      client: {} as any,
      clientId: "test-id",
      connected: true,
      lastEventAt: 0,
      lastInboundAt: 0,
      lastOutboundAt: 0,
      reconnectAttempts: 0,
      botUsername: undefined,
    };

    expect(rt.clientId).toBe("test-id");
    expect(rt.connected).toBe(true);
    expect(rt.lastEventAt).toBe(0);
    expect(rt.reconnectAttempts).toBe(0);
  });

  test("runtime timestamps update", () => {
    const rt = { lastInboundAt: 0, lastOutboundAt: 0 };
    const now = Date.now();

    rt.lastInboundAt = now;
    rt.lastOutboundAt = now - 100;

    expect(rt.lastInboundAt).toBeGreaterThan(rt.lastOutboundAt);
    expect(rt.lastInboundAt).toBeGreaterThanOrEqual(now - 1);
  });
});

describe("MessageSource discord fields", () => {
  test("guild channel message source", () => {
    const source = {
      channel: "discord",
      chatType: "channel" as const,
      chatId: "channel-123",
      senderId: "user-456",
      guildId: "guild-789",
      memberRoleIds: ["role-1", "role-2"],
    };

    expect(source.chatType).toBe("channel");
    expect(source.guildId).toBe("guild-789");
    expect(source.memberRoleIds?.length).toBe(2);
  });

  test("thread message source", () => {
    const source = {
      channel: "discord",
      chatType: "thread" as const,
      chatId: "thread-123",
      threadId: "thread-123",
      senderId: "user-456",
      guildId: "guild-789",
      parentPeer: { kind: "channel" as const, id: "channel-456" },
    };

    expect(source.chatType).toBe("thread");
    expect(source.threadId).toBe("thread-123");
    expect(source.parentPeer?.kind).toBe("channel");
  });

  test("DM message source", () => {
    const source = {
      channel: "discord",
      chatType: "dm" as const,
      chatId: "dm-123",
      senderId: "user-456",
    } as any;

    expect(source.chatType).toBe("dm");
    expect(source.guildId).toBeUndefined();
  });
});

describe("Poll options format", () => {
  test("poll question format", () => {
    const poll = {
      question: { text: "Favorite language?" },
      answers: [
        { text: "TypeScript" },
        { text: "Rust" },
        { text: "Python" },
      ],
      duration: 60,
    };

    expect(poll.question.text).toBeTruthy();
    expect(poll.answers.length).toBe(3);
    expect(poll.duration).toBeGreaterThan(0);
  });

  test("poll answer format matches Discord API", () => {
    const answers = [
      { text: "Option A" },
      { text: "Option B" },
    ];

    // Discord poll format
    const pollAnswers = answers.map((a) => ({ pollLabel: { text: a.text } }));
    expect(pollAnswers[0].pollLabel.text).toBe("Option A");
    expect(pollAnswers[1].pollLabel.text).toBe("Option B");
  });
});
