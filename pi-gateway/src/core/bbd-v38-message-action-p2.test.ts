/**
 * v3.8 Message Action Phase 2 Tests — MA-21 ~ MA-30
 *
 * Tests pin/unpin and read-history actions added in T2.
 * Follows MA-01~MA-20 style from bbd-v36-message-action.test.ts.
 */

import { describe, test, expect } from "bun:test";
import { handleMessageAction, type MessageActionContext } from "../api/message-action.ts";
import type { Config } from "./config.ts";
import type { ReadHistoryResult } from "../plugins/types.ts";

// ============================================================================
// Helpers (aligned with v3.6 test helpers)
// ============================================================================

function makeConfig(): Config {
  return {
    port: 18789,
    host: "0.0.0.0",
    auth: { mode: "none" },
    channels: {},
    hooks: { enabled: false },
    pool: { min: 1, max: 4, idleTimeoutMs: 300_000 },
    queue: {},
    agent: {},
    delegation: { timeoutMs: 120_000, maxTimeoutMs: 600_000, onTimeout: "abort", maxDepth: 1, maxConcurrent: 2 },
    gateway: { port: 18789, bind: "loopback", auth: { mode: "none" } },
    agents: { default: "main", list: [{ id: "main", workspace: process.cwd() }] },
  } as Config;
}

const activeSessionKey = "agent:main:telegram:dm:12345";

function makeCtx(opts?: { withChannel?: boolean; channelOverrides?: Record<string, unknown> }): MessageActionContext {
  const sessionsMap = new Map<string, any>();
  sessionsMap.set(activeSessionKey, {
    sessionKey: activeSessionKey,
    lastChatId: "12345",
    lastChannel: "telegram",
    lastActivity: Date.now(),
    messageCount: 1,
    isStreaming: false,
  });

  const ctx: MessageActionContext = {
    config: makeConfig(),
    pool: {
      getForSession: (sk: string) => (sk === activeSessionKey ? {} : null),
      getByPid: () => null,
    } as any,
    registry: {
      channels: new Map(),
      tools: new Map(),
      hooks: { dispatch: async () => {} },
      commands: new Map(),
      httpRoutes: [],
      wsMethods: new Map(),
      services: [],
    } as any,
    sessions: {
      get: (sk: string) => sessionsMap.get(sk),
      has: (sk: string) => sessionsMap.has(sk),
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  };

  if (opts?.withChannel) {
    ctx.registry.channels.set("telegram", {
      id: "telegram",
      outbound: {
        sendText: async () => ({ ok: true }),
        sendReaction: async () => ({ ok: true }),
        editMessage: async () => ({ ok: true }),
        deleteMessage: async () => ({ ok: true }),
        pinMessage: async () => ({ ok: true }),
        readHistory: async () => ({ ok: true, messages: [] }),
        ...opts.channelOverrides,
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);
  }

  return ctx;
}

function makeReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost:18789/api/message/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Pin Action
// ============================================================================

describe("v3.8 message-action: pin", () => {
  test("MA-21: pin message succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        pinMessage: async (target: string, msgId: string, unpin: boolean) => {
          captured = { target, msgId, unpin };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "pin", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.action).toBe("pin");
    expect(data.messageId).toBe("42");
    expect(data.unpin).toBe(false);
    expect(captured.target).toBe("12345");
    expect(captured.msgId).toBe("42");
    expect(captured.unpin).toBe(false);
  });

  test("MA-22: unpin message succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        pinMessage: async (target: string, msgId: string, unpin: boolean) => {
          captured = { target, msgId, unpin };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "pin", messageId: "42", unpin: true });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.unpin).toBe(true);
    expect(captured.unpin).toBe(true);
  });

  test("MA-23: pin unsupported returns 501", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: { pinMessage: undefined },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "pin", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(501);
    const data = await res.json() as any;
    expect(data.error).toContain("pinning");
  });

  test("MA-24: pin channel error returns 502", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        pinMessage: async () => ({ ok: false, error: "Bot lacks pin permission" }),
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "pin", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(502);
    const data = await res.json() as any;
    expect(data.error).toBe("Bot lacks pin permission");
  });
});

// ============================================================================
// Read History Action
// ============================================================================

describe("v3.8 message-action: read", () => {
  test("MA-25: read history succeeds with default limit", async () => {
    let captured: any = null;
    const messages = [
      { id: "100", text: "Hello", sender: "user1", timestamp: 1000 },
      { id: "101", text: "World", sender: "user2", timestamp: 1001 },
    ];
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        readHistory: async (target: string, limit: number, before?: string): Promise<ReadHistoryResult> => {
          captured = { target, limit, before };
          return { ok: true, messages };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "read" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.action).toBe("read");
    expect(data.messages).toEqual(messages);
    expect(captured.target).toBe("12345");
    expect(captured.limit).toBe(20);
    expect(captured.before).toBeUndefined();
  });

  test("MA-26: read history with custom limit and before", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        readHistory: async (target: string, limit: number, before?: string): Promise<ReadHistoryResult> => {
          captured = { target, limit, before };
          return { ok: true, messages: [] };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "read", limit: 50, before: "msg-99" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    expect(captured.limit).toBe(50);
    expect(captured.before).toBe("msg-99");
  });

  test("MA-27: read history caps limit at 100", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        readHistory: async (_t: string, limit: number): Promise<ReadHistoryResult> => {
          captured = { limit };
          return { ok: true, messages: [] };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "read", limit: 500 });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    expect(captured.limit).toBe(100);
  });

  test("MA-28: read does not require messageId", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        readHistory: async (): Promise<ReadHistoryResult> => ({ ok: true, messages: [] }),
      },
    });
    // No messageId — should still work for read action
    const req = makeReq({ sessionKey: activeSessionKey, action: "read" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
  });

  test("MA-29: read unsupported returns 501", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: { readHistory: undefined },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "read" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(501);
    const data = await res.json() as any;
    expect(data.error).toContain("read history");
  });

  test("MA-30: read channel error returns 502", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        readHistory: async (): Promise<ReadHistoryResult> => ({ ok: false, error: "Rate limited" }),
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "read" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(502);
    const data = await res.json() as any;
    expect(data.error).toBe("Rate limited");
  });
});
