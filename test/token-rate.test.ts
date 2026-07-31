import assert from "node:assert/strict";
import install, { calculateTokenRate } from "../extensions/token-rate.ts";

assert.equal(calculateTokenRate(100, 1_000), 100);
assert.equal(calculateTokenRate(1_115, 99), undefined);
assert.equal(calculateTokenRate(0, 1_000), undefined);
assert.equal(calculateTokenRate(100, 0), undefined);

const handlers = new Map<string, (...args: any[]) => Promise<void>>();
const statuses: string[] = [];
const notifications: string[] = [];
install({ on(name: string, handler: (...args: any[]) => Promise<void>) { handlers.set(name, handler); } } as any);

const context = {
  hasUI: true,
  ui: {
    theme: { fg: (_color: string, text: string) => text },
    setStatus: (_key: string, text?: string) => statuses.push(text ?? ""),
    notify: (text: string) => notifications.push(text),
  },
};

let now = 1_000;
const originalPerformance = globalThis.performance;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: { now: () => now },
});

try {
  await handlers.get("session_start")?.({}, context);
  await handlers.get("agent_start")?.({}, context);

  await handlers.get("message_end")?.({
    message: {
      role: "assistant",
      usage: { output: 100, input: 50_000, cacheRead: 40_000, cacheWrite: 10_000, cost: { total: 0.01 } },
    },
  }, context);

  // A retry starts another low-level agent run, but the full-run clock and totals
  // must continue until agent_settled.
  now = 2_000;
  await handlers.get("agent_start")?.({}, context);
  await handlers.get("message_end")?.({
    message: {
      role: "assistant",
      usage: { output: 200, input: 90_000, cacheRead: 80_000, cacheWrite: 10_000, cost: { total: 0.02 } },
    },
  }, context);

  now = 4_000;
  await handlers.get("agent_settled")?.({}, context);
} finally {
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: originalPerformance,
  });
}

assert.equal(statuses.at(-1), "100.0 tok/s");
assert.deepEqual(notifications, ["100.0 tok/s | Cost: $0.0300 | out 300"]);
assert.ok(!notifications[0].includes("in "));
assert.ok(!notifications[0].includes("cache"));
assert.ok(!statuses.some((text) => text.includes("TPS:")));

console.log("token-rate tests passed");
