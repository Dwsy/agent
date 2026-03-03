import { describe, expect, test } from "bun:test";
import { handleApiChat } from "../chat-api.ts";

function createCtx() {
  const sessions = new Map<string, any>();
  const acquired: string[] = [];

  const ctx = {
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
      acquire: async (sessionKey: string) => {
        acquired.push(sessionKey);
        return {
          id: `rpc-${acquired.length}`,
          sessionKey,
          onEvent: () => () => {},
          prompt: async () => {},
          waitForIdle: async () => {},
        };
      },
    },
    config: {
      agent: {
        timeoutMs: 100,
      },
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as any;

  return { ctx, acquired };
}

describe("api session isolation e2e", () => {
  test("different identities without sessionKey derive different default sessions", async () => {
    const { ctx, acquired } = createCtx();

    const reqA = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token-A",
        "user-agent": "ua-a",
        "x-forwarded-for": "1.1.1.1",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const reqB = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token-B",
        "user-agent": "ua-b",
        "x-forwarded-for": "2.2.2.2",
      },
      body: JSON.stringify({ message: "hello" }),
    });

    const resA = await handleApiChat(reqA, ctx);
    const resB = await handleApiChat(reqB, ctx);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(acquired).toHaveLength(2);
    expect(acquired[0]).not.toBe(acquired[1]);
    expect(acquired[0].startsWith("agent:main:api:")).toBe(true);
    expect(acquired[1].startsWith("agent:main:api:")).toBe(true);
  });

  test("explicit sessionKey still has higher priority than derived identity key", async () => {
    const { ctx, acquired } = createCtx();

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token-Z",
        "user-agent": "ua-z",
        "x-forwarded-for": "9.9.9.9",
      },
      body: JSON.stringify({
        message: "hello",
        sessionKey: "agent:main:api:manual-session",
      }),
    });

    const res = await handleApiChat(req, ctx);

    expect(res.status).toBe(200);
    expect(acquired).toEqual(["agent:main:api:manual-session"]);
  });
});
