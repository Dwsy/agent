import { describe, expect, test } from "bun:test";
import { createWsRouter, dispatchWsFrame } from "../../ws-router.ts";

function createMockCtx() {
  return {
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
  } as any;
}

function createMockWs() {
  const sent: Array<{ type: string; id: string; ok: boolean; payload?: unknown; error?: string }> = [];
  const ws = {
    data: { clientId: "ws-unknown", authenticated: true },
    send(raw: string) {
      sent.push(JSON.parse(raw));
    },
    close: () => {},
  } as any;
  return { ws, sent };
}

describe("ws router unknown method hints", () => {
  test("keeps default unknown-method error for unrelated methods", async () => {
    const ctx = createMockCtx();
    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs();

    await dispatchWsFrame(router, {
      type: "req",
      id: "unknown-1",
      method: "foo.bar",
      params: {},
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(false);
    expect(sent[0].error).toBe("Unknown method: foo.bar");
  });

  test("adds actionable hint for reload-like unknown methods", async () => {
    const ctx = createMockCtx();
    const router = createWsRouter(ctx);
    const { ws, sent } = createMockWs();

    await dispatchWsFrame(router, {
      type: "req",
      id: "unknown-2",
      method: "session.relaod",
      params: {},
    }, ctx, ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].ok).toBe(false);
    expect(sent[0].error).toBe('Unknown method: session.relaod. Did you mean "session.reload"?');
  });
});
