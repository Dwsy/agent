import { describe, expect, test } from "bun:test";
import { createWsRouter, dispatchWsFrame } from "../../ws-router.ts";

function createMockCtx() {
  const setRoleCalls: Array<{ sessionKey: string; role: string }> = [];

  const ctx = {
    config: {
      gateway: {
        auth: {
          mode: "off",
        },
      },
    },
    pool: {
      getStats: () => ({ total: 0, active: 0, idle: 0, maxCapacity: 1 }),
    },
    queue: {
      getStats: () => ({ pending: 0 }),
    },
    sessions: { size: 0, toArray: () => [] },
    extensionUI: {
      handleResponse: () => ({ ok: true }),
    },
    registry: {
      gatewayMethods: new Map<string, { handler: (params: Record<string, unknown>) => Promise<unknown> }>(),
      hooks: {
        dispatch: async () => {},
      },
    },
    listAvailableRoles: () => ["default", "ops", "review"],
    setSessionRole: async (sessionKey: string, role: string) => {
      setRoleCalls.push({ sessionKey, role });
      return true;
    },
    createRole: async () => ({ ok: true }),
    deleteRole: async () => ({ ok: true }),
    compactSessionWithHooks: async () => {},
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as any;

  return { ctx, setRoleCalls };
}

function createMockWs() {
  const sent: Array<{ type: string; id: string; ok: boolean; payload?: unknown; error?: string }> = [];
  const ws = {
    data: { clientId: "ws-role-alias", authenticated: true },
    send(raw: string) {
      sent.push(JSON.parse(raw));
    },
    close: () => {},
  } as any;

  return { ws, sent };
}

describe("ws role method aliases", () => {
  test("session.listRoles should map to roles.list", async () => {
    const { ctx } = createMockCtx();
    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs();

    await dispatchWsFrame(router, {
      type: "req",
      id: "list-1",
      method: "session.listRoles",
      params: {},
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(true);
    expect((sent[0].payload as any).roles).toEqual(["default", "ops", "review"]);
  });

  test("session.setRole should map to roles.set", async () => {
    const { ctx, setRoleCalls } = createMockCtx();
    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs();

    await dispatchWsFrame(router, {
      type: "req",
      id: "set-1",
      method: "session.setRole",
      params: {
        sessionKey: "agent:main:webchat:test",
        role: "ops",
      },
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(true);
    expect(setRoleCalls).toEqual([{ sessionKey: "agent:main:webchat:test", role: "ops" }]);
  });
});
