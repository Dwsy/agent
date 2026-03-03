import { describe, expect, test } from "bun:test";
import { processMessage } from "../../message-pipeline.ts";

function createContext(sessionOverrides: Record<string, unknown> = {}) {
  const rpcCalls = {
    setModel: [] as Array<{ provider: string; modelId: string }>,
    setThinking: [] as string[],
    prompt: [] as string[],
  };

  const rpc: any = {
    id: "rpc-1",
    sessionKey: null,
    extensionUIHandler: null,
    setModel: async (provider: string, modelId: string) => {
      rpcCalls.setModel.push({ provider, modelId });
    },
    setThinkingLevel: async (level: string) => {
      rpcCalls.setThinking.push(level);
    },
    prompt: async (text: string) => {
      rpcCalls.prompt.push(text);
    },
    waitForIdle: async () => {},
    onEvent: () => () => {},
    abort: async () => {},
    stop: async () => {},
  };

  const session: any = {
    sessionKey: "agent:main:telegram:account:zero:main",
    role: "default",
    isStreaming: false,
    lastActivity: Date.now(),
    messageCount: 0,
    rpcProcessId: null,
    lastModel: undefined,
    lastModelSource: undefined,
    lastThinkingLevel: undefined,
    lastThinkingLevelSource: undefined,
    appliedModel: undefined,
    appliedModelRpcProcessId: undefined,
    appliedThinkingLevel: undefined,
    appliedThinkingRpcProcessId: undefined,
    ...sessionOverrides,
  };

  const sessions = new Map<string, any>();

  const ctx: any = {
    config: {
      agent: {
        model: "yuanjing/glm-5",
        thinkingLevel: "high",
        timeoutMs: 5_000,
      },
      channels: {
        telegram: {
          enabled: true,
        },
      },
      queue: {
        mode: "collect",
      },
    },
    pool: {
      acquire: async () => rpc,
      release: () => {},
      getForSession: () => rpc,
    },
    sessions: {
      has: (key: string) => sessions.has(key),
      get: (key: string) => sessions.get(key),
      getOrCreate: (key: string, defaults: any) => {
        if (!sessions.has(key)) sessions.set(key, { ...session, ...defaults, sessionKey: key });
        return sessions.get(key);
      },
    },
    buildSessionProfile: () => ({
      role: "default",
      cwd: ".",
      signature: "sig",
      resourceCounts: { extensions: 0, skills: 0, tools: 0 },
    }),
    activeInboundMessages: new Map(),
    sessionMessageModeOverrides: new Map(),
    extensionUI: { forward: () => false },
    transcripts: {
      logPrompt: () => {},
      logMeta: () => {},
      logEvent: () => {},
      logError: () => {},
      logResponse: () => {},
    },
    registry: {
      hooks: {
        dispatch: async () => {},
      },
    },
    modelHealth: null,
    observability: {
      record: () => {},
    },
    metrics: {
      incMessageProcessed: () => {},
      recordLatency: () => {},
      incRpcTimeout: () => {},
    },
    dedup: {
      isDuplicate: () => false,
    },
    queue: {
      enqueue: () => true,
      clearCollectBuffer: () => 0,
    },
    broadcastToWs: () => {},
    compactSessionWithHooks: async () => {},
    listAvailableRoles: () => [],
    setSessionRole: async () => true,
    createRole: async () => ({ ok: true }),
    deleteRole: async () => ({ ok: true }),
    resolveSessionMessageMode: () => "steer",
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };

  return { ctx, rpcCalls, session, sessions, rpc };
}

describe("message-pipeline setting application", () => {
  test("does not re-send set_model/set_thinking_level on same rpc when unchanged", async () => {
    const { ctx, rpcCalls } = createContext();

    const msg: any = {
      source: {
        channel: "telegram",
        accountId: "zero",
        chatType: "dm",
        chatId: "1001",
        senderId: "u1",
      },
      sessionKey: "agent:main:telegram:account:zero:main",
      text: "hello",
      respond: async () => {},
      setTyping: async () => {},
    };

    await processMessage(msg, ctx);
    await processMessage({ ...msg, text: "second" }, ctx);

    expect(rpcCalls.setModel).toHaveLength(1);
    expect(rpcCalls.setThinking).toHaveLength(1);
    expect(rpcCalls.prompt).toHaveLength(2);
  });

  test("re-applies settings when rpc process id marker mismatches", async () => {
    const { ctx, rpcCalls } = createContext();

    const msg: any = {
      source: {
        channel: "telegram",
        accountId: "zero",
        chatType: "dm",
        chatId: "1001",
        senderId: "u1",
      },
      sessionKey: "agent:main:telegram:account:zero:main",
      text: "hello",
      respond: async () => {},
      setTyping: async () => {},
    };

    await processMessage(msg, ctx);

    const session = ctx.sessions.get("agent:main:telegram:account:zero:main");
    session.appliedModelRpcProcessId = "rpc-2";
    session.appliedThinkingRpcProcessId = "rpc-2";

    await processMessage({ ...msg, text: "after-marker-change" }, ctx);

    expect(rpcCalls.setModel).toHaveLength(2);
    expect(rpcCalls.setThinking).toHaveLength(2);
  });

  test("keeps runtime-command model instead of falling back to global model", async () => {
    const { ctx, rpcCalls, sessions } = createContext({
      lastModel: "9w7/gpt-5.3-codex",
      lastModelSource: "runtime.command",
    });

    const msg: any = {
      source: {
        channel: "telegram",
        accountId: "zero",
        chatType: "dm",
        chatId: "1001",
        senderId: "u1",
      },
      sessionKey: "agent:main:telegram:account:zero:main",
      text: "你好",
      respond: async () => {},
      setTyping: async () => {},
    };

    sessions.set(msg.sessionKey, {
      sessionKey: msg.sessionKey,
      role: "default",
      isStreaming: false,
      lastActivity: Date.now(),
      messageCount: 0,
      rpcProcessId: null,
      lastModel: "9w7/gpt-5.3-codex",
      lastModelSource: "runtime.command",
      lastThinkingLevel: undefined,
      lastThinkingLevelSource: undefined,
      appliedModel: undefined,
      appliedModelRpcProcessId: undefined,
      appliedThinkingLevel: undefined,
      appliedThinkingRpcProcessId: undefined,
    });

    await processMessage(msg, ctx);

    expect(rpcCalls.setModel).toHaveLength(1);
    expect(rpcCalls.setModel[0]).toEqual({ provider: "9w7", modelId: "gpt-5.3-codex" });

    await processMessage({ ...msg, text: "第二条" }, ctx);
    expect(rpcCalls.setModel).toHaveLength(1);

    const session = ctx.sessions.get("agent:main:telegram:account:zero:main");
    expect(session.lastModel).toBe("9w7/gpt-5.3-codex");
    expect(session.lastModelSource).toBe("runtime.command");
  });
});
