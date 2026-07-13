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
const assistant = {
  role: "assistant",
  usage: { output: 1_115, input: 10, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
};

await handlers.get("message_start")?.({ message: assistant }, context);
await handlers.get("message_update")?.({
  message: assistant,
  assistantMessageEvent: { type: "text_delta" },
}, context);
await handlers.get("message_end")?.({ message: assistant }, context);
await handlers.get("agent_end")?.({}, context);

assert.equal(statuses.at(-1), "-- tok/s");
assert.equal(notifications.length, 0);
assert.ok(!statuses.some((text) => text.includes("TPS:")));

console.log("token-rate tests passed");
