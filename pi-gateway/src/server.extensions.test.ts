import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Gateway } from "./server.ts";
import { DEFAULT_CONFIG, type Config } from "./core/config.ts";
import { createPluginRegistry } from "./plugins/loader.ts";
import { createPluginApi } from "./plugins/plugin-api-factory.ts";

type AnyGateway = any;

const tempDirs: string[] = [];
const gateways: AnyGateway[] = [];

function createTempConfig(mutator?: (config: Config) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-gw-server-test-"));
  tempDirs.push(dir);

  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
  config.session.dataDir = join(dir, "sessions");
  config.plugins.config = {};
  mutator?.(config);

  const path = join(dir, "pi-gateway.jsonc");
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
  return path;
}

function createTestGateway(mutator?: (config: Config) => void): AnyGateway {
  const configPath = createTempConfig(mutator);
  const gateway = new Gateway({ configPath }) as AnyGateway;
  gateway.registry = createPluginRegistry();
  gateway.transcripts = {
    logPrompt() {},
    logMeta() {},
    logResponse() {},
    logError() {},
    logEvent() {},
  };
  gateways.push(gateway);
  return gateway;
}

class FakeRpc {
  id = "rpc-test";
  sessionKey = "";
  private listener: ((event: any) => void) | null = null;
  lastPrompt = "";
  promptCalls: Array<{ message: string; images?: unknown[]; streamingBehavior?: "steer" | "followUp" }> = [];
  abortCalls = 0;
  compactCalls: string[] = [];
  extensionUIHandler: any = null;

  onEvent(listener: (event: any) => void): () => void {
    this.listener = listener;
    return () => { this.listener = null; };
  }

  async prompt(
    message: string,
    images?: unknown[],
    streamingBehavior?: "steer" | "followUp",
  ): Promise<void> {
    this.lastPrompt = message;
    this.promptCalls.push({ message, images, streamingBehavior });
    this.listener?.({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "hello",
        partial: { content: [{ type: "text", text: "hello" }] },
      },
    });
    this.listener?.({
      type: "agent_end",
      messages: [],
    });
  }

  async waitForIdle(): Promise<void> {}
  async getLastAssistantText(): Promise<string | null> { return null; }
  async abort(): Promise<void> { this.abortCalls++; }
  async stop(): Promise<void> {}
  async compact(instructions?: string): Promise<{ summary: string }> {
    this.compactCalls.push(instructions ?? "");
    return { summary: "compact-summary" };
  }
}

describe("gateway extension wiring", () => {
  afterEach(() => {
    for (const gateway of gateways.splice(0)) {
      gateway.sessions?.dispose?.();
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("before_agent_start and message_sending hooks can mutate prompt/reply", async () => {
    const gateway = createTestGateway();
    const fakeRpc = new FakeRpc();

    gateway.pool = {
      acquire: async (sk: string) => { fakeRpc.sessionKey = sk; return fakeRpc; },
      release: () => {},
      getForSession: () => fakeRpc,
    };

    gateway.registry.hooks.register("t1", ["before_agent_start"], (payload: any) => {
      payload.message = `${payload.message} +hook`;
    });
    gateway.registry.hooks.register("t2", ["message_sending"], (payload: any) => {
      payload.message.text = `${payload.message.text} +out`;
    });

    let reply = "";
    await gateway.processMessage({
      source: { channel: "test", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey: "agent:main:test:dm:u1",
      text: "ping",
      respond: async (text: string) => { reply = text; },
      setTyping: async () => {},
    });

    expect(fakeRpc.lastPrompt).toBe("ping +hook");
    expect(reply).toBe("hello +out");
  });

  test("[NO_REPLY] suppresses outbound delivery in dm", async () => {
    const gateway = createTestGateway();
    const fakeRpc = new FakeRpc();

    gateway.pool = {
      acquire: async (sk: string) => { fakeRpc.sessionKey = sk; return fakeRpc; },
      release: () => {},
      getForSession: () => fakeRpc,
    };

    gateway.registry.hooks.register("t-silent", ["message_sending"], (payload: any) => {
      payload.message.text = "[NO_REPLY]";
    });

    let delivered = false;
    await gateway.processMessage({
      source: { channel: "test", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey: "agent:main:test:dm:u1",
      text: "ping",
      respond: async () => { delivered = true; },
      setTyping: async () => {},
    });

    expect(delivered).toBe(false);
  });

  test("registered slash command executes via local handler", async () => {
    const gateway = createTestGateway();
    const fakeRpc = new FakeRpc();

    gateway.pool = {
      acquire: async (sk: string) => { fakeRpc.sessionKey = sk; return fakeRpc; },
      release: () => {},
      getForSession: () => null,
    };

    gateway.registry.commands.set("ping", {
      pluginId: "cmd-plugin",
      handler: async (ctx: any) => {
        await ctx.respond(`pong ${ctx.args}`);
      },
    });

    let reply = "";
    await gateway.processMessage({
      source: { channel: "test", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey: "agent:main:test:dm:u1",
      text: "/ping now",
      respond: async (text: string) => { reply = text; },
      setTyping: async () => {},
    });

    // Command handler should have run and produced the reply
    expect(reply).toBe("pong now");
    // Prompt should NOT have been sent to RPC (command was handled locally)
    expect(fakeRpc.promptCalls).toHaveLength(0);
  });

  test("tools.call flow triggers tool hooks and supports result mutation", async () => {
    const gateway = createTestGateway();
    const events: string[] = [];

    gateway.registry.tools.set("demo-tools", {
      name: "demo-tools",
      description: "demo",
      tools: [{ name: "echo", description: "echo text" }],
      async execute(_toolName: string, params: Record<string, unknown>) {
        return {
          content: [{ type: "text", text: String(params.text ?? "") }],
        };
      },
    });

    gateway.registry.hooks.register("hook-before", ["before_tool_call"], (payload: any) => {
      events.push("before_tool_call");
      payload.args.text = `in:${String(payload.args.text ?? "")}`;
    });
    gateway.registry.hooks.register("hook-after", ["after_tool_call"], (_payload: any) => {
      events.push("after_tool_call");
    });
    gateway.registry.hooks.register("hook-persist", ["tool_result_persist"], (payload: any) => {
      events.push("tool_result_persist");
      payload.result.content[0].text = `${payload.result.content[0].text}:persisted`;
    });

    const result = await gateway.executeRegisteredTool("echo", { text: "x" }, "agent:main:test:dm:u1");

    expect((result as any).content[0].text).toBe("in:x:persisted");
    expect(events).toEqual(["before_tool_call", "after_tool_call", "tool_result_persist"]);
  });

  test("compactSessionWithHooks dispatches before/after hooks", async () => {
    const gateway = createTestGateway();
    const fakeRpc = new FakeRpc();
    const seen: string[] = [];

    gateway.pool = {
      getForSession: () => fakeRpc,
    };

    gateway.registry.hooks.register("compact-before", ["before_compaction"], () => {
      seen.push("before");
    });
    gateway.registry.hooks.register("compact-after", ["after_compaction"], (payload: any) => {
      seen.push(`after:${payload.summary ?? ""}`);
    });

    await gateway.compactSessionWithHooks("agent:main:test:dm:u1", "please summarize");

    expect(fakeRpc.compactCalls).toEqual(["please summarize"]);
    expect(seen).toEqual(["before", "after:compact-summary"]);
  });

  test("createPluginApi exposes pluginConfig", () => {
    const gateway = createTestGateway((config) => {
      config.plugins.config = {
        demo: { enabled: true, channels: ["telegram"] },
      };
    });

    const api = createPluginApi("demo", { id: "demo", name: "Demo", main: "index.ts" }, (gateway as any).ctx);
    expect(api.pluginConfig).toEqual({ enabled: true, channels: ["telegram"] });
  });

  test("dispatch injects steer prompt for active telegram session", async () => {
    const gateway = createTestGateway((config) => {
      config.channels.telegram = {
        enabled: true,
        messageMode: "steer",
      };
    });
    const fakeRpc = new FakeRpc();
    const sessionKey = "agent:main:telegram:account:default:dm:100";
    gateway.sessions.set(sessionKey, {
      sessionKey,
      role: "default",
      isStreaming: true,
      lastActivity: Date.now(),
      messageCount: 1,
      rpcProcessId: fakeRpc.id,
    });

    let enqueued = false;
    gateway.queue = {
      enqueue: () => { enqueued = true; return true; },
    };
    gateway.pool = {
      getForSession: () => fakeRpc,
    };

    await gateway.dispatch({
      source: { channel: "telegram", accountId: "default", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey,
      text: "next",
      respond: async () => {},
      setTyping: async () => {},
    });

    expect(fakeRpc.promptCalls).toHaveLength(1);
    expect(fakeRpc.promptCalls[0]?.streamingBehavior).toBe("steer");
    expect(enqueued).toBe(false);
  });

  test("dispatch injects follow-up prompt for active telegram session", async () => {
    const gateway = createTestGateway((config) => {
      config.channels.telegram = {
        enabled: true,
        messageMode: "follow-up",
      };
    });
    const fakeRpc = new FakeRpc();
    const sessionKey = "agent:main:telegram:account:default:dm:100";
    gateway.sessions.set(sessionKey, {
      sessionKey,
      role: "default",
      isStreaming: true,
      lastActivity: Date.now(),
      messageCount: 1,
      rpcProcessId: fakeRpc.id,
    });

    let enqueued = false;
    gateway.queue = {
      enqueue: () => { enqueued = true; return true; },
    };
    gateway.pool = {
      getForSession: () => fakeRpc,
    };

    await gateway.dispatch({
      source: { channel: "telegram", accountId: "default", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey,
      text: "next",
      respond: async () => {},
      setTyping: async () => {},
    });

    expect(fakeRpc.promptCalls).toHaveLength(1);
    expect(fakeRpc.promptCalls[0]?.streamingBehavior).toBe("followUp");
    expect(enqueued).toBe(false);
  });

  test("dispatch aborts then queues when interrupt mode is active", async () => {
    const gateway = createTestGateway((config) => {
      config.channels.telegram = {
        enabled: true,
        messageMode: "interrupt",
      };
    });
    const fakeRpc = new FakeRpc();
    const sessionKey = "agent:main:telegram:account:default:dm:100";
    gateway.sessions.set(sessionKey, {
      sessionKey,
      role: "default",
      isStreaming: true,
      lastActivity: Date.now(),
      messageCount: 1,
      rpcProcessId: fakeRpc.id,
    });

    let enqueued = false;
    gateway.queue = {
      enqueue: () => { enqueued = true; return true; },
      clearCollectBuffer: () => 0,
    };
    gateway.pool = {
      getForSession: () => fakeRpc,
    };

    await gateway.dispatch({
      source: { channel: "telegram", accountId: "default", chatType: "dm", chatId: "c1", senderId: "u1" },
      sessionKey,
      text: "next",
      respond: async () => {},
      setTyping: async () => {},
    });

    expect(fakeRpc.abortCalls).toBe(1);
    expect(fakeRpc.promptCalls).toHaveLength(0);
    expect(enqueued).toBe(true);
  });

  test("dispatch steers non-telegram channels when streaming", async () => {
    const gateway = createTestGateway();
    const fakeRpc = new FakeRpc();
    const sessionKey = "agent:main:webchat:default";
    gateway.sessions.set(sessionKey, {
      sessionKey,
      role: "default",
      isStreaming: true,
      lastActivity: Date.now(),
      messageCount: 1,
      rpcProcessId: fakeRpc.id,
    });

    gateway.pool = {
      getForSession: () => fakeRpc,
    };

    await gateway.dispatch({
      source: { channel: "webchat", chatType: "dm", chatId: "default", senderId: "u1" },
      sessionKey,
      text: "next",
      respond: async () => {},
      setTyping: async () => {},
    });

    // Default mode is steer → message injected via rpc.prompt with steer behavior
    expect(fakeRpc.abortCalls).toBe(0);
    expect(fakeRpc.promptCalls).toHaveLength(1);
    expect(fakeRpc.promptCalls[0].streamingBehavior).toBe("steer");
  });
});
