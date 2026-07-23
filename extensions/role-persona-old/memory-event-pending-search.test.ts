/**
 * Minimal check: event blocks + pending surface in memory search.
 * Run: bun memory-event-pending-search.test.ts
 */
import { mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// pi-ai export surface varies by version; mock for isolated unit check
mock.module("@earendil-works/pi-ai", () => ({
  completeSimple: async () => ({ stopReason: "end", content: [] }),
  complete: async () => ({ stopReason: "end", content: [] }),
  StringEnum: (x: unknown) => x,
}));

const {
  addRoleEvent,
  addPendingLearning,
  ensureRoleMemoryFiles,
  parseEventBlocks,
  searchRoleMemory,
  listRoleMemory,
} = await import("./memory-md.ts");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const rolePath = mkdtempSync(join(tmpdir(), "rp-event-search-"));
const roleName = "test-role";

try {
  ensureRoleMemoryFiles(rolePath, roleName);

  const blocks = parseEventBlocks([
    "## [2026-07-20] Gateway v3 ship",
    "Released pi-gateway v3 with RPC events.",
    "",
    "## [2026-07-21] Trust bridge",
    "project_trust lifecycle fixed.",
  ]);
  assert(blocks.length === 2, `expected 2 event blocks, got ${blocks.length}`);
  assert(blocks[0].date === "2026-07-20", "date parse failed");

  const added = addRoleEvent(rolePath, roleName, "pi-gateway RPC events shipped with session diff stream", {
    title: "Gateway RPC milestone",
    date: "2026-07-20",
    appendDaily: false,
  });
  assert(added.stored && added.id, `addRoleEvent failed: ${JSON.stringify(added)}`);

  const eventHits = searchRoleMemory(rolePath, roleName, "gateway RPC events", {
    minScore: 0.1,
    includeDailyMemory: false,
    autoPromotePending: false,
    autoReinforce: false,
  });
  assert(eventHits.some((m) => m.kind === "event"), `event not found: ${JSON.stringify(eventHits)}`);

  const pend = addPendingLearning(rolePath, "session-bound project trust must use lifecycle after decision", "auto");
  assert(pend.stored, `addPendingLearning failed: ${JSON.stringify(pend)}`);

  const pendingHits = searchRoleMemory(rolePath, roleName, "project trust lifecycle", {
    minScore: 0.1,
    includeDailyMemory: false,
    autoPromotePending: false,
    autoReinforce: false,
  });
  const pendingMatch = pendingHits.find((m) => m.kind === "pending");
  assert(pendingMatch, `pending not found: ${JSON.stringify(pendingHits)}`);

  const listed = listRoleMemory(rolePath, roleName);
  assert(listed.events >= 1 && listed.pending >= 1, "list counts");

  console.log("PASS event/pending search");
} finally {
  rmSync(rolePath, { recursive: true, force: true });
}
