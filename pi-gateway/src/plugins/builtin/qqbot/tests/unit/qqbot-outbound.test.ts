import { afterEach, describe, expect, mock, test } from "bun:test";
import { sendQqbotText, sendQqbotKeyboard, sendQqbotNativeStream, chunkQqbotText, encodeBaseQqbotTarget, toQqbotKeyboard } from "../../outbound.ts";
import { sendQqbotMedia } from "../../media.ts";

function createRuntime(overrides?: Record<string, unknown>): any {
  return {
    api: {
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      config: {},
    },
    channelCfg: {
      enabled: true,
      appId: "123",
      clientSecret: "secret",
      dmPolicy: "pairing",
      groupPolicy: "disabled",
      requireMention: true,
      textChunkLimit: 1500,
      passiveReplyOnly: false,
      streaming: {
        enabled: true,
        editThrottleMs: 1200,
        streamStartChars: 80,
      },
    },
    intents: 0,
    token: { accessToken: "token", expiresAt: Date.now() + 120_000 },
    dedup: new Map(),
    replyState: new Map(),
    streamPlaceholders: new Map(),
    dispatchLock: new Map(),
    seq: null,
    ws: null,
    heartbeatTimer: null,
    reconnectTimer: null,
    disposed: false,
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  mock.restore();
  globalThis.fetch = originalFetch;
});

describe("qqbot outbound", () => {
  test("chunks long text with small limits", () => {
    expect(chunkQqbotText("abcdefghijk", 4)).toEqual(["abcd", "efgh", "ijk"]);
  });

  test("splits long passive replies and increments msg_seq", async () => {
    const runtime = createRuntime({
      channelCfg: {
        enabled: true,
        appId: "123",
        clientSecret: "secret",
        dmPolicy: "pairing",
        groupPolicy: "disabled",
        requireMention: true,
        textChunkLimit: 10,
        passiveReplyOnly: false,
        streaming: { enabled: true, editThrottleMs: 1200, streamStartChars: 80 },
      },
    });

    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: `msg-${payloads.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotText(runtime, "group|group-1|msg=source-1|seq=1", "abcdefghijklmnopqrstuvwxyz");

    expect(result.ok).toBeTrue();
    expect(result.messageId).toBe("msg-3");
    expect(payloads.map((payload) => (payload.markdown as any)?.content)).toEqual(["abcdefghij", "klmnopqrst", "uvwxyz"]);
    expect(payloads.every((payload) => payload.msg_type === 2)).toBeTrue();
    expect(payloads.map((payload) => payload.msg_seq)).toEqual([1, 2, 3]);

    const replyState = runtime.replyState.get(encodeBaseQqbotTarget({ peerType: "group", id: "group-1" }));
    expect(replyState?.msgId).toBe("source-1");
    expect(replyState?.msgSeq).toBe(4);
    expect(replyState?.passive).toBeTrue();
  });

  test("reuses passive reply state for subsequent sends", async () => {
    const runtime = createRuntime();
    runtime.replyState.set("group|group-1", {
      msgId: "source-1",
      msgSeq: 2,
      passive: true,
    });

    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "msg-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotText(runtime, "group|group-1", "hello");

    expect(result.ok).toBeTrue();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.msg_id).toBe("source-1");
    expect(payloads[0]?.msg_seq).toBe(2);
    expect(payloads[0]?.msg_type).toBe(2);
    expect((payloads[0]?.markdown as any)?.content).toBe("hello");
  });

  test("blocks active text sends when passiveReplyOnly is enabled", async () => {
    const runtime = createRuntime({
      channelCfg: {
        enabled: true,
        appId: "123",
        clientSecret: "secret",
        dmPolicy: "pairing",
        groupPolicy: "disabled",
        requireMention: true,
        textChunkLimit: 1500,
        passiveReplyOnly: true,
        streaming: { enabled: true, editThrottleMs: 1200, streamStartChars: 80 },
      },
    });

    const fetchMock = mock(async () => {
      throw new Error("fetch should not be called");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotText(runtime, "group|group-1", "hello");

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("passiveReplyOnly");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("sends markdown keyboard payloads", async () => {
    const runtime = createRuntime();

    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "msg-kb-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotKeyboard(runtime, "group|group-1|msg=source-1|seq=1", "选择一个选项", {
      inline_keyboard: [[{ text: "A", callbackData: "kb:k1:a" }, { text: "Docs", url: "https://example.com" }]],
    });

    expect(result.ok).toBeTrue();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.msg_type).toBe(2);
    expect(payloads[0]?.markdown).toEqual({ content: "选择一个选项" });
    const rows = (((payloads[0]?.keyboard as any)?.content?.rows) ?? []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.buttons?.[0]?.action?.type).toBe(1);
    expect(rows[0]?.buttons?.[0]?.action?.data).toBe("kb:k1:a");
    expect(rows[0]?.buttons?.[1]?.action?.type).toBe(0);
    expect(rows[0]?.buttons?.[1]?.action?.data).toBe("https://example.com");
  });

  test("maps inline keyboard markup to QQBot keyboard payload", () => {
    const keyboard = toQqbotKeyboard({
      inline_keyboard: [[{ text: "A", callbackData: "kb:k1:a" }, { text: "Docs", url: "https://example.com" }]],
    });
    expect(keyboard.content.rows).toHaveLength(1);
    expect(keyboard.content.rows[0]?.buttons).toHaveLength(2);
    expect(keyboard.content.rows[0]?.buttons?.[0]?.action?.type).toBe(1);
    expect(keyboard.content.rows[0]?.buttons?.[1]?.action?.type).toBe(0);
  });



  test("reuses stream hints instead of resending plain chunks", async () => {
    const runtime = createRuntime();
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: `msg-${payloads.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotText(runtime, "c2c|user-1", "hello world", {
      streamMode: "partial",
      streamId: "stream-1",
      channelMeta: { transport: "partial", streamId: "stream-1", streamIndex: 2, streamReset: false },
    });

    expect(result.ok).toBeTrue();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.msg_type).toBe(2);
    expect((payloads[0]?.markdown as any)?.content).toBe("hello world");
    expect((payloads[0]?.stream as any)?.id).toBe("stream-1");
    expect((payloads[0]?.stream as any)?.index).toBe(2);
    expect((payloads[0]?.stream as any)?.state).toBe(1);
  });

  test("sends native stream markdown payloads", async () => {
    const runtime = createRuntime();
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: `stream-${payloads.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const text = `第一行
第二行
第三行
第四行`;
    const result = await sendQqbotNativeStream(runtime, "c2c|user-1", text);

    expect(result.ok).toBeTrue();
    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads[0]?.msg_type).toBe(2);
    expect((payloads[0]?.stream as any)?.state).toBe(1);
    expect((payloads[payloads.length - 1]?.stream as any)?.state).toBe(10);
    expect((payloads[payloads.length - 1]?.stream as any)?.reset).toBeTrue();
    expect((payloads[payloads.length - 1]?.markdown as any)?.content).toBe(text);
  });

  test("blocks active media sends when passiveReplyOnly is enabled", async () => {
    const runtime = createRuntime({
      channelCfg: {
        enabled: true,
        appId: "123",
        clientSecret: "secret",
        dmPolicy: "pairing",
        groupPolicy: "disabled",
        requireMention: true,
        textChunkLimit: 1500,
        passiveReplyOnly: true,
        streaming: { enabled: true, editThrottleMs: 1200, streamStartChars: 80 },
      },
    });

    const fetchMock = mock(async () => {
      throw new Error("fetch should not be called");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendQqbotMedia(runtime, "guild|channel-1|guild=guild-1|channel=channel-1", "/tmp/example.png", {
      caption: "image",
    });

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("passiveReplyOnly");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
