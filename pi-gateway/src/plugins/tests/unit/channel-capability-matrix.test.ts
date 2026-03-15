import { describe, expect, test } from "bun:test";
import type { ChannelPlugin } from "../../types.ts";
import telegramRegister from "../../builtin/telegram/index.ts";
import discordRegister from "../../builtin/discord/index.ts";
import feishuRegister from "../../builtin/feishu/index.ts";
import qqbotRegister from "../../builtin/qqbot/index.ts";
import webchatRegister from "../../builtin/webchat.ts";

function makePlugin(
  id: string,
  label: string,
  matrix: ChannelPlugin["capabilities"]["matrix"],
): ChannelPlugin {
  return {
    id,
    meta: { label },
    capabilities: {
      matrix,
    },
    outbound: {
      sendText: async () => ({ ok: true }),
    },
    async init() {},
    async start() {},
    async stop() {},
  };
}

describe("channel capability matrix declarations", () => {
  test("builtin telegram/discord/feishu/webchat declare matrix", () => {
    const plugins = [telegramRegister, discordRegister, feishuRegister, qqbotRegister, webchatRegister];

    const registry = new Map<string, ChannelPlugin>();
    const fakeApi = {
      registerChannel: (ch: ChannelPlugin) => registry.set(ch.id, ch),
    } as any;

    for (const register of plugins) {
      register(fakeApi);
    }

    for (const id of ["telegram", "discord", "feishu", "qqbot", "webchat"]) {
      const plugin = registry.get(id);
      expect(plugin).toBeDefined();
      expect(plugin?.capabilities.matrix).toBeDefined();
      expect(plugin?.capabilities.matrix?.messaging?.post).toBeTrue();
      expect(plugin?.capabilities.matrix?.messaging?.streaming).toBeDefined();
    }
  });

  test("matrix can explicitly disable features", () => {
    const plugin = makePlugin("mock", "Mock", {
      messaging: { post: true, streaming: "none" },
      conversation: { reactions: "none" },
      richContent: { buttons: "none" },
      history: { fetchMessages: "none" },
    });

    expect(plugin.capabilities.matrix?.conversation?.reactions).toBe("none");
    expect(plugin.capabilities.matrix?.richContent?.buttons).toBe("none");
    expect(plugin.capabilities.matrix?.history?.fetchMessages).toBe("none");
  });
});
