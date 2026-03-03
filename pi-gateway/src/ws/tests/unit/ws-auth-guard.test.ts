import { describe, expect, test } from "bun:test";
import { createWsRouter, dispatchWsFrame } from "../../ws-router.ts";

function createMockCtx(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];

  const ctx = {
    config: {
      gateway: {
        auth: {
          mode: "token",
          token: "runtime-token",
        },
      },
    },
    resolvedGatewayToken: "runtime-token",
    pool: {
      getStats: () => ({ total: 0, active: 0, idle: 0, maxCapacity: 1 }),
    },
    queue: {
      getStats: () => ({ pending: 0 }),
    },
    sessions: { size: 0 },
    extensionUI: {
      handleResponse: () => ({ ok: true }),
    },
    registry: {
      gatewayMethods: new Map<string, { handler: (params: Record<string, unknown>) => Promise<unknown> }>(),
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    ...overrides,
  } as any;

  return { ctx, events };
}

function createMockWs(authenticated = false) {
  const sent: Array<{ type: string; id: string; ok: boolean; payload?: unknown; error?: string }> = [];
  const ws = {
    data: { clientId: "ws-1", authenticated },
    send(raw: string) {
      sent.push(JSON.parse(raw));
    },
    close: () => {},
  } as any;
  return { ws, sent };
}

describe("ws auth guard", () => {
  test("reject non-connect method before authentication", async () => {
    const { ctx } = createMockCtx();
    ctx.registry.gatewayMethods.set("tools.call", {
      handler: async () => ({ ok: true }),
    });

    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs(false);

    await dispatchWsFrame(router, {
      type: "req",
      id: "1",
      method: "tools.call",
      params: { tool: "x" },
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(false);
    expect(sent[0].error).toBe("Unauthorized");
  });

  test("allow method after successful connect", async () => {
    const { ctx } = createMockCtx();
    ctx.registry.gatewayMethods.set("tools.call", {
      handler: async () => ({ result: "ok" }),
    });

    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs(false);

    await dispatchWsFrame(router, {
      type: "req",
      id: "c1",
      method: "connect",
      params: { token: "runtime-token" },
    }, ctx, ws);

    expect(ws.data.authenticated).toBe(true);
    expect(sent[0].ok).toBe(true);

    await dispatchWsFrame(router, {
      type: "req",
      id: "2",
      method: "tools.call",
      params: { tool: "x" },
    }, ctx, ws);

    expect(sent[1].ok).toBe(true);
    expect((sent[1].payload as any).result).toBe("ok");
  });

  test("connect uses runtime resolved token", async () => {
    const { ctx } = createMockCtx({
      config: {
        gateway: {
          auth: {
            mode: "token",
            token: "",
          },
        },
      },
      resolvedGatewayToken: "runtime-resolved-token",
    });

    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs(false);

    await dispatchWsFrame(router, {
      type: "req",
      id: "c1",
      method: "connect",
      params: { token: "runtime-resolved-token" },
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(true);
    expect(ws.data.authenticated).toBe(true);
  });
});
