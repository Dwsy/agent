import { describe, expect, test } from "bun:test";
import { createPluginApi } from "../../plugin-api-factory.ts";

function createCtx(overrides: Record<string, unknown> = {}) {
  const rpcCalls = {
    setModel: [] as Array<{ provider: string; modelId: string }>,
    setThinkingLevel: [] as string[],
  };

  const rpc = {
    setModel: async (provider: string, modelId: string) => {
      rpcCalls.setModel.push({ provider, modelId });
    },
    setThinkingLevel: async (level: string) => {
      rpcCalls.setThinkingLevel.push(level);
    },
    getAvailableModels: async () => [
      { provider: "anthropic", modelId: "claude-sonnet-4-5" },
    ],
  };

  const storedSession: any = {
    sessionKey: "agent:main:telegram:account:default:group:-1001",
    role: "default",
    isStreaming: false,
    lastActivity: Date.now(),
    messageCount: 1,
    rpcProcessId: "rpc-1",
  };

  let touchCount = 0;

  const ctx = {
    config: {
      plugins: {
        config: {},
      },
      logging: {
        file: false,
      },
    },
    registry: {
      hooks: {
        register: () => {},
      },
      channels: new Map(),
      tools: new Map(),
      conflicts: [] as any[],
      httpRoutes: [] as any[],
      gatewayMethods: new Map(),
      commands: new Map(),
      services: [] as any[],
      cliRegistrars: [] as any[],
    },
    channelApis: new Map(),
    dispatch: async () => ({ ok: true }),
    broadcastToWs: () => {},
    sessions: {
      get: () => storedSession,
      touch: () => {
        touchCount += 1;
      },
      toArray: () => [],
    },
    pool: {
      getForSession: () => rpc,
      acquire: async () => rpc,
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    buildSessionProfile: () => ({ role: "default", cwd: ".", signature: "sig", resourceCounts: { extensions: 0, skills: 0, tools: 0 } }),
    compactSessionWithHooks: async () => {},
    sessionMessageModeOverrides: new Map(),
    resolveSessionMessageMode: () => "steer",
    listAvailableRoles: () => [],
    setSessionRole: async () => false,
    createRole: async () => ({ ok: false }),
    deleteRole: async () => ({ ok: false }),
    transcripts: {
      readTranscript: () => [],
    },
    systemEvents: {
      emit: () => {},
    },
    heartbeat: undefined,
    cron: undefined,
    modelHealth: {
      getAllStates: () => [],
    },
    ...overrides,
  } as any;

  return { ctx, rpcCalls, storedSession, getTouchCount: () => touchCount };
}

describe("createPluginApi model/thinking runtime commands", () => {
  test("setModel updates session cache and calls rpc", async () => {
    const { ctx, rpcCalls, storedSession, getTouchCount } = createCtx();
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.setModel(storedSession.sessionKey, "anthropic", "claude-sonnet-4-5");

    expect(rpcCalls.setModel).toEqual([{ provider: "anthropic", modelId: "claude-sonnet-4-5" }]);
    expect(storedSession.lastModel).toBe("anthropic/claude-sonnet-4-5");
    expect(storedSession.lastModelSource).toBe("runtime.command");
    expect(getTouchCount()).toBe(1);
  });

  test("setThinkingLevel updates session cache and calls rpc", async () => {
    const { ctx, rpcCalls, storedSession, getTouchCount } = createCtx();
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.setThinkingLevel(storedSession.sessionKey, "high");

    expect(rpcCalls.setThinkingLevel).toEqual(["high"]);
    expect(storedSession.lastThinkingLevel).toBe("high");
    expect(storedSession.lastThinkingLevelSource).toBe("runtime.command");
    expect(getTouchCount()).toBe(1);
  });

  test("setModel acquires rpc when missing", async () => {
    const rpcCalls = { acquired: 0, setModel: [] as Array<{ provider: string; modelId: string }> };
    const rpc = {
      setModel: async (provider: string, modelId: string) => {
        rpcCalls.setModel.push({ provider, modelId });
      },
    };

    const { ctx, storedSession } = createCtx({
      pool: {
        getForSession: () => null,
        acquire: async () => {
          rpcCalls.acquired += 1;
          return rpc;
        },
      },
    });
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.setModel(storedSession.sessionKey, "anthropic", "claude");

    expect(rpcCalls.acquired).toBe(1);
    expect(rpcCalls.setModel).toEqual([{ provider: "anthropic", modelId: "claude" }]);
  });

  test("setThinkingLevel acquires rpc when missing", async () => {
    const rpcCalls = { acquired: 0, levels: [] as string[] };
    const rpc = {
      setThinkingLevel: async (level: string) => {
        rpcCalls.levels.push(level);
      },
    };

    const { ctx, storedSession } = createCtx({
      pool: {
        getForSession: () => null,
        acquire: async () => {
          rpcCalls.acquired += 1;
          return rpc;
        },
      },
    });
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.setThinkingLevel(storedSession.sessionKey, "medium");

    expect(rpcCalls.acquired).toBe(1);
    expect(rpcCalls.levels).toEqual(["medium"]);
  });

  test("getAvailableModels acquires rpc when missing", async () => {
    const rpcCalls = { acquired: 0 };
    const rpc = {
      getAvailableModels: async () => [{ provider: "p", modelId: "m" }],
    };

    const { ctx, storedSession } = createCtx({
      pool: {
        getForSession: () => null,
        acquire: async () => {
          rpcCalls.acquired += 1;
          return rpc;
        },
      },
    });
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    const models = await api.getAvailableModels(storedSession.sessionKey);

    expect(rpcCalls.acquired).toBe(1);
    expect(models).toEqual([{ provider: "p", modelId: "m" }]);
  });
});
