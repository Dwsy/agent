import { describe, expect, test } from "bun:test";
import { resolveModelForSessionAndAgent } from "../../session-router.ts";
import type { MessageSource } from "../../types.ts";

function createBaseConfig(): any {
  return {
    agent: { model: undefined },
    channels: {},
    agents: { list: [], default: "main" },
  };
}

describe("model routing", () => {
  test("telegram: topic > group > account > channel > global", () => {
    const config = createBaseConfig();
    config.agent.model = "global/default";
    config.channels.telegram = {
      enabled: true,
      model: "tg/channel",
      accounts: {
        zero: {
          enabled: true,
          model: "tg/account",
          groups: {
            "-1001": {
              model: "tg/group",
              topics: {
                "77": { model: "tg/topic" },
              },
            },
          },
        },
      },
    };

    const source: MessageSource = {
      channel: "telegram",
      accountId: "zero",
      chatType: "group",
      chatId: "-1001",
      topicId: "77",
      senderId: "u1",
    };

    const resolved = resolveModelForSessionAndAgent(source, config);
    expect(resolved.model).toBe("tg/topic");
    expect(resolved.source).toBe("telegram.topic");
  });

  test("telegram: same account different groups can route different models", () => {
    const config = createBaseConfig();
    config.agent.model = "global/default";
    config.channels.telegram = {
      enabled: true,
      accounts: {
        zero: {
          enabled: true,
          groups: {
            "-100A": { model: "model/A" },
            "-100B": { model: "model/B" },
          },
        },
      },
    };

    const sourceA: MessageSource = {
      channel: "telegram",
      accountId: "zero",
      chatType: "group",
      chatId: "-100A",
      senderId: "u1",
    };
    const sourceB: MessageSource = {
      channel: "telegram",
      accountId: "zero",
      chatType: "group",
      chatId: "-100B",
      senderId: "u1",
    };

    expect(resolveModelForSessionAndAgent(sourceA, config).model).toBe("model/A");
    expect(resolveModelForSessionAndAgent(sourceB, config).model).toBe("model/B");
  });

  test("discord: channel > guild > channel-default > global", () => {
    const config = createBaseConfig();
    config.agent.model = "global/default";
    config.channels.discord = {
      enabled: true,
      model: "discord/default",
      guilds: {
        g1: {
          model: "discord/guild",
          channels: {
            c1: { model: "discord/channel" },
          },
        },
      },
    };

    const source: MessageSource = {
      channel: "discord",
      guildId: "g1",
      chatType: "channel",
      chatId: "c1",
      senderId: "u1",
    };

    const resolved = resolveModelForSessionAndAgent(source, config);
    expect(resolved.model).toBe("discord/channel");
    expect(resolved.source).toBe("discord.channel");
  });

  test("fallback: agent model overrides global", () => {
    const config = createBaseConfig();
    config.agent.model = "global/default";
    config.agents = {
      list: [{ id: "ops", workspace: "~/ops", model: "agent/ops" }],
      default: "ops",
    };

    const source: MessageSource = {
      channel: "webchat",
      chatType: "dm",
      chatId: "tab1",
      senderId: "u1",
      agentId: "ops",
    };

    const resolved = resolveModelForSessionAndAgent(source, config, "ops");
    expect(resolved.model).toBe("agent/ops");
    expect(resolved.source).toBe("agent.model");
  });
});
