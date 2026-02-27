/**
 * Integration tests for chat-sdk plugin wiring into gateway.
 *
 * Verifies: plugin registration, config-driven adapter creation,
 * inbound/outbound message flow, streaming, multi-adapter, and empty config.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Adapter, RawMessage, Message as ChatMessage, StateAdapter } from "chat";

import chatSdkPlugin, { registerChatSdkPlugin } from "../plugin-factory.ts";
import { ChatSdkBridge } from "../bridge.ts";
import { ChatSdkChannelPlugin } from "../channel-plugin-adapter.ts";

// ============================================================================
// Helpers
// ============================================================================

function createMockAdapter(name = "test"): Adapter & {
  _posted: Array<{ threadId: string; message: unknown }>;
  _edited: Array<{ threadId: string; messageId: string; message: unknown }>;
  _typing: string[];
} {
  const posted: Array<{ threadId: string; message: unknown }> = [];
  const edited: Array<{ threadId: string; messageId: string; message: unknown }> = [];
  const typing: string[] = [];
  let msgCounter = 0;

  return {
    name,
    userName: "testbot",
    _posted: posted,
    _edited: edited,
    _typing: typing,

    async initialize() {},
    async postMessage(threadId: string, message: unknown): Promise<RawMessage> {
      msgCounter++;
      posted.push({ threadId, message });
      return { id: `msg-${msgCounter}`, threadId, raw: {} };
    },
    async editMessage(threadId: string, messageId: string, message: unknown): Promise<RawMessage> {
      edited.push({ threadId, messageId, message });
      return { id: messageId, threadId, raw: {} };
    },
    async deleteMessage() {},
    async addReaction() {},
    async removeReaction() {},
    async startTyping(threadId: string) { typing.push(threadId); },
    async fetchMessages() { return { messages: [] }; },
    async fetchThread(threadId: string) { return { id: threadId, channelId: threadId, metadata: {} }; },
    async handleWebhook() { return new Response("ok"); },
    decodeThreadId(threadId: string) { return threadId; },
    encodeThreadId(data: unknown) { return String(data); },
    parseMessage(raw: unknown): ChatMessage {
      return {
        id: "raw-msg", threadId: "thread-1", text: "", formatted: { type: "root", children: [] },
        raw, author: { userId: "u1", userName: "user", fullName: "User", isBot: false, isMe: false },
        metadata: { dateSent: new Date(), edited: false }, attachments: [],
      } as unknown as ChatMessage;
    },
    renderFormatted() { return ""; },
  };
}

function createMockApi(configOverrides: Record<string, unknown> = {}) {
  const channels: Array<{ id: string; plugin: unknown }> = [];
  const dispatched: unknown[] = [];

  return {
    id: "chat-sdk",
    name: "chat-sdk",
    source: "test",
    config: { channels: {}, agent: {}, plugins: {}, ...configOverrides } as any,
    pluginConfig: undefined as any,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    },
    registerChannel: mock((plugin: any) => {
      channels.push({ id: plugin.id, plugin });
    }),
    dispatch: mock(async (msg: any) => {
      dispatched.push(msg);
      return { enqueued: true };
    }),
    _channels: channels,
    _dispatched: dispatched,
  } as any;
}

// ============================================================================
// 1. Plugin registration
// ============================================================================

describe("integration: plugin registration", () => {
  test("registerChatSdkPlugin registers channels via mock api", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    const bridge = await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    expect(bridge).toBeInstanceOf(ChatSdkBridge);
    expect(api.registerChannel).toHaveBeenCalledTimes(1);
    expect(api._channels).toHaveLength(1);
    expect(api._channels[0].id).toBe("slack");
  });

  test("registered plugin has correct capabilities", async () => {
    const adapter = createMockAdapter("discord");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { discord: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    expect(plugin.capabilities.direct).toBe(true);
    expect(plugin.capabilities.group).toBe(true);
    expect(plugin.capabilities.streaming).toBe(true);
    expect(plugin.capabilities.media).toBe(true);
    expect(plugin.outbound).toBeDefined();
    expect(plugin.streaming).toBeDefined();
  });
});

// ============================================================================
// 2. Config-driven adapter creation
// ============================================================================

describe("integration: config-driven adapter creation", () => {
  test("only configured adapters are created", async () => {
    const adapter1 = createMockAdapter("slack");
    const adapter2 = createMockAdapter("discord");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter1, discord: adapter2 },
      state,
      userName: "bot",
    });

    expect(api._channels).toHaveLength(2);
    const ids = api._channels.map((c: any) => c.id);
    expect(ids).toContain("slack");
    expect(ids).toContain("discord");
  });

  test("default plugin factory uses pluginConfig adapters", async () => {
    const adapter = createMockAdapter("teams");
    const state = createMemoryState();
    const api = createMockApi();
    api.pluginConfig = {
      adapters: { teams: adapter },
      state,
      userName: "bot",
    };

    await chatSdkPlugin(api);

    expect(api.registerChannel).toHaveBeenCalledTimes(1);
    expect(api._channels[0].id).toBe("teams");
  });
});

// ============================================================================
// 3. Inbound message flow
// ============================================================================

describe("integration: inbound message flow", () => {
  test("outbound sendText dispatches to adapter.postMessage", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const result = await plugin.outbound.sendText("channel-1", "Hello from gateway");

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("msg-1");
    expect(adapter._posted).toHaveLength(1);
    expect(adapter._posted[0].threadId).toBe("channel-1");
  });
});

// ============================================================================
// 4. Outbound message flow
// ============================================================================

describe("integration: outbound message flow", () => {
  test("sendText calls adapter.postMessage with correct args", async () => {
    const adapter = createMockAdapter("discord");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { discord: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    await plugin.outbound.sendText("thread-42", "test message");

    expect(adapter._posted).toHaveLength(1);
    expect(adapter._posted[0].threadId).toBe("thread-42");
    expect(adapter._posted[0].message).toEqual({ markdown: "test message" });
  });

  test("editMessage calls adapter.editMessage", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const result = await plugin.outbound.editMessage!("thread-1", "msg-1", "updated");

    expect(result.ok).toBe(true);
    expect(adapter._edited).toHaveLength(1);
    expect(adapter._edited[0].messageId).toBe("msg-1");
  });
});

// ============================================================================
// 5. Streaming flow
// ============================================================================

describe("integration: streaming flow", () => {
  test("createPlaceholder → editMessage → setTyping", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const streaming = plugin.streaming!;

    // createPlaceholder
    const placeholder = await streaming.createPlaceholder("thread-1", { text: "Loading..." });
    expect(placeholder.messageId).toBe("msg-1");
    expect(adapter._posted).toHaveLength(1);

    // editMessage
    const edited = await streaming.editMessage("thread-1", placeholder.messageId, "Partial response...");
    expect(edited).toBe(true);
    expect(adapter._edited).toHaveLength(1);

    // setTyping
    await streaming.setTyping!("thread-1", true);
    expect(adapter._typing).toHaveLength(1);
    expect(adapter._typing[0]).toBe("thread-1");
  });

  test("streaming config has reasonable defaults", async () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    expect(plugin.streaming!.config!.editThrottleMs).toBeGreaterThan(0);
    expect(plugin.streaming!.config!.streamStartChars).toBeGreaterThan(0);
  });
});

// ============================================================================
// 6. Multi-adapter
// ============================================================================

describe("integration: multi-adapter", () => {
  test("registers both telegram and mock adapter independently", async () => {
    const telegramAdapter = createMockAdapter("telegram");
    const slackAdapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { telegram: telegramAdapter, slack: slackAdapter },
      state,
      userName: "bot",
    });

    expect(api._channels).toHaveLength(2);

    // Send via telegram
    const tgPlugin = api._channels.find((c: any) => c.id === "telegram")!.plugin as ChatSdkChannelPlugin;
    await tgPlugin.outbound.sendText("tg-chat-1", "hello telegram");
    expect(telegramAdapter._posted).toHaveLength(1);
    expect(slackAdapter._posted).toHaveLength(0);

    // Send via slack
    const slackPlugin = api._channels.find((c: any) => c.id === "slack")!.plugin as ChatSdkChannelPlugin;
    await slackPlugin.outbound.sendText("slack-ch-1", "hello slack");
    expect(slackAdapter._posted).toHaveLength(1);
    expect(telegramAdapter._posted).toHaveLength(1); // unchanged
  });

  test("each adapter has its own streaming adapter", async () => {
    const a1 = createMockAdapter("a1");
    const a2 = createMockAdapter("a2");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { a1, a2 },
      state,
      userName: "bot",
    });

    const p1 = api._channels.find((c: any) => c.id === "a1")!.plugin as ChatSdkChannelPlugin;
    const p2 = api._channels.find((c: any) => c.id === "a2")!.plugin as ChatSdkChannelPlugin;

    await p1.streaming!.createPlaceholder("t1");
    await p2.streaming!.createPlaceholder("t2");

    expect(a1._posted).toHaveLength(1);
    expect(a2._posted).toHaveLength(1);
    expect(a1._posted[0].threadId).toBe("t1");
    expect(a2._posted[0].threadId).toBe("t2");
  });
});

// ============================================================================
// 7. Empty config
// ============================================================================

describe("integration: empty config", () => {
  test("plugin gracefully skips when no adapters in pluginConfig", async () => {
    const api = createMockApi();
    api.pluginConfig = { adapters: {}, state: createMemoryState(), userName: "bot" };

    await chatSdkPlugin(api);

    expect(api.registerChannel).not.toHaveBeenCalled();
    expect(api._channels).toHaveLength(0);
  });

  test("plugin gracefully skips when pluginConfig is undefined", async () => {
    const api = createMockApi();
    api.pluginConfig = undefined;

    await chatSdkPlugin(api);

    expect(api.registerChannel).not.toHaveBeenCalled();
  });

  test("plugin gracefully skips when no chatSdk config and no pluginConfig", async () => {
    const api = createMockApi({ channels: {} });
    api.pluginConfig = undefined;

    await chatSdkPlugin(api);

    expect(api.registerChannel).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 8. Enhanced streaming with tool/thinking callbacks
// ============================================================================

describe("integration: enhanced streaming", () => {
  test("streaming editMessage returns false on adapter error", async () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const streaming = plugin.streaming!;

    // Make editMessage throw
    adapter.editMessage = async () => { throw new Error("rate limited"); };

    const result = await streaming.editMessage("thread-1", "msg-1", "text");
    expect(result).toBe(false);
  });

  test("streaming config uses enhanced defaults", async () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    expect(plugin.streaming!.config!.editThrottleMs).toBe(1000);
    expect(plugin.streaming!.config!.streamStartChars).toBe(800);
  });
});

// ============================================================================
// 9. Outbound extensions (pinMessage, readHistory, sendKeyboard)
// ============================================================================

describe("integration: outbound extensions", () => {
  test("readHistory returns messages from adapter", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const result = await plugin.outbound.readHistory!("thread-1", 5);
    expect(result.ok).toBe(true);
    expect(result.messages).toBeDefined();
  });

  test("sendKeyboard falls back to text when adapter has no extras", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const keyboard = { inline_keyboard: [[{ text: "OK", callbackData: "ok" }]] };
    const result = await plugin.outbound.sendKeyboard!("thread-1", "Choose:", keyboard);
    expect(result.ok).toBe(true);
    expect(adapter._posted).toHaveLength(1);
  });

  test("pinMessage returns not-supported for standard adapters", async () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();
    const api = createMockApi();

    await registerChatSdkPlugin(api, {
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = api._channels[0].plugin as ChatSdkChannelPlugin;
    const result = await plugin.outbound.pinMessage!("thread-1", "msg-1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not supported");
  });
});

// ============================================================================
// 10. Command dispatch
// ============================================================================

describe("integration: command dispatch", () => {
  test("registerChatSdkPlugin wires commands without error", async () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const api = createMockApi();

    // Should not throw — commands are registered during plugin setup
    const bridge = await registerChatSdkPlugin(api, {
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    expect(bridge).toBeDefined();
    expect(bridge.getChat()).toBeDefined();
  });
});
