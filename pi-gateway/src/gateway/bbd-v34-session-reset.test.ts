import { describe, test, expect, mock } from "bun:test";
import { resetSession } from "./session-reset.ts";
import type { GatewayContext } from "./types.ts";
import type { SessionKey } from "../core/types.ts";

function createMockCtx(overrides?: Partial<GatewayContext>): GatewayContext {
  const sessions = new Map<string, any>();
  const hookCalls: any[] = [];
  const wsBroadcasts: any[] = [];
  const metaLogs: any[] = [];

  return {
    pool: {
      getForSession: mock(() => null),
    },
    sessions: {
      get: (key: string) => sessions.get(key),
      touch: mock(() => {}),
    },
    systemEvents: {
      consume: mock(() => []),
    },
    queue: {
      clearCollectBuffer: mock(() => 0),
    },
    registry: {
      hooks: {
        dispatch: mock(async (name: string, payload: any) => {
          hookCalls.push({ name, payload });
        }),
      },
    },
    broadcastToWs: mock((event: string, payload: any) => {
      wsBroadcasts.push({ event, payload });
    }),
    transcripts: {
      logMeta: mock((key: string, type: string, data: any) => {
        metaLogs.push({ key, type, data });
      }),
    },
    log: {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    },
    // Expose test internals
    _sessions: sessions,
    _hookCalls: hookCalls,
    _wsBroadcasts: wsBroadcasts,
    _metaLogs: metaLogs,
    ...overrides,
  } as any;
}

const SK = "agent:main:test:dm" as SessionKey;

describe("resetSession", () => {
  test("resets RPC when process exists", async () => {
    const newSession = mock(async () => ({ cancelled: false }));
    const ctx = createMockCtx({
      pool: { getForSession: mock(() => ({ newSession })) } as any,
    });

    const result = await resetSession(ctx, SK);
    expect(result.rpcReset).toBe(true);
    expect(newSession).toHaveBeenCalledTimes(1);
  });

  test("handles missing RPC gracefully", async () => {
    const ctx = createMockCtx();
    const result = await resetSession(ctx, SK);
    expect(result.rpcReset).toBe(false);
  });

  test("resets session state", async () => {
    const ctx = createMockCtx();
    (ctx as any)._sessions.set(SK, {
      messageCount: 42,
      lastActivity: 1000,
      role: "default",
    });

    const result = await resetSession(ctx, SK);
    expect(result.stateReset).toBe(true);

    const session = (ctx as any)._sessions.get(SK);
    expect(session.messageCount).toBe(0);
    expect(session.lastActivity).toBeGreaterThan(1000);
  });

  test("handles missing session gracefully", async () => {
    const ctx = createMockCtx();
    const result = await resetSession(ctx, SK);
    expect(result.stateReset).toBe(false);
  });

  test("clears system events", async () => {
    const consume = mock(() => ["event1", "event2"]);
    const ctx = createMockCtx({
      systemEvents: { consume } as any,
    });

    const result = await resetSession(ctx, SK);
    expect(result.eventsCleared).toBe(2);
    expect(consume).toHaveBeenCalledWith(SK);
  });

  test("clears message queue collect buffer", async () => {
    const clearCollectBuffer = mock(() => 3);
    const ctx = createMockCtx({
      queue: { clearCollectBuffer } as any,
    });

    const result = await resetSession(ctx, SK);
    expect(result.queueCleared).toBe(3);
    expect(clearCollectBuffer).toHaveBeenCalledWith(SK);
  });

  test("fires session_reset hook", async () => {
    const ctx = createMockCtx();
    await resetSession(ctx, SK);

    const hookCalls = (ctx as any)._hookCalls;
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0].name).toBe("session_reset");
    expect(hookCalls[0].payload.sessionKey).toBe(SK);
  });

  test("broadcasts to WS clients", async () => {
    const ctx = createMockCtx();
    await resetSession(ctx, SK);

    expect(ctx.broadcastToWs).toHaveBeenCalledWith("session_reset", { sessionKey: SK });
  });

  test("logs transcript meta", async () => {
    const ctx = createMockCtx();
    await resetSession(ctx, SK);

    const metaLogs = (ctx as any)._metaLogs;
    expect(metaLogs).toHaveLength(1);
    expect(metaLogs[0].type).toBe("session_reset");
  });

  test("hook failure doesn't block reset", async () => {
    const ctx = createMockCtx({
      registry: {
        hooks: {
          dispatch: mock(async () => { throw new Error("hook failed"); }),
        },
      } as any,
    });

    // Should not throw
    const result = await resetSession(ctx, SK);
    expect(result.sessionKey).toBe(SK);
  });

  test("returns complete result object", async () => {
    const ctx = createMockCtx();
    const result = await resetSession(ctx, SK);

    expect(result).toHaveProperty("sessionKey", SK);
    expect(result).toHaveProperty("rpcReset");
    expect(result).toHaveProperty("stateReset");
    expect(result).toHaveProperty("queueCleared");
    expect(result).toHaveProperty("eventsCleared");
  });
});
