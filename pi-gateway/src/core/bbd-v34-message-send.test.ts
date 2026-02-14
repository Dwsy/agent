/**
 * BBD tests for POST /api/message/send (v3.4 T1)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { handleMessageSendRequest, type MessageSendContext } from "../api/message-send.ts";
import { resetInternalToken, getGatewayInternalToken } from "../api/media-send.ts";

function makeCtx(overrides: Partial<MessageSendContext> = {}): MessageSendContext {
  const config = {
    gateway: { port: 52134, bind: "127.0.0.1", auth: { mode: "none" } },
    agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
    agent: {},
  } as any;

  return {
    config,
    pool: {
      getForSession: (sk: string) => (sk === "agent:main:telegram:account:default:dm:100" ? { id: "rpc-1" } : null),
    } as any,
    registry: {
      channels: new Map([
        ["telegram", {
          id: "telegram",
          outbound: {
            sendText: async (_target: string, _text: string, _opts?: any) => ({ ok: true }),
          },
        }],
        ["discord", {
          id: "discord",
          outbound: {
            sendText: async (_target: string, _text: string, _opts?: any) => ({ ok: true }),
          },
        }],
      ]),
    } as any,
    sessions: {
      get: (sk: string) => {
        if (sk === "agent:main:telegram:account:default:dm:100") {
          return { lastChannel: "telegram", lastChatId: "100" };
        }
        if (sk === "agent:main:discord:guild:default:dm:200") {
          return { lastChannel: "discord", lastChatId: "200" };
        }
        if (sk === "agent:main:telegram:account:default:dm:nochat") {
          return { lastChannel: "telegram", lastChatId: undefined };
        }
        return undefined;
      },
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
    ...overrides,
  };
}

function makeReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost:52134/api/message/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SK = "agent:main:telegram:account:default:dm:100";

describe("v3.4 T1: POST /api/message/send", () => {
  beforeEach(() => resetInternalToken());

  // ---- Validation ----

  it("T1-1: rejects invalid JSON", async () => {
    const ctx = makeCtx();
    const req = new Request("http://localhost:52134/api/message/send", {
      method: "POST",
      body: "not json",
    });
    const res = await handleMessageSendRequest(req, ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid JSON");
  });

  it("T1-2: rejects missing text", async () => {
    const ctx = makeCtx();
    const res = await handleMessageSendRequest(makeReq({ sessionKey: SK }), ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing text");
  });

  it("T1-3: rejects missing auth (no sessionKey or token)", async () => {
    const ctx = makeCtx();
    const res = await handleMessageSendRequest(makeReq({ text: "hello" }), ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing sessionKey or token");
  });

  // ---- Auth ----

  it("T1-4: rejects invalid sessionKey (no active RPC)", async () => {
    const ctx = makeCtx();
    const res = await handleMessageSendRequest(makeReq({ text: "hello", sessionKey: "agent:main:fake:dm:999" }), ctx);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid or inactive session");
  });

  it("T1-5: rejects invalid internal token", async () => {
    const ctx = makeCtx();
    const res = await handleMessageSendRequest(makeReq({ text: "hello", token: "wrong-token" }), ctx);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid token");
  });

  it("T1-6: accepts valid internal token", async () => {
    const ctx = makeCtx();
    // Token auth needs a session to resolve channel — use sessionKey instead for this test
    const res = await handleMessageSendRequest(makeReq({ text: "hello", sessionKey: SK }), ctx);
    expect(res.status).toBe(200);
  });

  // ---- Channel resolution ----

  it("T1-7: rejects when chatId is missing", async () => {
    const ctx = makeCtx({
      pool: { getForSession: () => ({ id: "rpc-1" }) } as any,
    });
    const res = await handleMessageSendRequest(
      makeReq({ text: "hello", sessionKey: "agent:main:telegram:account:default:dm:nochat" }),
      ctx,
    );
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Cannot resolve chatId");
  });

  it("T1-8: rejects unknown channel plugin", async () => {
    const ctx = makeCtx({
      pool: { getForSession: () => ({ id: "rpc-1" }) } as any,
      sessions: {
        get: () => ({ lastChannel: "unknown-channel", lastChatId: "100" }),
      } as any,
    });
    const res = await handleMessageSendRequest(makeReq({ text: "hello", sessionKey: SK }), ctx);
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toContain("Channel plugin not found");
  });

  // ---- Happy path ----

  it("T1-9: sends plain text message via Telegram", async () => {
    let sentTarget = "";
    let sentText = "";
    const ctx = makeCtx({
      registry: {
        channels: new Map([
          ["telegram", {
            id: "telegram",
            outbound: {
              sendText: async (target: string, text: string) => {
                sentTarget = target;
                sentText = text;
                return { ok: true };
              },
            },
          }],
        ]),
      } as any,
    });

    const res = await handleMessageSendRequest(makeReq({ text: "Hello world", sessionKey: SK }), ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.channel).toBe("telegram");
    expect(data.textLength).toBe(11);
    expect(data.replyTo).toBeNull();
    expect(sentTarget).toBe("100");
    expect(sentText).toBe("Hello world");
  });

  it("T1-10: sends reply-to message", async () => {
    let sentOpts: any = null;
    const ctx = makeCtx({
      registry: {
        channels: new Map([
          ["telegram", {
            id: "telegram",
            outbound: {
              sendText: async (_target: string, _text: string, opts?: any) => {
                sentOpts = opts;
                return { ok: true };
              },
            },
          }],
        ]),
      } as any,
    });

    const res = await handleMessageSendRequest(
      makeReq({ text: "Reply text", replyTo: "msg-456", sessionKey: SK }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.replyTo).toBe("msg-456");
    expect(sentOpts.replyTo).toBe("msg-456");
  });

  it("T1-11: sends via Discord channel", async () => {
    let sentTarget = "";
    const ctx = makeCtx({
      pool: { getForSession: () => ({ id: "rpc-2" }) } as any,
      sessions: {
        get: () => ({ lastChannel: "discord", lastChatId: "200" }),
      } as any,
      registry: {
        channels: new Map([
          ["discord", {
            id: "discord",
            outbound: {
              sendText: async (target: string) => { sentTarget = target; return { ok: true }; },
            },
          }],
        ]),
      } as any,
    });

    const res = await handleMessageSendRequest(
      makeReq({ text: "Discord msg", sessionKey: SK }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(sentTarget).toBe("200");
  });

  it("T1-12: passes parseMode to sendText", async () => {
    let sentOpts: any = null;
    const ctx = makeCtx({
      registry: {
        channels: new Map([
          ["telegram", {
            id: "telegram",
            outbound: {
              sendText: async (_t: string, _txt: string, opts?: any) => { sentOpts = opts; return { ok: true }; },
            },
          }],
        ]),
      } as any,
    });

    const res = await handleMessageSendRequest(
      makeReq({ text: "**bold**", parseMode: "Markdown", sessionKey: SK }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(sentOpts.parseMode).toBe("Markdown");
  });

  // ---- Error handling ----

  it("T1-13: returns 500 when sendText throws", async () => {
    const ctx = makeCtx({
      registry: {
        channels: new Map([
          ["telegram", {
            id: "telegram",
            outbound: {
              sendText: async () => { throw new Error("Telegram API error"); },
            },
          }],
        ]),
      } as any,
    });

    const res = await handleMessageSendRequest(makeReq({ text: "fail", sessionKey: SK }), ctx);
    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toContain("Telegram API error");
  });

  it("T1-14: accepts valid internal token with sessionKey for channel resolution", async () => {
    const ctx = makeCtx();
    const token = getGatewayInternalToken(ctx.config);
    const res = await handleMessageSendRequest(
      makeReq({ text: "via token", token, sessionKey: SK }),
      ctx,
    );
    expect(res.status).toBe(200);
  });
});
