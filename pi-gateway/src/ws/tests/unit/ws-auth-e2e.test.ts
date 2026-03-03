import { describe, expect, test } from "bun:test";
import { createWsRouter, dispatchWsFrame } from "../../ws-router.ts";

function createMockCtx() {
  let reloadCount = 0;
  const deletedSessions: string[] = [];

  const ctx = {
    config: {
      gateway: {
        auth: {
          mode: "token",
          token: "",
        },
      },
    },
    resolvedGatewayToken: "runtime-token",
    reloadConfig: () => {
      reloadCount++;
    },
    pool: {
      getStats: () => ({ total: 0, active: 0, idle: 0, maxCapacity: 1 }),
      release: () => {},
    },
    queue: {
      getStats: () => ({ pending: 0 }),
    },
    sessions: {
      size: 0,
      delete: (key: string) => deletedSessions.push(key),
      toArray: () => [],
      get: () => null,
    },
    sessionMessageModeOverrides: new Map<string, string>(),
    extensionUI: {
      handleResponse: () => ({ ok: true }),
    },
    registry: {
      gatewayMethods: new Map<string, { handler: (params: Record<string, unknown>) => Promise<unknown> }>(),
      hooks: {
        dispatch: async () => {},
      },
    },
    wsClients: new Map(),
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    compactSessionWithHooks: async () => {},
    listAvailableRoles: () => [],
    setSessionRole: async () => false,
    createRole: async () => ({ ok: false }),
    deleteRole: async () => ({ ok: false }),
  } as any;

  return {
    ctx,
    getReloadCount: () => reloadCount,
    deletedSessions,
  };
}

function createMockWs(authenticated = false) {
  const sent: Array<{ type: string; id: string; ok: boolean; payload?: unknown; error?: string }> = [];
  const ws = {
    data: { clientId: "ws-e2e", authenticated },
    send(raw: string) {
      sent.push(JSON.parse(raw));
    },
    close: () => {},
  } as any;

  return { ws, sent };
}

describe("ws auth guard e2e", () => {
  test("blocks privileged methods before connect and unlocks after connect", async () => {
    const { ctx, getReloadCount, deletedSessions } = createMockCtx();
    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs(false);

    await dispatchWsFrame(router, {
      type: "req",
      id: "pre-1",
      method: "config.reload",
      params: {},
    }, ctx, ws);

    await dispatchWsFrame(router, {
      type: "req",
      id: "pre-2",
      method: "sessions.delete",
      params: { sessionKey: "agent:main:webchat:test" },
    }, ctx, ws);

    ctx.registry.gatewayMethods.set("tools.call", {
      handler: async () => ({ ok: true }),
    });

    await dispatchWsFrame(router, {
      type: "req",
      id: "pre-3",
      method: "tools.call",
      params: { tool: "noop" },
    }, ctx, ws);

    expect(sent).toHaveLength(3);
    expect(sent[0].error).toBe("Unauthorized");
    expect(sent[1].error).toBe("Unauthorized");
    expect(sent[2].error).toBe("Unauthorized");

    await dispatchWsFrame(router, {
      type: "req",
      id: "connect",
      method: "connect",
      params: { token: "runtime-token" },
    }, ctx, ws);

    expect(ws.data.authenticated).toBe(true);
    expect(sent[3].ok).toBe(true);

    await dispatchWsFrame(router, {
      type: "req",
      id: "post-1",
      method: "config.reload",
      params: {},
    }, ctx, ws);

    await dispatchWsFrame(router, {
      type: "req",
      id: "post-2",
      method: "sessions.delete",
      params: { sessionKey: "agent:main:webchat:test" },
    }, ctx, ws);

    await dispatchWsFrame(router, {
      type: "req",
      id: "post-3",
      method: "tools.call",
      params: {},
    }, ctx, ws);

    expect(sent[4].ok).toBe(true);
    expect(getReloadCount()).toBe(1);

    expect(sent[5].ok).toBe(true);
    expect(deletedSessions).toEqual(["agent:main:webchat:test"]);

    expect(sent[6].ok).toBe(true);
    expect((sent[6].payload as any).ok).toBe(true);
  });
});
