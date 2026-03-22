import { describe, expect, mock, test } from "bun:test";
import { sendQqbotText } from "../outbound.ts";
import { matchSlashCommand } from "../handlers.ts";
import type { QqbotPluginRuntime } from "../types.ts";

function createRuntime(streamingEnabled = false): QqbotPluginRuntime {
  return {
    api: {
      logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
      config: {},
    },
    channelCfg: {
      enabled: true,
      appId: "123",
      clientSecret: "secret",
      dmPolicy: "open" as const,
      groupPolicy: "open" as const,
      requireMention: true,
      textChunkLimit: 1500,
      passiveReplyOnly: false,
      streaming: { enabled: streamingEnabled, editThrottleMs: 0, streamStartChars: 0 },
    },
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
  } as any;
}

const originalFetch = globalThis.fetch;

describe("qqbot streaming benchmark", () => {
  test("METRIC: streaming disabled → outbound_msg_count = 1", async () => {
    let count = 0;
    globalThis.fetch = mock(async () => {
      count++;
      return new Response(JSON.stringify({ id: `msg-${count}` }), { status: 200 });
    }) as unknown as typeof fetch;

    const runtime = createRuntime(false);
    await sendQqbotText(runtime, "c2c|user-1", "hello world");

    globalThis.fetch = originalFetch;

    console.log(`METRIC outbound_msg_count=${count}`);
    expect(count).toBe(1);
  });

  test("METRIC: streaming enabled → sends 1 message (non-streaming path)", async () => {
    let count = 0;
    globalThis.fetch = mock(async () => {
      count++;
      return new Response(JSON.stringify({ id: `msg-${count}` }), { status: 200 });
    }) as unknown as typeof fetch;

    const runtime = createRuntime(true);
    await sendQqbotText(runtime, "c2c|user-1", "hello");

    globalThis.fetch = originalFetch;

    // sendQqbotText without stream hints → 1 message
    console.log(`METRIC outbound_msg_count=${count}`);
    expect(count).toBe(1);
  });

  test("METRIC: slash command /bot-ping recognized", () => {
    const result = matchSlashCommand("/bot-ping");
    console.log(`METRIC command_recognized=${result ? 1 : 0}`);
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe("bot-ping");
  });

  test("METRIC: slash command /bot-help recognized", () => {
    const result = matchSlashCommand("/bot-help");
    console.log(`METRIC command_recognized=${result ? 1 : 0}`);
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe("bot-help");
  });

  test("METRIC: slash command /bot-version recognized", () => {
    const result = matchSlashCommand("/bot-version");
    console.log(`METRIC command_recognized=${result ? 1 : 0}`);
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe("bot-version");
  });

  test("METRIC: slash command /bot-logs recognized", () => {
    const result = matchSlashCommand("/bot-logs");
    console.log(`METRIC command_recognized=${result ? 1 : 0}`);
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe("bot-logs");
  });

  test("METRIC: non-slash text NOT matched as command", () => {
    expect(matchSlashCommand("hello")).toBeNull();
    expect(matchSlashCommand("/unknown-cmd")).toBeNull();
  });
});
