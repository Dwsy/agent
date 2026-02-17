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
  // ==================== 原有测试 ====================
  
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
    expect(inbound.message.text).toContain("[Concise Output Mode]");

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

  // ==================== Phase 3: 新增测试用例 ====================

  test("send_message 失败时不触发抑制 (isError=true)", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // 先激活会话
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // send_message 调用失败
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: { error: "API error" },
      isError: true,
    });

    // 后续消息不应被抑制
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "error recovery message" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("error recovery message");
  });

  test("会话不存在时不触发抑制 (getSessionState 返回 null)", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    
    // 修改 getSessionState 对特定 sessionKey 返回 null
    const originalGetSessionState = api.getSessionState;
    api.getSessionState = (sessionKey: string) => {
      if (sessionKey === "agent:main:telegram:dm:u1") {
        return null; // 模拟会话不存在
      }
      return originalGetSessionState(sessionKey);
    };
    
    registerConciseMode(api);

    // 激活会话
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // 调用 after_tool_call，但 getSessionState 返回 null
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // 由于会话状态不存在，不应添加 suppress route，消息不应被抑制
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("normal reply");
  });

  test("多次 send_message 调用只抑制第一次", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // 激活会话
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // 第一次 send_message
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // 第一次 message_sending - 应被抑制
    const outbound1: any = { message: { channel: "telegram", target: "chat-1", text: "first reply" } };
    await runHook(hooks, "message_sending", outbound1);
    expect(outbound1.message.text).toBe("[NO_REPLY]");

    // 第二次 send_message
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // 第二次 message_sending - 应被抑制
    const outbound2: any = { message: { channel: "telegram", target: "chat-1", text: "second reply" } };
    await runHook(hooks, "message_sending", outbound2);
    expect(outbound2.message.text).toBe("[NO_REPLY]");
  });

  test("message_sending 先于 after_tool_call 触发时不抑制", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // 激活会话
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // 先触发 message_sending（此时 suppressRoutes 为空）
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "early reply" } };
    await runHook(hooks, "message_sending", outbound);

    // 后触发 after_tool_call
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // 早期消息不应被抑制
    expect(outbound.message.text).toBe("early reply");
  });

  test("非 send_message 工具调用不触发抑制", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    registerConciseMode(api);

    // 激活会话
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // 调用其他工具
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "read_file",
      result: { content: "file content" },
      isError: false,
    });

    // 后续消息不应被抑制
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("normal reply");
  });

  // ==================== Phase 3: 配置边界测试 ====================

  test("配置为空通道数组时使用默认通道", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: [] });
    registerConciseMode(api);

    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };

    await runHook(hooks, "message_received", inbound);
    expect(inbound.message.text).toContain("[Concise Output Mode]");
  });

  test("配置为无效类型时使用默认通道", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: "invalid" as any });
    registerConciseMode(api);

    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };

    await runHook(hooks, "message_received", inbound);
    expect(inbound.message.text).toContain("[Concise Output Mode]");
  });

  test("配置包含空字符串时自动过滤", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram", "", "  ", "discord"] });
    registerConciseMode(api);

    // telegram 应激活
    const inbound1: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound1);
    expect(inbound1.message.text).toContain("[Concise Output Mode]");

    // discord 应激活（有效通道）
    const inbound2: any = {
      message: {
        source: { channel: "discord" },
        sessionKey: "agent:main:discord:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound2);
    expect(inbound2.message.text).toContain("[Concise Output Mode]");
  });

  test("disabled=true 时完全不激活", async () => {
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

  test("会话 lastChannel 不在允许列表中不触发抑制", async () => {
    const { api, hooks } = createApi({ enabled: true, channels: ["telegram"] });
    
    // 修改 getSessionState 返回 discord 作为 lastChannel
    api.getSessionState = () => ({
      sessionKey: "agent:main:telegram:dm:u1",
      role: null,
      isStreaming: false,
      lastActivity: Date.now(),
      messageCount: 1,
      rpcProcessId: null,
      lastChannel: "discord", // 不在允许列表中
      lastChatId: "chat-1",
    });
    
    registerConciseMode(api);

    // 激活会话（telegram）
    const inbound: any = {
      message: {
        source: { channel: "telegram" },
        sessionKey: "agent:main:telegram:dm:u1",
        text: "hello",
      },
    };
    await runHook(hooks, "message_received", inbound);

    // send_message 成功调用
    await runHook(hooks, "after_tool_call", {
      sessionKey: "agent:main:telegram:dm:u1",
      toolName: "send_message",
      result: {},
      isError: false,
    });

    // telegram 通道的消息不应被抑制（因为 lastChannel 是 discord）
    const outbound: any = { message: { channel: "telegram", target: "chat-1", text: "normal reply" } };
    await runHook(hooks, "message_sending", outbound);

    expect(outbound.message.text).toBe("normal reply");
  });
});
