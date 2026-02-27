/**
 * Tests for chat-sdk ↔ pi-gateway bridge layer.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { Adapter, RawMessage, Message as ChatMessage, StateAdapter } from "chat";

import { ChatSdkBridge, type ChatSdkBridgeConfig } from "../bridge.ts";
import { ChatSdkChannelPlugin } from "../channel-plugin-adapter.ts";
import { GatewayStateAdapter } from "../state-adapter.ts";
import {
  buildSessionKey,
  toInboundMessage,
  toMessageSource,
  toPostableMessage,
  extractImages,
  createStreamingCallbacks,
  buildStreamingText,
  formatToolLine,
} from "../message-mapper.ts";
import { registerChatSdkPlugin } from "../plugin-factory.ts";
import { registerChatSdkCommands, getRegisteredCommands } from "../commands.ts";

// ============================================================================
// Mock Adapter
// ============================================================================

function createMockAdapter(name = "test"): Adapter & {
  _posted: Array<{ threadId: string; message: unknown }>;
  _edited: Array<{ threadId: string; messageId: string; message: unknown }>;
  _deleted: Array<{ threadId: string; messageId: string }>;
  _reactions: Array<{ threadId: string; messageId: string; emoji: string }>;
  _typing: string[];
} {
  const posted: Array<{ threadId: string; message: unknown }> = [];
  const edited: Array<{ threadId: string; messageId: string; message: unknown }> = [];
  const deleted: Array<{ threadId: string; messageId: string }> = [];
  const reactions: Array<{ threadId: string; messageId: string; emoji: string }> = [];
  const typing: string[] = [];

  let msgCounter = 0;

  return {
    name,
    userName: "testbot",
    _posted: posted,
    _edited: edited,
    _deleted: deleted,
    _reactions: reactions,
    _typing: typing,

    async initialize() {},

    async postMessage(threadId: string, message: unknown): Promise<RawMessage> {
      msgCounter++;
      const id = `msg-${msgCounter}`;
      posted.push({ threadId, message });
      return { id, threadId, raw: {} };
    },

    async editMessage(threadId: string, messageId: string, message: unknown): Promise<RawMessage> {
      edited.push({ threadId, messageId, message });
      return { id: messageId, threadId, raw: {} };
    },

    async deleteMessage(threadId: string, messageId: string): Promise<void> {
      deleted.push({ threadId, messageId });
    },

    async addReaction(threadId: string, messageId: string, emoji: string): Promise<void> {
      reactions.push({ threadId, messageId, emoji: String(emoji) });
    },

    async removeReaction(): Promise<void> {},

    async startTyping(threadId: string): Promise<void> {
      typing.push(threadId);
    },

    async fetchMessages() {
      return { messages: [] };
    },

    async fetchThread(threadId: string) {
      return { id: threadId, channelId: threadId, metadata: {} };
    },

    async handleWebhook() {
      return new Response("ok");
    },

    decodeThreadId(threadId: string) {
      return threadId;
    },

    encodeThreadId(data: unknown) {
      return String(data);
    },

    parseMessage(raw: unknown): ChatMessage {
      return {
        id: "raw-msg",
        threadId: "thread-1",
        text: "",
        formatted: { type: "root", children: [] },
        raw,
        author: { userId: "u1", userName: "user", fullName: "User", isBot: false, isMe: false },
        metadata: { dateSent: new Date(), edited: false },
        attachments: [],
      } as unknown as ChatMessage;
    },

    renderFormatted() {
      return "";
    },
  };
}

// ============================================================================
// Mock Thread / Message
// ============================================================================

function createMockThread(adapterName = "test", threadId = "thread-1", isDM = true) {
  const adapter = createMockAdapter(adapterName);
  return {
    id: threadId,
    channelId: threadId,
    isDM,
    adapter,
    subscribe: mock(async () => {}),
    unsubscribe: mock(async () => {}),
    isSubscribed: mock(async () => false),
    post: mock(async () => ({})),
    startTyping: mock(async () => {}),
    mentionUser: (userId: string) => `@${userId}`,
    state: Promise.resolve(null),
    setState: mock(async () => {}),
    messages: (async function* () {})(),
    allMessages: (async function* () {})(),
    recentMessages: [],
    refresh: mock(async () => {}),
    channel: {} as any,
    createSentMessageFromMessage: mock(() => ({} as any)),
    postEphemeral: mock(async () => null),
  };
}

function createMockMessage(text = "hello", authorId = "user-1"): ChatMessage {
  return {
    id: "msg-123",
    threadId: "thread-1",
    text,
    formatted: { type: "root", children: [] },
    raw: {},
    author: {
      userId: authorId,
      userName: "testuser",
      fullName: "Test User",
      isBot: false,
      isMe: false,
    },
    metadata: {
      dateSent: new Date("2026-01-01T00:00:00Z"),
      edited: false,
    },
    attachments: [],
    toJSON: () => ({} as any),
  } as unknown as ChatMessage;
}

// ============================================================================
// Mock GatewayPluginApi
// ============================================================================

function createMockApi() {
  const channels: Array<{ id: string; plugin: unknown }> = [];
  const dispatched: unknown[] = [];

  return {
    id: "chat-sdk",
    name: "chat-sdk",
    source: "test",
    config: { channels: {}, agent: {}, plugins: {} } as any,
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
// Tests: message-mapper
// ============================================================================

describe("message-mapper", () => {
  describe("buildSessionKey", () => {
    test("builds DM session key", () => {
      const key = buildSessionKey("slack", "slack:C123:1234", true);
      expect(key).toBe("agent:main:slack:dm:slack:C123:1234");
    });

    test("builds group session key", () => {
      const key = buildSessionKey("discord", "discord:G456", false, "bot1");
      expect(key).toBe("agent:bot1:discord:group:discord:G456");
    });

    test("defaults agentId to main", () => {
      const key = buildSessionKey("teams", "t1", true);
      expect(key).toContain("agent:main:");
    });
  });

  describe("toMessageSource", () => {
    test("maps thread + message to MessageSource", () => {
      const thread = createMockThread("slack", "slack:C123:ts", true);
      const message = createMockMessage("hi", "U999");

      const source = toMessageSource("slack", thread as any, message);

      expect(source.channel).toBe("slack");
      expect(source.chatType).toBe("dm");
      expect(source.chatId).toBe("slack:C123:ts");
      expect(source.senderId).toBe("U999");
      expect(source.senderName).toBe("Test User");
      expect(source.messageId).toBe("msg-123");
      expect(typeof source.timestamp).toBe("number");
    });

    test("sets chatType to group for non-DM threads", () => {
      const thread = createMockThread("slack", "slack:C123", false);
      const message = createMockMessage();

      const source = toMessageSource("slack", thread as any, message);
      expect(source.chatType).toBe("group");
    });
  });

  describe("extractImages", () => {
    test("returns empty array for no attachments", () => {
      const msg = createMockMessage();
      expect(extractImages(msg)).toEqual([]);
    });

    test("extracts image attachments with data", () => {
      const msg = createMockMessage();
      (msg as any).attachments = [
        { type: "image", data: Buffer.from("png-data"), mimeType: "image/png" },
        { type: "file", data: Buffer.from("doc"), mimeType: "application/pdf" },
      ];

      const images = extractImages(msg);
      expect(images).toHaveLength(1);
      expect(images[0].type).toBe("image");
      expect(images[0].mimeType).toBe("image/png");
      expect(images[0].data).toBe(Buffer.from("png-data").toString("base64"));
    });

    test("skips images without data", () => {
      const msg = createMockMessage();
      (msg as any).attachments = [
        { type: "image", url: "https://example.com/img.png" },
      ];

      const images = extractImages(msg);
      expect(images).toHaveLength(0);
    });
  });

  describe("toInboundMessage", () => {
    test("creates InboundMessage with correct fields", () => {
      const thread = createMockThread("slack", "slack:C1:ts1", true);
      const message = createMockMessage("test message");

      const respondFn = mock(async () => {});
      const setTypingFn = mock(async () => {});

      const inbound = toInboundMessage("slack", thread as any, message, {
        respond: respondFn,
        setTyping: setTypingFn,
      });

      expect(inbound.text).toBe("test message");
      expect(inbound.sessionKey).toBe("agent:main:slack:dm:slack:C1:ts1");
      expect(inbound.source.channel).toBe("slack");
      expect(inbound.respond).toBe(respondFn);
      expect(inbound.setTyping).toBe(setTypingFn);
    });

    test("passes streaming callbacks through", () => {
      const thread = createMockThread();
      const message = createMockMessage();
      const onStreamDelta = mock(() => {});
      const onToolStart = mock(() => {});

      const inbound = toInboundMessage("test", thread as any, message, {
        respond: async () => {},
        setTyping: async () => {},
        onStreamDelta,
        onToolStart,
      });

      expect(inbound.onStreamDelta).toBe(onStreamDelta);
      expect(inbound.onToolStart).toBe(onToolStart);
    });
  });

  describe("toPostableMessage", () => {
    test("defaults to markdown format", () => {
      const result = toPostableMessage("**bold**");
      expect(result).toEqual({ markdown: "**bold**" });
    });

    test("returns raw for HTML parseMode", () => {
      const result = toPostableMessage("<b>bold</b>", "HTML");
      expect(result).toEqual({ raw: "<b>bold</b>" });
    });

    test("returns raw for plain parseMode", () => {
      const result = toPostableMessage("plain text", "plain");
      expect(result).toEqual({ raw: "plain text" });
    });

    test("returns markdown for explicit Markdown parseMode", () => {
      const result = toPostableMessage("# heading", "Markdown");
      expect(result).toEqual({ markdown: "# heading" });
    });
  });
});

// ============================================================================
// Tests: state-adapter
// ============================================================================

describe("GatewayStateAdapter", () => {
  test("delegates all operations to inner adapter", async () => {
    const inner = createMemoryState();
    const adapter = new GatewayStateAdapter(inner);

    await adapter.connect();

    await adapter.subscribe("thread-1");
    expect(await adapter.isSubscribed("thread-1")).toBe(true);

    await adapter.set("key1", { value: 42 });
    expect(await adapter.get("key1")).toEqual({ value: 42 });

    await adapter.delete("key1");
    expect(await adapter.get("key1")).toBeNull();

    await adapter.unsubscribe("thread-1");
    expect(await adapter.isSubscribed("thread-1")).toBe(false);

    await adapter.disconnect();
  });

  test("lock operations work through wrapper", async () => {
    const inner = createMemoryState();
    const adapter = new GatewayStateAdapter(inner);
    await adapter.connect();

    const lock = await adapter.acquireLock("thread-1", 5000);
    expect(lock).not.toBeNull();
    expect(lock!.threadId).toBe("thread-1");

    const extended = await adapter.extendLock(lock!, 5000);
    expect(extended).toBe(true);

    await adapter.releaseLock(lock!);
    await adapter.disconnect();
  });
});

// ============================================================================
// Tests: channel-plugin-adapter
// ============================================================================

describe("ChatSdkChannelPlugin", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let bridge: ChatSdkBridge;
  let plugin: ChatSdkChannelPlugin;

  beforeEach(() => {
    adapter = createMockAdapter("slack");
    const state = createMemoryState();
    bridge = new ChatSdkBridge({
      adapters: { slack: adapter },
      state,
      userName: "testbot",
    });
    plugin = new ChatSdkChannelPlugin(adapter, bridge);
  });

  test("has correct id and meta", () => {
    expect(plugin.id).toBe("slack");
    expect(plugin.meta.label).toBe("Slack");
    expect(plugin.meta.blurb).toContain("chat-sdk");
  });

  test("capabilities are set", () => {
    expect(plugin.capabilities.direct).toBe(true);
    expect(plugin.capabilities.group).toBe(true);
    expect(plugin.capabilities.streaming).toBe(true);
    expect(plugin.capabilities.media).toBe(true);
  });

  describe("outbound.sendText", () => {
    test("posts message via adapter", async () => {
      const result = await plugin.outbound.sendText("thread-1", "hello world");

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe("msg-1");
      expect(adapter._posted).toHaveLength(1);
      expect(adapter._posted[0].threadId).toBe("thread-1");
    });

    test("returns error on failure", async () => {
      adapter.postMessage = async () => { throw new Error("network error"); };

      const result = await plugin.outbound.sendText("thread-1", "fail");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("network error");
    });
  });

  describe("outbound.editMessage", () => {
    test("edits message via adapter", async () => {
      const result = await plugin.outbound.editMessage!("thread-1", "msg-1", "updated");

      expect(result.ok).toBe(true);
      expect(adapter._edited).toHaveLength(1);
      expect(adapter._edited[0].messageId).toBe("msg-1");
    });
  });

  describe("outbound.deleteMessage", () => {
    test("deletes message via adapter", async () => {
      const result = await plugin.outbound.deleteMessage!("thread-1", "msg-1");

      expect(result.ok).toBe(true);
      expect(adapter._deleted).toHaveLength(1);
    });
  });

  describe("outbound.sendReaction", () => {
    test("adds reaction via adapter", async () => {
      const result = await plugin.outbound.sendReaction!("thread-1", "msg-1", "thumbs_up");

      expect(result.ok).toBe(true);
      expect(adapter._reactions).toHaveLength(1);
      expect(adapter._reactions[0].emoji).toBe("thumbs_up");
    });
  });

  describe("streaming", () => {
    test("createPlaceholder posts a message", async () => {
      const result = await plugin.streaming!.createPlaceholder("thread-1");

      expect(result.messageId).toBe("msg-1");
      expect(adapter._posted).toHaveLength(1);
    });

    test("editMessage edits via adapter", async () => {
      const result = await plugin.streaming!.editMessage("thread-1", "msg-1", "updated text");

      expect(result).toBe(true);
      expect(adapter._edited).toHaveLength(1);
    });

    test("setTyping calls startTyping", async () => {
      await plugin.streaming!.setTyping!("thread-1", true);

      expect(adapter._typing).toHaveLength(1);
      expect(adapter._typing[0]).toBe("thread-1");
    });
  });

  test("init and start/stop are no-ops", async () => {
    const api = createMockApi();
    await plugin.init(api);
    await plugin.start();
    await plugin.stop();
    // No errors thrown
  });
});

// ============================================================================
// Tests: bridge
// ============================================================================

describe("ChatSdkBridge", () => {
  test("creates with config", () => {
    const adapter = createMockAdapter();
    const state = createMemoryState();

    const bridge = new ChatSdkBridge({
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    expect(bridge.getChat()).toBeDefined();
    expect(bridge.getState()).toBeInstanceOf(GatewayStateAdapter);
  });

  test("createChannelPlugin returns plugin for valid adapter", () => {
    const adapter = createMockAdapter("slack");
    const state = createMemoryState();

    const bridge = new ChatSdkBridge({
      adapters: { slack: adapter },
      state,
      userName: "bot",
    });

    const plugin = bridge.createChannelPlugin("slack");
    expect(plugin).toBeInstanceOf(ChatSdkChannelPlugin);
    expect(plugin.id).toBe("slack");
  });

  test("createChannelPlugin throws for unknown adapter", () => {
    const state = createMemoryState();
    const bridge = new ChatSdkBridge({
      adapters: {},
      state,
      userName: "bot",
    });

    expect(() => bridge.createChannelPlugin("nonexistent")).toThrow("not found");
  });

  test("setApi stores api reference", () => {
    const adapter = createMockAdapter();
    const state = createMemoryState();
    const bridge = new ChatSdkBridge({
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    const api = createMockApi();
    bridge.setApi(api);
    // No error — api is stored internally
  });
});

// ============================================================================
// Tests: plugin-factory
// ============================================================================

describe("registerChatSdkPlugin", () => {
  test("registers channel plugins for each adapter", async () => {
    const adapter1 = createMockAdapter("slack");
    const adapter2 = createMockAdapter("discord");
    const state = createMemoryState();
    const api = createMockApi();

    const bridge = await registerChatSdkPlugin(api, {
      adapters: { slack: adapter1, discord: adapter2 },
      state,
      userName: "bot",
    });

    expect(bridge).toBeInstanceOf(ChatSdkBridge);
    expect(api.registerChannel).toHaveBeenCalledTimes(2);
    expect(api._channels).toHaveLength(2);
    expect(api._channels[0].id).toBe("slack");
    expect(api._channels[1].id).toBe("discord");
  });

  test("returns functional bridge", async () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const api = createMockApi();

    const bridge = await registerChatSdkPlugin(api, {
      adapters: { test: adapter },
      state,
      userName: "bot",
    });

    expect(bridge.getChat()).toBeDefined();
    expect(bridge.getState()).toBeDefined();
  });
});

// ============================================================================
// Tests: streaming callbacks (message-mapper)
// ============================================================================

describe("createStreamingCallbacks", () => {
  test("onStreamDelta accumulates text", () => {
    const edits: string[] = [];
    const editFn = async (text: string) => { edits.push(text); return true; };
    const cb = createStreamingCallbacks(editFn, { streamStartChars: 0, editThrottleMs: 0 });

    cb.onStreamDelta("Hello", "Hello");
    cb.onStreamDelta("Hello world", " world");

    const seq = cb.getContentSequence();
    expect(seq).toHaveLength(1);
    expect(seq[0].type).toBe("text");
    expect(seq[0].content).toBe("Hello world");
  });

  test("onToolStart adds tool entries", () => {
    const editFn = async () => true;
    const cb = createStreamingCallbacks(editFn, { streamStartChars: 0, editThrottleMs: 0 });

    cb.onToolStart("read", { path: "/tmp/test.ts" });
    cb.onToolStart("bash", { command: "ls" });

    const seq = cb.getContentSequence();
    expect(seq).toHaveLength(2);
    expect(seq[0].type).toBe("tool");
    expect(seq[0].content).toContain("read");
    expect(seq[1].content).toContain("bash");
  });

  test("onToolStart deduplicates by toolCallId", () => {
    const editFn = async () => true;
    const cb = createStreamingCallbacks(editFn, { streamStartChars: 0, editThrottleMs: 0 });

    cb.onToolStart("read", { path: "/a" }, "call-1");
    cb.onToolStart("read", { path: "/b" }, "call-1"); // duplicate

    const seq = cb.getContentSequence();
    expect(seq).toHaveLength(1);
  });

  test("onThinkingDelta updates thinking entry", () => {
    const editFn = async () => true;
    const cb = createStreamingCallbacks(editFn, { streamStartChars: 0, editThrottleMs: 0 });

    cb.onThinkingDelta("thinking...", "thinking...");
    cb.onThinkingDelta("thinking... more", " more");

    const seq = cb.getContentSequence();
    expect(seq).toHaveLength(1);
    expect(seq[0].type).toBe("thinking");
    expect(seq[0].content).toBe("thinking... more");
  });

  test("onSteerInjected resets state", () => {
    const editFn = async () => true;
    const cb = createStreamingCallbacks(editFn, { streamStartChars: 0, editThrottleMs: 0 });

    cb.onStreamDelta("text", "text");
    cb.onToolStart("read", {});
    expect(cb.getContentSequence().length).toBeGreaterThan(0);

    cb.onSteerInjected();
    expect(cb.getContentSequence()).toHaveLength(0);
  });

  test("concise mode suppresses all callbacks", () => {
    const edits: string[] = [];
    const editFn = async (text: string) => { edits.push(text); return true; };
    const cb = createStreamingCallbacks(editFn, { concise: true, streamStartChars: 0, editThrottleMs: 0 });

    cb.onStreamDelta("text", "text");
    cb.onToolStart("read", {});
    cb.onThinkingDelta("think", "think");

    expect(cb.getContentSequence()).toHaveLength(0);
    expect(edits).toHaveLength(0);
  });
});

describe("buildStreamingText", () => {
  test("formats tool + thinking + text items", () => {
    const text = buildStreamingText([
      { type: "tool", content: "🔧 read(path=/tmp/test.ts)" },
      { type: "thinking", content: "analyzing..." },
      { type: "text", content: "Here is the result" },
    ]);

    expect(text).toContain("🔧 read");
    expect(text).toContain("💭 analyzing...");
    expect(text).toContain("Here is the result");
  });

  test("returns empty string for empty items", () => {
    expect(buildStreamingText([])).toBe("");
  });
});

describe("formatToolLine", () => {
  test("formats tool with no args", () => {
    expect(formatToolLine("read")).toBe("🔧 read()");
  });

  test("formats tool with args", () => {
    const line = formatToolLine("read", { path: "/tmp/test.ts" });
    expect(line).toContain("🔧 read(");
    expect(line).toContain("path=/tmp/test.ts");
  });

  test("truncates long arg values", () => {
    const longVal = "a".repeat(100);
    const line = formatToolLine("write", { content: longVal });
    expect(line.length).toBeLessThan(200);
  });
});

// ============================================================================
// Tests: outbound pinMessage, readHistory, sendKeyboard
// ============================================================================

describe("ChatSdkChannelPlugin outbound extensions", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let bridge: ChatSdkBridge;
  let plugin: ChatSdkChannelPlugin;

  beforeEach(() => {
    adapter = createMockAdapter("slack");
    const state = createMemoryState();
    bridge = new ChatSdkBridge({
      adapters: { slack: adapter },
      state,
      userName: "testbot",
    });
    plugin = new ChatSdkChannelPlugin(adapter, bridge);
  });

  test("pinMessage returns not-supported for adapters without extras", async () => {
    const result = await plugin.outbound.pinMessage!("thread-1", "msg-1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not supported");
  });

  test("readHistory calls adapter.fetchMessages", async () => {
    const result = await plugin.outbound.readHistory!("thread-1", 10);
    expect(result.ok).toBe(true);
    expect(result.messages).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  test("sendKeyboard falls back to text-only when no extras", async () => {
    const keyboard = { inline_keyboard: [[{ text: "Click", callbackData: "cb1" }]] };
    const result = await plugin.outbound.sendKeyboard!("thread-1", "Choose:", keyboard);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("msg-1");
    // Should have posted text-only
    expect(adapter._posted).toHaveLength(1);
  });

  test("editMessageMarkup falls back to text-only edit when no extras", async () => {
    const result = await plugin.outbound.editMessageMarkup!("thread-1", "msg-1", "Updated text");
    expect(result.ok).toBe(true);
    expect(adapter._edited).toHaveLength(1);
  });

  test("capabilities include pinnable and history", () => {
    expect(plugin.capabilities.history).toBe(true);
    // No extras → pinnable is false
    expect(plugin.capabilities.pinnable).toBe(false);
  });
});

// ============================================================================
// Tests: command registration
// ============================================================================

describe("commands", () => {
  test("getRegisteredCommands returns standard commands", () => {
    const cmds = getRegisteredCommands();
    expect(cmds.length).toBeGreaterThanOrEqual(6);
    const names = cmds.map(c => c.name);
    expect(names).toContain("new");
    expect(names).toContain("status");
    expect(names).toContain("stop");
    expect(names).toContain("model");
    expect(names).toContain("compact");
    expect(names).toContain("help");
  });

  test("registerChatSdkCommands does not throw", () => {
    const adapter = createMockAdapter("test");
    const state = createMemoryState();
    const bridge = new ChatSdkBridge({
      adapters: { test: adapter },
      state,
      userName: "bot",
    });
    const api = createMockApi();

    // Should not throw
    expect(() => registerChatSdkCommands(bridge.getChat(), api)).not.toThrow();
  });
});

