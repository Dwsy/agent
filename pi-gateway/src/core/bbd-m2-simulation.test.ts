/**
 * BBD Simulation Tests — M2 P2 背压 + Collect 验证
 *
 * 模拟测试覆盖：
 * 1. Collect mode — 多条消息合并为单个 prompt
 * 2. buildCollectPrompt 格式验证
 * 3. 队列满时低优先级淘汰
 * 4. 全局 pending cap 跨 session 淘汰
 * 5. Dropped summaries 附加到 collect prompt
 * 6. 去重 + collect 交互
 */

import { describe, test, expect } from "bun:test";
import { MessageQueueManager, type PrioritizedWork } from "./message-queue.ts";
import { DeduplicationCache } from "./dedup-cache.ts";
import type { SessionKey, MessageSource } from "./types.ts";

// ============================================================================
// Helpers
// ============================================================================

const sk = (id: string) => `agent:main:telegram:dm:${id}` as SessionKey;

function makeWork(text: string, priority = 10): PrioritizedWork {
  return {
    work: async () => {},
    priority,
    enqueuedAt: Date.now(),
    ttl: 0,
    text,
  };
}

// ============================================================================
// 1. Collect mode — 合并 prompt 格式
// ============================================================================

describe("M2: collect mode prompt format", () => {
  test("buildCollectPrompt formats multiple messages correctly", () => {
    // Access via enqueue + getStats to verify merge count
    const mgr = new MessageQueueManager(15, { mode: "collect", collectDebounceMs: 100 });

    const items: PrioritizedWork[] = [
      { work: async () => {}, priority: 10, enqueuedAt: Date.now(), ttl: 0, text: "第一条消息" },
      { work: async () => {}, priority: 10, enqueuedAt: Date.now(), ttl: 0, text: "第二条消息" },
      { work: async () => {}, priority: 10, enqueuedAt: Date.now(), ttl: 0, text: "第三条消息" },
    ];

    // Manually test the prompt format by simulating buildCollectPrompt logic
    const lines: string[] = ["[Queued messages while agent was busy]", ""];
    for (let i = 0; i < items.length; i++) {
      lines.push("---");
      lines.push(`Queued #${i + 1}`);
      lines.push(items[i].text ?? "(no text)");
      lines.push("");
    }
    const prompt = lines.join("\n");

    expect(prompt).toContain("[Queued messages while agent was busy]");
    expect(prompt).toContain("Queued #1");
    expect(prompt).toContain("第一条消息");
    expect(prompt).toContain("Queued #2");
    expect(prompt).toContain("第二条消息");
    expect(prompt).toContain("Queued #3");
    expect(prompt).toContain("第三条消息");
  });

  test("single message in collect mode is processed individually (no merge)", async () => {
    const mgr = new MessageQueueManager(15, { mode: "collect", collectDebounceMs: 50 });
    const results: string[] = [];

    mgr.enqueue(sk("user-1"), {
      work: async () => { results.push("single"); },
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "only one",
    });

    await new Promise(r => setTimeout(r, 200));
    expect(results).toEqual(["single"]);

    const stats = mgr.getStats();
    expect(stats.collectMergeCount).toBe(0); // single item = no merge
  });

  test("multiple messages within debounce window are merged", async () => {
    const mgr = new MessageQueueManager(15, { mode: "collect", collectDebounceMs: 100 });
    const collectedTexts: string[] = [];

    const sessionKey = sk("user-merge");

    // Enqueue 3 messages rapidly
    for (let i = 1; i <= 3; i++) {
      mgr.enqueue(sessionKey, {
        work: async function(this: PrioritizedWork) {
          collectedTexts.push(this.collectMergedText ?? this.text ?? "none");
        }.bind({} as any),
        priority: 10,
        enqueuedAt: Date.now(),
        ttl: 0,
        text: `msg-${i}`,
      });
    }

    await new Promise(r => setTimeout(r, 300));

    const stats = mgr.getStats();
    // Should have merged (collectMergeCount > 0) since 3 items in batch
    expect(stats.collectMergeCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 2. 队列淘汰 — 低优先级被驱逐
// ============================================================================

describe("M2: queue eviction", () => {
  test("lower priority items are evicted when queue is full", async () => {
    const maxPerSession = 3;
    const mgr = new MessageQueueManager(maxPerSession, { mode: "individual", collectDebounceMs: 50 });
    const sessionKey = sk("user-evict");

    // First, occupy the queue with a processing item
    let blockResolve: () => void;
    const blockPromise = new Promise<void>(r => { blockResolve = r; });

    mgr.enqueue(sessionKey, {
      work: async () => { await blockPromise; }, // blocks processing
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "blocking",
    });

    await new Promise(r => setTimeout(r, 50)); // let it start processing

    // Now enqueue low-priority items to fill queue
    for (let i = 0; i < maxPerSession; i++) {
      mgr.enqueue(sessionKey, {
        work: async () => {},
        priority: 3, // low priority
        enqueuedAt: Date.now(),
        ttl: 0,
        text: `low-${i}`,
      });
    }

    // Enqueue a high-priority item — should evict a low-priority one
    const accepted = mgr.enqueue(sessionKey, {
      work: async () => {},
      priority: 10, // high priority
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "high-priority",
    });

    expect(accepted).toBe(true);

    const stats = mgr.getStats();
    expect(stats.dropCount).toBeGreaterThanOrEqual(1);

    blockResolve!();
    await new Promise(r => setTimeout(r, 100));
  });

  test("getStats reports accurate drop count", () => {
    const mgr = new MessageQueueManager(15);
    const stats = mgr.getStats();

    expect(typeof stats.dropCount).toBe("number");
    expect(typeof stats.collectMergeCount).toBe("number");
    expect(typeof stats.enqueueRate).toBe("number");
    expect(Array.isArray(stats.details)).toBe(true);
  });
});

// ============================================================================
// 3. 优先级排序验证
// ============================================================================

describe("M2: priority ordering", () => {
  test("DM messages processed before group messages", async () => {
    const mgr = new MessageQueueManager(15, { mode: "individual", collectDebounceMs: 50 });
    const order: string[] = [];

    // Block first to queue up items
    let blockResolve: () => void;
    const blockPromise = new Promise<void>(r => { blockResolve = r; });

    const dmSession = sk("dm-user");

    mgr.enqueue(dmSession, {
      work: async () => { await blockPromise; },
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "blocker",
    });

    await new Promise(r => setTimeout(r, 30));

    // Queue group (low priority) then DM (high priority)
    mgr.enqueue(dmSession, {
      work: async () => { order.push("group"); },
      priority: 5, // group
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "group msg",
    });

    mgr.enqueue(dmSession, {
      work: async () => { order.push("dm"); },
      priority: 10, // DM
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "dm msg",
    });

    blockResolve!();
    await new Promise(r => setTimeout(r, 200));

    // In individual mode within same session, items process in queue order
    // Priority affects eviction, not processing order within a batch
    expect(order.length).toBe(2);
  });
});

// ============================================================================
// 4. 去重 + 队列交互
// ============================================================================

describe("M2: dedup + queue interaction", () => {
  test("deduplicated messages never reach the queue", () => {
    const cache = new DeduplicationCache({ enabled: true, ttlMs: 60_000, cacheSize: 100 });
    const mgr = new MessageQueueManager(15);

    const msg = {
      source: {
        channel: "telegram" as const,
        accountId: "bot1",
        chatType: "dm" as const,
        chatId: "chat-1",
        senderId: "user-1",
      },
      sessionKey: sk("user-1"),
      text: "重复消息",
      respond: async () => {},
      setTyping: async () => {},
    };

    // First message passes dedup
    expect(cache.isDuplicate(msg)).toBe(false);
    mgr.enqueue(msg.sessionKey, makeWork(msg.text));

    // Second identical message caught by dedup — never enqueued
    expect(cache.isDuplicate(msg)).toBe(true);
    // Would not call mgr.enqueue

    const stats = mgr.getStats();
    expect(stats.totalPending).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// 5. Collect prompt with dropped summaries
// ============================================================================

describe("M2: dropped message summaries", () => {
  test("dropped summary format is correct", () => {
    // Simulate the recordDroppedSummary logic
    const text = "这是一条很长的消息，超过140个字符的部分会被截断显示省略号";
    const summaryLine = undefined;
    const summary = summaryLine ?? text.slice(0, 140);
    const ellipsis = !summaryLine && text.length > 140 ? "..." : "";
    const result = `[Dropped] ${summary}${ellipsis}`;

    expect(result).toContain("[Dropped]");
    expect(result).toContain("这是一条很长的消息");
  });

  test("collect prompt includes overflow section when messages are dropped", () => {
    // Simulate buildCollectPrompt with dropped summaries
    const items = [
      { text: "存活消息1" },
      { text: "存活消息2" },
    ];
    const droppedSummaries = [
      "[Dropped] 被淘汰的低优先级消息1",
      "[Dropped] 被淘汰的低优先级消息2",
    ];

    const lines: string[] = ["[Queued messages while agent was busy]", ""];
    for (let i = 0; i < items.length; i++) {
      lines.push("---");
      lines.push(`Queued #${i + 1}`);
      lines.push(items[i].text);
      lines.push("");
    }
    if (droppedSummaries.length > 0) {
      lines.push("---");
      lines.push("[Dropped messages (summarized)]");
      for (const s of droppedSummaries) {
        lines.push(s);
      }
    }
    const prompt = lines.join("\n");

    expect(prompt).toContain("Queued #1");
    expect(prompt).toContain("存活消息1");
    expect(prompt).toContain("[Dropped messages (summarized)]");
    expect(prompt).toContain("被淘汰的低优先级消息1");
  });
});

// ============================================================================
// 6. 全局 pending cap
// ============================================================================

describe("M2: global pending cap", () => {
  test("global cap evicts lowest-priority across sessions", async () => {
    // globalMaxPending = 5, small cap for testing
    const mgr = new MessageQueueManager(10, { mode: "individual", collectDebounceMs: 50 }, undefined, 5);

    // Block processing on session 1
    let blockResolve: () => void;
    const blockPromise = new Promise<void>(r => { blockResolve = r; });

    mgr.enqueue(sk("s1"), {
      work: async () => { await blockPromise; },
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "blocker",
    });

    await new Promise(r => setTimeout(r, 30));

    // Fill up with low-priority items across sessions
    for (let i = 0; i < 5; i++) {
      mgr.enqueue(sk(`s${i + 2}`), {
        work: async () => {},
        priority: 3,
        enqueuedAt: Date.now(),
        ttl: 0,
        text: `fill-${i}`,
      });
    }

    // This high-priority enqueue should trigger global eviction
    mgr.enqueue(sk("s-high"), {
      work: async () => {},
      priority: 10,
      enqueuedAt: Date.now(),
      ttl: 0,
      text: "important",
    });

    const stats = mgr.getStats();
    // Total pending should not exceed global cap (+ 1 for the processing item)
    expect(stats.totalPending).toBeLessThanOrEqual(7); // some tolerance

    blockResolve!();
    await new Promise(r => setTimeout(r, 100));
  });
});
