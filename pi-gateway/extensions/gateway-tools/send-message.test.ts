import { afterEach, describe, expect, test } from "bun:test";
import { createSendMessageTool } from "./send-message.ts";

const originalFetch = globalThis.fetch;
const originalSessionKey = process.env.PI_GATEWAY_SESSION_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSessionKey === undefined) delete process.env.PI_GATEWAY_SESSION_KEY;
  else process.env.PI_GATEWAY_SESSION_KEY = originalSessionKey;
});

describe("gateway send_message tool", () => {
  test("wechat channel sends once without edit actions even for long text", async () => {
    process.env.PI_GATEWAY_SESSION_KEY = "agent:main:main:main";

    const calls: Array<{ url: string; body?: any }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });

      if (url.includes("/api/sessions/")) {
        return new Response(JSON.stringify({ session: { lastChannel: "wechat" } }), { status: 200 });
      }
      if (url.includes("/api/message/send")) {
        return new Response(JSON.stringify({ ok: true, textLength: String(body?.text ?? "").length, chunkCount: 1, messageId: "mid-1" }), { status: 200 });
      }
      if (url.includes("/api/message/action")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const tool = createSendMessageTool("http://gateway.local", "internal-token", "auth-token");
    const longText = "x".repeat(300);

    const result = await tool.execute("tool-1", { text: longText }, new AbortController().signal);

    expect(result.details).toEqual({ ok: true });
    expect(calls.filter((c) => c.url.includes("/api/message/send"))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("/api/message/action"))).toHaveLength(0);
    expect(calls.find((c) => c.url.includes("/api/message/send"))?.body?.streamMode).toBe("off");
  });
});
