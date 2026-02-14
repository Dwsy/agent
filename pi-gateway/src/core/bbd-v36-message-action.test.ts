/**
 * v3.6 Message Action Tests — MA-01 ~ MA-20
 *
 * Tests the /api/message/action endpoint (react/edit/delete).
 * Verifies auth, validation, channel resolution, and action dispatch.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { handleMessageAction, type MessageActionContext } from "../api/message-action.ts";
import { getGatewayInternalToken, resetInternalToken } from "../api/media-send.ts";
import type { Config } from "./config.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    port: 52134,
    host: "0.0.0.0",
    auth: { mode: "none" },
    channels: {},
    hooks: { enabled: false },
    pool: { min: 1, max: 4, idleTimeoutMs: 300_000 },
    queue: {},
    agent: {},
    delegation: { timeoutMs: 120_000, maxTimeoutMs: 600_000, onTimeout: "abort", maxDepth: 1, maxConcurrent: 2 },
    gateway: { port: 52134, bind: "loopback", auth: { mode: "none" } },
    agents: { default: "main", list: [{ id: "main", workspace: process.cwd() }] },
    ...overrides,
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
        sendReaction: async (_t: string, _m: string, emoji: string | string[]) => ({ ok: true, emoji }),
        editMessage: async (_t: string, _m: string, _text: string) => ({ ok: true }),
        deleteMessage: async (_t: string, _m: string) => ({ ok: true }),
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
  return new Request("http://localhost:52134/api/message/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Validation
// ============================================================================

describe("v3.6 message-action: validation", () => {
  test("MA-01: invalid JSON returns 400", async () => {
    const ctx = makeCtx();
    const req = new Request("http://localhost:52134/api/message/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
  });

  test("MA-02: missing action returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: activeSessionKey, messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid action");
  });

  test("MA-03: invalid action returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: activeSessionKey, messageId: "42", action: "explode" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid action");
  });

  test("MA-04: missing messageId returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: activeSessionKey, action: "react", emoji: "👍" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing messageId");
  });

  test("MA-05: react without emoji returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: activeSessionKey, action: "react", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing emoji");
  });

  test("MA-06: edit without text returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: activeSessionKey, action: "edit", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing text");
  });
});

// ============================================================================
// Auth
// ============================================================================

describe("v3.6 message-action: auth", () => {
  beforeEach(() => resetInternalToken());

  test("MA-07: valid sessionKey authenticates", async () => {
    const ctx = makeCtx({ withChannel: true });
    const req = makeReq({ sessionKey: activeSessionKey, action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
  });

  test("MA-08: invalid sessionKey returns 403", async () => {
    const ctx = makeCtx({ withChannel: true });
    const req = makeReq({ sessionKey: "agent:main:telegram:dm:invalid", action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(403);
  });

  test("MA-09: valid internalToken authenticates", async () => {
    const ctx = makeCtx({ withChannel: true });
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, action: "delete", messageId: "42" });
    // No PID → no session → no channel → 400
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
  });

  test("MA-10: invalid token returns 403", async () => {
    const ctx = makeCtx();
    const req = makeReq({ token: "wrong", action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(403);
  });

  test("MA-11: missing auth returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Channel Resolution
// ============================================================================

describe("v3.6 message-action: channel resolution", () => {
  test("MA-12: no channel plugin returns 404", async () => {
    const ctx = makeCtx(); // no channel registered
    const req = makeReq({ sessionKey: activeSessionKey, action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toContain("Channel plugin not found");
  });

  test("MA-13: no chatId in session returns 400", async () => {
    const ctx = makeCtx({ withChannel: true });
    const session = ctx.sessions.get(activeSessionKey);
    if (session) session.lastChatId = undefined;
    const req = makeReq({ sessionKey: activeSessionKey, action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("chatId");
  });
});

// ============================================================================
// React Action
// ============================================================================

describe("v3.6 message-action: react", () => {
  test("MA-14: react with string emoji succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        sendReaction: async (target: string, msgId: string, emoji: string | string[], opts: any) => {
          captured = { target, msgId, emoji, opts };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "react", messageId: "42", emoji: "👍" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.action).toBe("react");
    expect(captured.target).toBe("12345");
    expect(captured.msgId).toBe("42");
    expect(captured.emoji).toBe("👍");
  });

  test("MA-15: react with emoji array succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        sendReaction: async (_t: string, _m: string, emoji: string | string[]) => {
          captured = { emoji };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "react", messageId: "42", emoji: ["👍", "❤️"] });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    expect(captured.emoji).toEqual(["👍", "❤️"]);
  });

  test("MA-16: react unsupported returns 501", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: { sendReaction: undefined },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "react", messageId: "42", emoji: "👍" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(501);
  });
});

// ============================================================================
// Edit Action
// ============================================================================

describe("v3.6 message-action: edit", () => {
  test("MA-17: edit message succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        editMessage: async (target: string, msgId: string, text: string) => {
          captured = { target, msgId, text };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "edit", messageId: "42", text: "Updated text" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.action).toBe("edit");
    expect(captured.target).toBe("12345");
    expect(captured.msgId).toBe("42");
    expect(captured.text).toBe("Updated text");
  });

  test("MA-18: edit unsupported returns 501", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: { editMessage: undefined },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "edit", messageId: "42", text: "Updated" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(501);
  });
});

// ============================================================================
// Delete Action
// ============================================================================

describe("v3.6 message-action: delete", () => {
  test("MA-19: delete message succeeds", async () => {
    let captured: any = null;
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        deleteMessage: async (target: string, msgId: string) => {
          captured = { target, msgId };
          return { ok: true };
        },
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.action).toBe("delete");
    expect(captured.target).toBe("12345");
    expect(captured.msgId).toBe("42");
  });

  test("MA-20: channel error returns 502", async () => {
    const ctx = makeCtx({
      withChannel: true,
      channelOverrides: {
        deleteMessage: async () => ({ ok: false, error: "Bot lacks permission" }),
      },
    });
    const req = makeReq({ sessionKey: activeSessionKey, action: "delete", messageId: "42" });
    const res = await handleMessageAction(req, ctx);
    expect(res.status).toBe(502);
    const data = await res.json() as any;
    expect(data.error).toBe("Bot lacks permission");
  });
});
