import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./lifecycle.ts", import.meta.url), "utf8");

test("automatic memory persistence is deferred from agent_end to session_shutdown", () => {
  const agentEnd = source.match(/pi\.on\("agent_end"[\s\S]*?\n  \}\);/);
  const shutdown = source.match(/pi\.on\("session_shutdown"[\s\S]*?\n  \}\);/);

  assert.ok(agentEnd, "agent_end handler must exist");
  assert.ok(shutdown, "session_shutdown handler must exist");
  assert.match(agentEnd[0], /autoMemoryPendingTurns \+= 1/);
  assert.match(agentEnd[0], /autoMemoryLastMessages = event\.messages/);
  assert.doesNotMatch(agentEnd[0], /flushAutoMemory|scheduleAutoMemoryFlush/);
  assert.match(shutdown[0], /flushAutoMemory\(rt, state\.autoMemoryLastMessages, ctx, "session-shutdown"\)/);
});
