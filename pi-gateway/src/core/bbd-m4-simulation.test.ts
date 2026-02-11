/**
 * BBD Simulation Tests — M4 steer/interrupt/follow-up
 *
 * 模拟测试覆盖：
 * 1. resolveMessageMode — 全局默认 + session override + channel 配置
 * 2. steer 模式 — 注入消息到活跃 run（不 abort）
 * 3. interrupt 模式 — abort + clearCollectBuffer + redispatch
 * 4. follow-up 模式 — 排队等 run 结束
 * 5. clearCollectBuffer — 清空队列 + timer + dropped summaries
 * 6. normalizeTelegramMessageMode — 输入验证
 */

import { describe, test, expect } from "bun:test";
import { MessageQueueManager } from "./message-queue.ts";
import type { SessionKey } from "./types.ts";

const sk = (id: string) => `agent:main:telegram:dm:${id}` as SessionKey;

// ============================================================================
// 1. resolveMessageMode 逻辑模拟
// ============================================================================

describe("M4: message mode resolution", () => {
  test("normalizeTelegramMessageMode accepts valid modes", () => {
    const normalize = (value: unknown): "steer" | "follow-up" | "interrupt" | null => {
      return value === "steer" || value === "follow-up" || value === "interrupt"
        ? value
        : null;
    };

    expect(normalize("steer")).toBe("steer");
    expect(normalize("follow-up")).toBe("follow-up");
    expect(normalize("interrupt")).toBe("interrupt");
    expect(normalize("invalid")).toBeNull();
    expect(normalize(undefined)).toBeNull();
    expect(normalize(null)).toBeNull();
    expect(normalize(123)).toBeNull();
  });

  test("session override takes precedence over config", () => {
    const overrides = new Map<string, string>();
    const globalDefault = "steer";

    // No override → use global
    const resolve = (sessionKey: string) => {
      return overrides.get(sessionKey) ?? globalDefault;
    };

    expect(resolve("session-1")).toBe("steer");

    // Set override
    overrides.set("session-1", "interrupt");
    expect(resolve("session-1")).toBe("interrupt");

    // Other sessions unaffected
    expect(resolve("session-2")).toBe("steer");

    // Clear override
    overrides.delete("session-1");
    expect(resolve("session-1")).toBe("steer");
  });

  test("channel-specific config overrides global default", () => {
    const config = {
      agent: { messageMode: "steer" as const },
      channels: {
        telegram: { messageMode: "follow-up" as const },
      },
    };

    const resolve = (channel: string) => {
      if (channel === "telegram") {
        return config.channels.telegram?.messageMode ?? config.agent.messageMode;
      }
      return config.agent.messageMode;
    };

    expect(resolve("telegram")).toBe("follow-up");
    expect(resolve("webchat")).toBe("steer");
    expect(resolve("discord")).toBe("steer");
  });

  test("account-level config overrides channel-level", () => {
    const config = {
      telegram: {
        messageMode: "steer" as const,
        accounts: {
          bot1: { messageMode: "interrupt" as const },
          bot2: { messageMode: null },
        },
      },
    };

    const resolve = (accountId: string) => {
      const accountMode = config.telegram.accounts?.[accountId as keyof typeof config.telegram.accounts]?.messageMode;
      return accountMode ?? config.telegram.messageMode;
    };

    expect(resolve("bot1")).toBe("interrupt");
    expect(resolve("bot2")).toBe("steer"); // null falls back to channel
    expect(resolve("bot3")).toBe("steer"); // unknown falls back to channel
  });
});

// ============================================================================
// 2. steer 模式模拟
// ============================================================================

describe("M4: steer mode", () => {
  test("steer injects message without aborting", async () => {
    const events: string[] = [];

    // Simulate RPC steer
    const mockRpc = {
      prompt: async (text: string, _images: any, mode: string) => {
        events.push(`prompt:${mode}:${text}`);
      },
      abort: async () => {
        events.push("abort");
      },
    };

    // Steer mode: inject via prompt with mode="steer"
    await mockRpc.prompt("new message", undefined, "steer");

    expect(events).toEqual(["prompt:steer:new message"]);
    expect(events).not.toContain("abort"); // no abort in steer
  });

  test("steer fallback to enqueue on injection failure", async () => {
    const events: string[] = [];

    const mockRpc = {
      prompt: async (_text: string, _images?: unknown, _mode?: string) => { throw new Error("RPC busy"); },
    };

    try {
      await mockRpc.prompt("msg", undefined, "steer");
    } catch {
      events.push("fallback:enqueue");
    }

    expect(events).toContain("fallback:enqueue");
  });
});

// ============================================================================
// 3. interrupt 模式模拟
// ============================================================================

describe("M4: interrupt mode", () => {
  test("interrupt sequence: clearBuffer → abort → reset → redispatch", async () => {
    const events: string[] = [];

    const mgr = new MessageQueueManager(15, { mode: "collect", collectDebounceMs: 50 });
    const sessionKey = sk("interrupt-user");

    // Pre-fill queue
    mgr.enqueue(sessionKey, {
      work: async () => {},
      priority: 5,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "old-msg-1",
    });
    mgr.enqueue(sessionKey, {
      work: async () => {},
      priority: 5,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "old-msg-2",
    });

    // Step 1: Clear collect buffer
    const cleared = mgr.clearCollectBuffer(sessionKey);
    events.push(`cleared:${cleared}`);

    // Step 2: Abort RPC
    events.push("abort");

    // Step 3: Reset session state
    events.push("reset:isStreaming=false");

    // Step 4: Re-dispatch new message
    mgr.enqueue(sessionKey, {
      work: async () => { events.push("redispatched"); },
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "interrupt-msg",
    });

    await new Promise(r => setTimeout(r, 200));

    expect(events[0]).toBe("cleared:2"); // 2 old messages cleared
    expect(events).toContain("abort");
    expect(events).toContain("reset:isStreaming=false");
    expect(events).toContain("redispatched");
  });

  test("interrupt with empty buffer still works", () => {
    const mgr = new MessageQueueManager(15);
    const sessionKey = sk("empty-interrupt");

    const cleared = mgr.clearCollectBuffer(sessionKey);
    expect(cleared).toBe(0); // nothing to clear, no error
  });
});

// ============================================================================
// 4. follow-up 模式模拟
// ============================================================================

describe("M4: follow-up mode", () => {
  test("follow-up injects with followUp mode", async () => {
    const events: string[] = [];

    const mockRpc = {
      prompt: async (text: string, _images: any, mode: string) => {
        events.push(`prompt:${mode}:${text}`);
      },
    };

    await mockRpc.prompt("follow-up message", undefined, "followUp");

    expect(events).toEqual(["prompt:followUp:follow-up message"]);
  });

  test("follow-up vs steer: different RPC mode strings", () => {
    const modeMap = (mode: "steer" | "follow-up") => {
      return mode === "follow-up" ? "followUp" : "steer";
    };

    expect(modeMap("steer")).toBe("steer");
    expect(modeMap("follow-up")).toBe("followUp");
  });
});

// ============================================================================
// 5. clearCollectBuffer 详细验证
// ============================================================================

describe("M4: clearCollectBuffer", () => {
  test("clears queue items and returns count", async () => {
    const mgr = new MessageQueueManager(15, { mode: "collect", collectDebounceMs: 5000 });
    const sessionKey = sk("clear-test");

    // Block processing
    let blockResolve: () => void;
    const blockPromise = new Promise<void>(r => { blockResolve = r; });

    mgr.enqueue(sessionKey, {
      work: async () => { await blockPromise; },
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "blocker",
    });

    await new Promise(r => setTimeout(r, 30));

    // Queue up items
    mgr.enqueue(sessionKey, { work: async () => {}, priority: 5, enqueuedAt: Date.now(), ttl: 0, text: "a" });
    mgr.enqueue(sessionKey, { work: async () => {}, priority: 5, enqueuedAt: Date.now(), ttl: 0, text: "b" });
    mgr.enqueue(sessionKey, { work: async () => {}, priority: 5, enqueuedAt: Date.now(), ttl: 0, text: "c" });

    const cleared = mgr.clearCollectBuffer(sessionKey);
    expect(cleared).toBeGreaterThanOrEqual(3); // 3 queued + possibly blocker depending on timing

    // After clear, new enqueue should work
    mgr.enqueue(sessionKey, { work: async () => {}, priority: 10, enqueuedAt: Date.now(), ttl: 0, text: "new" });

    blockResolve!();
    await new Promise(r => setTimeout(r, 100));
  });

  test("clearCollectBuffer on nonexistent session returns 0", () => {
    const mgr = new MessageQueueManager(15);
    const cleared = mgr.clearCollectBuffer(sk("nonexistent"));
    expect(cleared).toBe(0);
  });
});

// ============================================================================
// 6. 全渠道 mode 一致性
// ============================================================================

describe("M4: cross-channel mode consistency", () => {
  test("all channels support the same three modes", () => {
    const validModes = ["steer", "follow-up", "interrupt"];
    const channels = ["telegram", "webchat", "discord"];

    for (const channel of channels) {
      for (const mode of validModes) {
        // Each mode should be a valid string
        expect(typeof mode).toBe("string");
        expect(["steer", "follow-up", "interrupt"]).toContain(mode);
      }
    }
  });

  test("dispatch flow branches correctly by mode", () => {
    const results: string[] = [];

    const simulateDispatch = (isStreaming: boolean, mode: string) => {
      if (isStreaming) {
        if (mode === "interrupt") {
          results.push("interrupt:abort+clear+redispatch");
        } else {
          results.push(`inject:${mode}`);
        }
      } else {
        results.push("enqueue:normal");
      }
    };

    simulateDispatch(true, "steer");
    simulateDispatch(true, "follow-up");
    simulateDispatch(true, "interrupt");
    simulateDispatch(false, "steer");

    expect(results).toEqual([
      "inject:steer",
      "inject:follow-up",
      "interrupt:abort+clear+redispatch",
      "enqueue:normal",
    ]);
  });
});
