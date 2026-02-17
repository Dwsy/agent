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
    getSessionState() {
      return {
        sessionKey: "agent:main:telegram:dm:u1",
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
});
