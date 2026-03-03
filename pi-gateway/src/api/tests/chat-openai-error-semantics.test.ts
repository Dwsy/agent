import { describe, expect, test } from "bun:test";
import { handleApiChat, handleApiChatStream } from "../chat-api.ts";
import { handleOpenAiChat } from "../openai-compat.ts";

function createCtx(overrides: Record<string, unknown> = {}) {
  const sessions = new Map<string, any>();

  return {
    sessions: {
      get: (key: string) => sessions.get(key),
      has: (key: string) => sessions.has(key),
      getOrCreate: (key: string, state: any) => {
        if (!sessions.has(key)) sessions.set(key, state);
        return sessions.get(key);
      },
      size: sessions.size,
    },
    buildSessionProfile: () => ({ signature: "test", cwd: process.cwd() }),
    pool: {
      acquire: async () => ({
        id: "rpc-1",
        sessionKey: "",
        onEvent: () => () => {},
        prompt: async () => {},
        waitForIdle: async () => {},
      }),
    },
    config: {
      agent: {
        timeoutMs: 50,
        model: "test/model",
      },
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    ...overrides,
  } as any;
}

describe("chat/openai error semantics", () => {
  test("/api/chat returns error status when rpc fails", async () => {
    const ctx = createCtx({
      pool: {
        acquire: async () => ({
          id: "rpc-1",
          sessionKey: "",
          onEvent: () => () => {},
          prompt: async () => {
            throw new Error("queue timeout");
          },
          waitForIdle: async () => {},
        }),
      },
    });

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t1", "user-agent": "ua-a" },
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await handleApiChat(req, ctx);
    expect(res.status).toBe(504);
    const json = await res.json() as { error: string };
    expect(json.error).toContain("queue timeout");
  });

  test("/v1/chat/completions non-stream returns OpenAI error", async () => {
    const ctx = createCtx({
      pool: {
        acquire: async () => ({
          id: "rpc-1",
          sessionKey: "",
          onEvent: () => () => {},
          prompt: async () => {
            throw new Error("rpc crashed");
          },
          waitForIdle: async () => {},
        }),
      },
    });

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t1", "user-agent": "ua-a" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    const res = await handleOpenAiChat(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json() as { error: { message: string } };
    expect(json.error).toBeDefined();
    expect(json.error.message).toContain("rpc crashed");
  });

  test("streaming path does not emit fake stop on failure", async () => {
    const ctx = createCtx({
      pool: {
        acquire: async () => ({
          id: "rpc-1",
          sessionKey: "",
          onEvent: () => () => {},
          prompt: async () => {
            throw new Error("stream failed");
          },
          waitForIdle: async () => {},
        }),
      },
      config: {
        agent: {
          timeoutMs: 50,
          model: "test/model",
        },
      },
    });

    const req = new Request("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t1", "user-agent": "ua-a" },
      body: JSON.stringify({ message: "hello" }),
    });

    const textRes = await handleApiChatStream(req, ctx);
    const content = await textRes.text();

    expect(content).toContain("\"type\":\"error\"");
    expect(content).not.toContain("\"type\":\"done\"");
  });

  test("openai stream does not emit fake stop on failure", async () => {
    const ctx = createCtx({
      pool: {
        acquire: async () => ({
          id: "rpc-1",
          sessionKey: "",
          onEvent: () => () => {},
          prompt: async () => {
            throw new Error("openai stream failed");
          },
          waitForIdle: async () => {},
        }),
      },
    });

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t1", "user-agent": "ua-a" },
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const res = await handleOpenAiChat(req, ctx);
    expect(res.status).toBe(200);

    const content = await res.text();
    expect(content).toContain("\"object\":\"error\"");
    expect(content).not.toContain("\"finish_reason\":\"stop\"");
  });
});
