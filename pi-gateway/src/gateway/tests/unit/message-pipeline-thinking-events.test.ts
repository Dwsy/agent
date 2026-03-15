import { describe, expect, test } from "bun:test";
import { processMessage } from "../../message-pipeline.ts";

interface EventRecord {
  type: string;
  accumulated?: string;
  delta?: string;
}

function createContext(events: any[]) {
  let eventHandler: ((event: any) => void) | null = null;
  const replies: string[] = [];

  const rpc: any = {
    id: "rpc-1",
    sessionKey: null,
    extensionUIHandler: null,
    setModel: async () => {},
    setThinkingLevel: async () => {},
    prompt: async () => {
      for (const event of events) {
        eventHandler?.(event);
      }
    },
    waitForIdle: async () => {},
    onEvent: (handler: (event: any) => void) => {
      eventHandler = handler;
      return () => {
        if (eventHandler === handler) {
          eventHandler = null;
        }
      };
    },
    abort: async () => {},
    stop: async () => {},
  };

  const sessions = new Map<string, any>();

  const ctx: any = {
    config: {
      agent: {
        model: "yuanjing/glm-5",
        thinkingLevel: "high",
        timeoutMs: 5_000,
      },
      channels: {
        telegram: {
          enabled: true,
        },
      },
      queue: {
        mode: "collect",
      },
    },
    pool: {
      acquire: async (sessionKey: string) => {
        rpc.sessionKey = sessionKey;
        return rpc;
      },
      release: () => {},
      getForSession: () => rpc,
    },
    sessions: {
      has: (key: string) => sessions.has(key),
      get: (key: string) => sessions.get(key),
      getOrCreate: (key: string, defaults: any) => {
        if (!sessions.has(key)) {
          sessions.set(key, { ...defaults, sessionKey: key });
        }
        return sessions.get(key);
      },
    },
    buildSessionProfile: () => ({
      role: "default",
      cwd: ".",
      signature: "sig",
      resourceCounts: { extensions: 0, skills: 0, tools: 0 },
    }),
    activeInboundMessages: new Map(),
    sessionMessageModeOverrides: new Map(),
    extensionUI: { forward: () => false },
    transcripts: {
      logPrompt: () => {},
      logMeta: () => {},
      logEvent: () => {},
      logError: () => {},
      logResponse: () => {},
    },
    registry: {
      hooks: {
        dispatch: async () => {},
      },
    },
    modelHealth: null,
    observability: {
      record: () => {},
    },
    metrics: {
      incMessageProcessed: () => {},
      recordLatency: () => {},
      incRpcTimeout: () => {},
    },
    dedup: {
      isDuplicate: () => false,
    },
    queue: {
      enqueue: () => true,
      clearCollectBuffer: () => 0,
    },
    broadcastToWs: () => {},
    compactSessionWithHooks: async () => {},
    listAvailableRoles: () => [],
    setSessionRole: async () => true,
    createRole: async () => ({ ok: true }),
    deleteRole: async () => ({ ok: true }),
    resolveSessionMessageMode: () => "steer",
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };

  return { ctx, replies };
}

describe("message-pipeline thinking lifecycle", () => {
  test("forwards thinking start, delta, and end in sequence", async () => {
    const events = [
      { type: "message_update", assistantMessageEvent: { type: "thinking_start" } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "alpha" } },
      { type: "tool_execution_start", toolName: "bash", args: {}, toolCallId: "tool-1" },
      { type: "message_update", assistantMessageEvent: { type: "thinking_end" } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_start" } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "beta" } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_end" } },
      { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "done" } },
      { type: "message_end", message: { role: "assistant", stopReason: "stop" } },
      { type: "agent_end", messages: [] },
    ];
    const { ctx, replies } = createContext(events);
    const thinkingEvents: EventRecord[] = [];

    await processMessage({
      source: {
        channel: "telegram",
        accountId: "zero",
        chatType: "dm",
        chatId: "1001",
        senderId: "u1",
      },
      sessionKey: "agent:main:telegram:account:zero:main",
      text: "hello",
      respond: async (text: string) => {
        replies.push(text);
      },
      setTyping: async () => {},
      onThinkingStart: () => {
        thinkingEvents.push({ type: "start" });
      },
      onThinkingDelta: (accumulated: string, delta: string) => {
        thinkingEvents.push({ type: "delta", accumulated, delta });
      },
      onThinkingEnd: (accumulated: string) => {
        thinkingEvents.push({ type: "end", accumulated });
      },
    } as any, ctx);

    expect(thinkingEvents).toEqual([
      { type: "start" },
      { type: "delta", accumulated: "alpha", delta: "alpha" },
      { type: "end", accumulated: "alpha" },
      { type: "start" },
      { type: "delta", accumulated: "beta", delta: "beta" },
      { type: "end", accumulated: "beta" },
    ]);
    expect(replies).toEqual(["done"]);
  });
});
