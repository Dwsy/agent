import { describe, expect, test } from "bun:test";
import { createPluginApi } from "../../plugin-api-factory.ts";

function createCtx(overrides: Record<string, unknown> = {}) {
  const rpcCalls = {
    compact: [] as Array<string | undefined>,
    abort: 0,
    setThinkingLevel: [] as string[],
    setModel: [] as Array<{ provider: string; modelId: string }>,
    prompt: [] as string[],
  };

  const rpc = {
    compact: async (instructions?: string) => {
      rpcCalls.compact.push(instructions);
    },
    abort: async () => {
      rpcCalls.abort += 1;
    },
    setThinkingLevel: async (level: string) => {
      rpcCalls.setThinkingLevel.push(level);
    },
    setModel: async (provider: string, modelId: string) => {
      rpcCalls.setModel.push({ provider, modelId });
    },
    prompt: async (text: string) => {
      rpcCalls.prompt.push(text);
    },
  };

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
      get: () => null,
      toArray: () => [],
    },
    pool: {
      getForSession: () => rpc,
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    compactSessionWithHooks: async () => {},
    sessionMessageModeOverrides: new Map(),
    resolveTelegramMessageMode: () => "steer",
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

  return { ctx, rpcCalls };
}

describe("createPluginApi forwardCommand normalization", () => {
  test("forwards canonical /reload via rpc.prompt", async () => {
    const { ctx, rpcCalls } = createCtx();
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.forwardCommand("s1", "/reload", "");

    expect(rpcCalls.prompt).toEqual(["/reload"]);
  });

  test("normalizes typo alias /relaod to /reload", async () => {
    const { ctx, rpcCalls } = createCtx();
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.forwardCommand("s1", " /ReLaOd ", "");

    expect(rpcCalls.prompt).toEqual(["/reload"]);
  });

  test("keeps existing /model branch behavior", async () => {
    const { ctx, rpcCalls } = createCtx();
    const api = createPluginApi("test-plugin", { name: "test-plugin" } as any, ctx);

    await api.forwardCommand("s1", " /MODEL ", "anthropic/claude-opus-4-6");

    expect(rpcCalls.setModel).toEqual([
      { provider: "anthropic", modelId: "claude-opus-4-6" },
    ]);
    expect(rpcCalls.prompt).toEqual([]);
  });
});
