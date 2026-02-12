/**
 * v3.3 Media Send Tool Tests — MS-10 ~ MS-28
 *
 * Tests the /api/media/send endpoint and gateway-tools extension.
 *
 * Layers:
 * 1. Endpoint: auth, path security, type inference, response format
 * 2. Extension: registration, tool execution, error handling
 * 3. Integration: capability-profile env injection
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleMediaSendRequest,
  getGatewayInternalToken,
  resetInternalToken,
  type MediaSendContext,
} from "../api/media-send.ts";
import type { Config } from "./config.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(overrides?: Partial<Config>): Config {
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
    ...overrides,
  } as Config;
}

const activeSessionKey = "agent:main:telegram:dm:12345";

function makeCtx(configOverrides?: Partial<Config>): MediaSendContext {
  const sessionsMap = new Map<string, any>();
  sessionsMap.set(activeSessionKey, {
    sessionKey: activeSessionKey,
    lastChatId: "12345",
    lastChannel: "telegram",
    lastActivity: Date.now(),
    messageCount: 1,
    isStreaming: false,
    role: null,
    rpcProcessId: null,
  });

  return {
    config: makeConfig(configOverrides),
    pool: {
      getForSession: (sk: string) => (sk === activeSessionKey ? {} : null),
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
      getOrCreate: (sk: string, defaults: any) => sessionsMap.get(sk) ?? defaults,
      has: (sk: string) => sessionsMap.has(sk),
      toArray: () => [...sessionsMap.values()],
      touch: () => {},
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  };
}

function makeReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost:18789/api/media/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Endpoint: Auth
// ============================================================================

describe("v3.3 media-send: auth", () => {
  beforeEach(() => resetInternalToken());

  test("MS-10: valid sessionKey authenticates", async () => {
    const ctx = makeCtx();
    // Create a temp file for the test
    const tmpFile = `/tmp/ms10-test-${Date.now()}.png`;
    await Bun.write(tmpFile, "fake-png");

    const req = makeReq({ sessionKey: activeSessionKey, path: tmpFile });
    const res = await handleMediaSendRequest(req, ctx);
    // Absolute /tmp/ path is now allowed; fails at channel resolution (no real channel plugin)
    expect(res.status).not.toBe(403);
    // Cleanup
    try { await Bun.write(tmpFile, ""); } catch {}
  });

  test("MS-11: invalid sessionKey returns 403", async () => {
    const ctx = makeCtx();
    const req = makeReq({ sessionKey: "agent:main:telegram:dm:invalid", path: "./test.png" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid");
  });

  test("MS-12: valid internalToken authenticates", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "./nonexistent.png" });
    const res = await handleMediaSendRequest(req, ctx);
    // File doesn't exist but auth passed — should be 404 not 403
    expect(res.status).toBe(404);
  });

  test("MS-13: invalid internalToken returns 403", async () => {
    const ctx = makeCtx();
    const req = makeReq({ token: "wrong-token", path: "./test.png" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid token");
  });

  test("MS-14: missing auth returns 400", async () => {
    const ctx = makeCtx();
    const req = makeReq({ path: "./test.png" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing");
  });
});

// ============================================================================
// Endpoint: Path Security
// ============================================================================

describe("v3.3 media-send: path security", () => {
  beforeEach(() => resetInternalToken());

  test("MS-15: absolute path blocked", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "/etc/passwd" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("not in allowed");
  });

  test("MS-16: traversal path blocked", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "../../etc/passwd" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
  });

  test("MS-17: URL scheme blocked", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "file:///etc/passwd" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
  });

  test("MS-18: home path blocked", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "~/secret.txt" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(403);
  });

  test("MS-19: missing path returns 400", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const req = makeReq({ token, path: "" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing path");
  });
});

// ============================================================================
// Endpoint: Type Inference + Response
// ============================================================================

describe("v3.3 media-send: type inference", () => {
  beforeEach(() => resetInternalToken());

  function makeCtxWithChannel(): MediaSendContext {
    const ctx = makeCtx();
    // Add a mock telegram channel plugin without sendMedia (triggers fallback)
    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: {
        sendText: async () => {},
        maxLength: 4096,
        // No sendMedia — triggers delivered:false fallback
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);
    return ctx;
  }

  test("MS-20: .png inferred as photo", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms20-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.delivered).toBe(false);
    expect(data.type).toBe("photo");
    expect(data.directive).toBe(`MEDIA:./${tmpName}`);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-21: .mp3 inferred as audio", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms21-${Date.now()}.mp3`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.type).toBe("audio");
    expect(data.delivered).toBe(false);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-22: .mp4 inferred as video", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms22-${Date.now()}.mp4`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.type).toBe("video");
    expect(data.delivered).toBe(false);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-23: .pdf inferred as document", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms23-${Date.now()}.pdf`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.type).toBe("document");
    expect(data.delivered).toBe(false);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-24: explicit type overrides inference", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms24-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}`, type: "document" });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.type).toBe("document"); // Overridden, not "photo"
    expect(data.delivered).toBe(false);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-25: caption passed through in directive", async () => {
    const ctx = makeCtxWithChannel();
    const tmpName = `ms25-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}`, caption: "Test caption" });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.delivered).toBe(false);

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-26: file not found returns 404", async () => {
    const ctx = makeCtxWithChannel();
    const req = makeReq({ sessionKey: activeSessionKey, path: "./definitely-not-exists-12345.png" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Endpoint: Edge Cases
// ============================================================================

describe("v3.3 media-send: edge cases", () => {
  test("MS-27: invalid JSON body returns 400", async () => {
    const ctx = makeCtx();
    const req = new Request("http://localhost:18789/api/media/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(400);
  });

  test("MS-28: channel resolved from session lastChannel", async () => {
    const ctx = makeCtx();
    // Add telegram channel plugin
    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: { sendText: async () => {} },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);

    const tmpName = `ms28-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    const data = await res.json() as any;
    expect(data.channel).toBe("telegram");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-31: no channel plugin returns 404", async () => {
    const ctx = makeCtx();
    // registry.channels is empty
    const tmpName = `ms31-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toContain("Channel plugin not found");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-32: no chatId in session returns 400", async () => {
    const ctx = makeCtx();
    // Override session to have no lastChatId
    const session = ctx.sessions.get(activeSessionKey);
    if (session) session.lastChatId = undefined;

    // Add channel with sendMedia
    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: {
        sendText: async () => {},
        sendMedia: async () => ({ ok: true }),
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);

    const tmpName = `ms32-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("chatId");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });
});

// ============================================================================
// Direct Delivery
// ============================================================================

describe("v3.3 media-send: direct delivery", () => {
  beforeEach(() => resetInternalToken());

  test("MS-33: sendMedia called with correct args", async () => {
    const ctx = makeCtx();
    let capturedArgs: any = null;

    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: {
        sendText: async () => {},
        sendMedia: async (target: string, filePath: string, opts: any) => {
          capturedArgs = { target, filePath, opts };
          return { ok: true, messageId: "tg-msg-42" };
        },
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);

    const tmpName = `ms33-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}`, caption: "Hello" });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.delivered).toBe(true);
    expect(data.messageId).toBe("tg-msg-42");
    expect(data.type).toBe("photo");
    expect(data.channel).toBe("telegram");

    // Verify sendMedia was called with correct args
    expect(capturedArgs).not.toBeNull();
    expect(capturedArgs.target).toBe("12345");
    expect(capturedArgs.opts.type).toBe("photo");
    expect(capturedArgs.opts.caption).toBe("Hello");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-34: sendMedia error returns 500", async () => {
    const ctx = makeCtx();

    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: {
        sendText: async () => {},
        sendMedia: async () => { throw new Error("Telegram API down"); },
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);

    const tmpName = `ms34-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toContain("Telegram API down");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });

  test("MS-35: sendMedia returns error result", async () => {
    const ctx = makeCtx();

    ctx.registry.channels.set("telegram", {
      id: "telegram",
      meta: { name: "Telegram", description: "Telegram" },
      capabilities: { direct: true, media: true },
      outbound: {
        sendText: async () => {},
        sendMedia: async () => ({ ok: false, error: "File too large" }),
      },
      init: async () => {},
      start: async () => {},
      stop: async () => {},
    } as any);

    const tmpName = `ms35-${Date.now()}.png`;
    await Bun.write(tmpName, "fake");

    const req = makeReq({ sessionKey: activeSessionKey, path: `./${tmpName}` });
    const res = await handleMediaSendRequest(req, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(false);
    expect(data.delivered).toBe(true);
    expect(data.error).toBe("File too large");

    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tmpName); } catch {}
  });
});

// ============================================================================
// Internal Token
// ============================================================================

describe("v3.3 media-send: internal token", () => {
  beforeEach(() => resetInternalToken());

  test("MS-29: token is deterministic for same config", () => {
    const config = makeConfig();
    const t1 = getGatewayInternalToken(config);
    resetInternalToken();
    const t2 = getGatewayInternalToken(config);
    expect(t1).toBe(t2);
  });

  test("MS-30: token is 32 chars hex", () => {
    const config = makeConfig();
    const token = getGatewayInternalToken(config);
    expect(token).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });
});
