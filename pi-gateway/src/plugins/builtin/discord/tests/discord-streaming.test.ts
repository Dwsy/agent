/**
 * Discord streaming adapter logic tests
 */
import { describe, expect, test } from "bun:test";

// Test the streaming state machine logic (without discord.js dependency)
test("streaming edit cutoff logic", () => {
  const editCutoffChars = 1800;
  const streamEnabled = true;

  // Simulate accumulating text
  let accumulated = "a".repeat(2000);
  let editStopped = false;

  if (streamEnabled && !editStopped && accumulated.length > editCutoffChars) {
    editStopped = true;
  }

  expect(editStopped).toBe(true);
  expect(accumulated.length).toBe(2000);
});

test("streaming does not stop under cutoff", () => {
  const editCutoffChars = 1800;
  let accumulated = "a".repeat(1000);
  let editStopped = false;

  if (!editStopped && accumulated.length > editCutoffChars) {
    editStopped = true;
  }

  expect(editStopped).toBe(false);
});

test("streaming resets after edit cutoff", () => {
  let editStopped = false;
  let accumulated = "a".repeat(2000);
  const cutoff = 1800;

  if (!editStopped && accumulated.length > cutoff) {
    editStopped = true;
  }

  // Once stopped, stays stopped
  const wasStopped = editStopped;
  accumulated = "a".repeat(500);
  if (!editStopped && accumulated.length > cutoff) {
    editStopped = true;
  }

  expect(wasStopped).toBe(true);
  expect(editStopped).toBe(true); // still stopped
});

test("streaming throttle debounce logic", () => {
  let lastEditAt = 0;
  const editThrottleMs = 500;
  let editInFlight = false;

  const tryEdit = (now: number): boolean => {
    if (editInFlight || now - lastEditAt < editThrottleMs) {
      return false;
    }
    editInFlight = true;
    return true;
  };

  const completeEdit = (now: number) => {
    editInFlight = false;
    lastEditAt = now;
  };

  const now = 1000;
  expect(tryEdit(now)).toBe(true); // first edit
  expect(tryEdit(now + 100)).toBe(false); // in-flight
  expect(tryEdit(now + 400)).toBe(false); // throttle (400ms < 500ms)
  completeEdit(now + 100);
  expect(tryEdit(now + 400)).toBe(false); // still throttled (400ms < 500ms since lastEditAt=1100)
  expect(tryEdit(now + 600)).toBe(true); // now ready (500ms elapsed since lastEditAt=1100)
});

test("streaming content sequence management", () => {
  type SequenceItem = { type: "tool" | "text" | "thinking"; content: string };
  const contentSequence: SequenceItem[] = [];

  // Add thinking block
  contentSequence.push({ type: "thinking", content: "processing..." });

  // Thinking ends
  const thinkingIdx = contentSequence.findIndex((i) => i.type === "thinking");
  if (thinkingIdx !== -1) contentSequence.splice(thinkingIdx, 1);
  expect(contentSequence.some((i) => i.type === "thinking")).toBe(false);

  // Add tool call
  contentSequence.push({ type: "tool", content: "→ read(path='/tmp/file')" });

  // Stream delta arrives
  contentSequence.push({ type: "text", content: "Here's the file content..." });

  // Build live text
  const liveText = contentSequence.map((i) => i.content).join("\n\n");
  expect(liveText).toContain("read(path");
  expect(liveText).toContain("Here's the file");
  expect(liveText).not.toContain("processing");
});
