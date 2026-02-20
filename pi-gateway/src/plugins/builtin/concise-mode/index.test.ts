import { describe, expect, test } from "bun:test";
import registerConciseMode from "./index.ts";
import type { GatewayPluginApi, HookHandler, PluginHookName } from "../../types.ts";

function createApi(pluginConfig?: Record<string, unknown>) {
  const hooks = new Map<PluginHookName, HookHandler[]>();

  const api: GatewayPluginApi = {
    id: "concise-mode",
    name: "concise-mode",
    source: "gateway",
    config: {} as any,
    pluginConfig,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerChannel() {},
    registerTool() {},
    registerHook(events, handler) {
      for (const event of events) {
        const list = hooks.get(event) ?? [];
        list.push(handler as HookHandler);
        hooks.set(event, list);
      }
    },
    registerHttpRoute() {},
    registerGatewayMethod() {},
    registerCommand() {},
    registerService() {},
    registerCli() {},
    on(hook, handler) {
      const list = hooks.get(hook) ?? [];
      list.push(handler as HookHandler);
      hooks.set(hook, list);
    },
    async dispatch() { return {}; },
    async sendToChannel() {},
    getSessionState(sessionKey: string) {
      // 模拟会话不存在的情况
      if (sessionKey.includes("nonexistent")) {
        return null;
      }
      return {
        sessionKey,
        role: null,
        isStreaming: false,
        lastActivity: Date.now(),
        messageCount: 1,
        rpcProcessId: null,
        lastChannel: "telegram",
        lastChatId: "chat-1",
      };
    },
    async resetSession() {},
    async setThinkingLevel() {},
    async setModel() {},
    async getAvailableModels() { return []; },
    async getSessionMessageMode() { return "steer" as const; },
    async setSessionMessageMode() {},
    async compactSession() {},
    async abortSession() {},
    async forwardCommand() {},
    async getPiCommands() { return []; },
    async getSessionStats() { return {}; },
    async getRpcState() { return {}; },
    listSessions() { return []; },
    releaseSession() {},
  };

  return { api, hooks };
}

async function runHook<T extends PluginHookName>(
  hooks: Map<PluginHookName, HookHandler[]>,
  name: T,
  payload: Parameters<HookHandler<T>>[0],
) {
  for (const handler of hooks.get(name) ?? []) {
    await handler(payload as any);
  }
}

describe("builtin concise-mode plugin", () => {
  test("injects concise instruction + suppresses final outbound after send_message", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };

    await runHook(hooks, "message_received", inbound);
    expect(inbound.message.text).toContain("Concise Output Mode");

    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("[NO_REPLY]");
  });

  test("does not activate for channels outside allowlist", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    const inbound: any = {
      message: {
        source: { channel: "discord" },
        sessionKey: "agent:main:discord:dm:u1",
        text: "hello",
      },
    };

    await runHook(hooks, "message_received", inbound);
    expect(inbound.message.text).toBe("hello");
  });

  test("send_message error does not trigger suppression (isError=true)", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // Activate session first
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // send_message failed
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: { error: "API error" },
      isError: true,
    });

    // Subsequent message should not be suppressed
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "error recovery message" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("error recovery message");
  });

  test("nonexistent session does not trigger suppression (getSessionState returns null)", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // Activate session
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:nonexistent",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // Call after_tool_call, but getSessionState returns null
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:nonexistent",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // Message should not be suppressed since session state doesn't exist
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("normal reply");
  });

  test("multiple send_message calls each suppress their own message", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // Activate session
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // First send_message
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // First message_sending - should be suppressed
    const outbound1: any = { message: { channel: "telegram", target: "chat-1", text: "first reply" } };
    await runHook(hooks, "message_sending", outbound1);
    expect(outbound1.message.text).toBe("[NO_REPLY]");

    // Second send_message
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // Second message_sending - should be suppressed
    const outbound2: any = { message: { channel: "telegram", target: "chat-1", text: "second reply" } };
    await runHook(hooks, "message_sending", outbound2);
    expect(outbound2.message.text).toBe("[NO_REPLY]");
  });

  test("message_sending before after_tool_call does not suppress", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // Activate session
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // Trigger message_sending first (suppressRoutes is empty)
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "early reply" } };
    await runHook(hooks, "message_sending", outbound);

    // Then trigger after_tool_call
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // Early message should not be suppressed
    expect(outbound.message.text).toBe("early reply");
  });

  test("non-send_message tool calls do not trigger suppression", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // Activate session
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // Call other tool
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "read_file",
      result: { content: "file content" },
      isError: false,
    });

    // Subsequent message should not be suppressed
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("normal reply");
  });

  test("disabled=true does not activate at all", async () => {
    const { api, hooks } = createApi({ enabled: false, channels: ["telegram"] });
    registerConciseMode(api);

    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };

    await runHook(hooks, "message_received", inbound);
    expect(inbound.message.text).toBe("hello");
  });
});
