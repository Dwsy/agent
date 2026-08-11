/**
 * Behavior tests for the memory core API (pending lifecycle, search-driven
 * promotion, dedupe, reinforce tiers, repair).
 * Run: bun test memory-api.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// pi-ai export surface varies by version; mock for isolated unit checks
mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({ stopReason: "end", content: [] }),
  StringEnum: (x: unknown) => x,
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  convertToLlm: (messages: unknown[]) => messages,
  serializeConversation: (messages: unknown[]) => JSON.stringify(messages),
}));

const {
  addPendingLearning,
  addRoleLearning,
  ensureRoleMemoryFiles,
  expirePendingMemories,
  getPendingMemories,
  getPendingStats,
  promotePendingLearning,
  readRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
} = await import("./memory-md.ts");

const ROLE_NAME = "test-role";

// Temp dirs live outside the configured roles repo, so memory-git skips the
// commit path and plain file semantics apply (same as the other memory tests).
function makeRole(prefix: string): string {
  const rolePath = mkdtempSync(join(tmpdir(), prefix));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  return rolePath;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

test("pending lifecycle: add -> visible [○] -> promote -> consolidated; expire discards old items", () => {
  const rolePath = makeRole("rp-api-pending-");
  const pendingFile = join(rolePath, "memory", "pending.md");
  const text = "session trust must be re-checked after compaction";

  try {
    const added = addPendingLearning(rolePath, text, "auto");
    assert.equal(added.stored, true);
    assert.ok(added.id);

    // Visible as an active [○] item in both the API and the file
    const active = getPendingMemories(rolePath);
    assert.equal(active.length, 1);
    assert.deepEqual(
      { text: active[0].text, source: active[0].source, promoted: active[0].promoted, discarded: active[0].discarded },
      { text, source: "auto", promoted: false, discarded: false },
    );
    assert.ok(readFileSync(pendingFile, "utf-8").includes(`- [○] [auto] ${text}`));

    // Promote: enters consolidated learnings, pending item marked promoted
    const promoted = promotePendingLearning(rolePath, ROLE_NAME, added.id!);
    assert.deepEqual({ promoted: promoted.promoted, text: promoted.text }, { promoted: true, text });

    const learning = readRoleMemory(rolePath, ROLE_NAME).learnings.find((l) => l.text === text);
    assert.ok(learning, "promoted text must appear in consolidated learnings");
    assert.equal(learning.used, 0);

    assert.equal(getPendingMemories(rolePath).length, 0);
    assert.deepEqual(getPendingStats(rolePath), { total: 1, pending: 0, promoted: 1, discarded: 0 });
    assert.ok(readFileSync(pendingFile, "utf-8").includes(`- [✓] [auto] ${text}`));

    // Expire: only items strictly older than maxAgeDays are discarded, so
    // backdate the created field before expiring with 0 days.
    const staleText = "old memo about legacy tooling quirks";
    const staleAdd = addPendingLearning(rolePath, staleText, "auto");
    assert.equal(staleAdd.stored, true);
    writeFileSync(pendingFile, readFileSync(pendingFile, "utf-8").replaceAll(`created: ${todayStr()}`, "created: 2020-01-01"), "utf-8");

    assert.deepEqual(expirePendingMemories(rolePath, 0), { expired: 1, total: 2 });
    assert.equal(getPendingMemories(rolePath).length, 0);
    assert.deepEqual(getPendingStats(rolePath), { total: 2, pending: 0, promoted: 1, discarded: 1 });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("search: pending hit below 0.5 surfaces without promotion; hit >= 0.5 auto-promotes", () => {
  const rolePath = makeRole("rp-api-search-");
  const text = "alpha bravo charlie delta echo";

  try {
    const added = addPendingLearning(rolePath, text, "auto");
    assert.equal(added.stored, true);

    // Reordered tokens avoid the 0.5 substring bonus:
    // jaccard 2/5 * 0.3 + token hits 2/2 * 0.2 = 0.32 (>= 0.28 pending floor, < 0.5 promote threshold)
    const weakHits = searchRoleMemory(rolePath, ROLE_NAME, "bravo alpha", {
      minScore: 0.1,
      includeDailyMemory: false,
      autoReinforce: false,
    });
    const weak = weakHits.find((m) => m.id === added.id);
    assert.ok(weak, `pending item not surfaced: ${JSON.stringify(weakHits)}`);
    assert.equal(weak.kind, "pending");
    assert.ok(Math.abs(weak.score - 0.32) < 1e-9, `expected score 0.32, got ${weak.score}`);
    assert.equal(getPendingMemories(rolePath).length, 1, "weak hit must not promote");

    // Substring match: 0.5 + jaccard 3/5 * 0.3 + hits 3/3 * 0.2 = 0.88 -> auto-promote,
    // surfaced as learning with a 1.1x score boost.
    const strongHits = searchRoleMemory(rolePath, ROLE_NAME, "alpha bravo charlie", {
      minScore: 0.1,
      includeDailyMemory: false,
      autoReinforce: false,
    });
    const strong = strongHits.find((m) => m.id === added.id);
    assert.ok(strong, `promoted item not surfaced: ${JSON.stringify(strongHits)}`);
    assert.equal(strong.kind, "learning");
    assert.ok(Math.abs(strong.score - 0.88 * 1.1) < 1e-9, `expected score 0.968, got ${strong.score}`);

    assert.equal(getPendingMemories(rolePath).length, 0);
    const learning = readRoleMemory(rolePath, ROLE_NAME).learnings.find((l) => l.text === text);
    assert.ok(learning, "auto-promoted text must be in consolidated learnings");
    assert.equal(learning.used, 0);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("dedupe: adding the same learning twice reports duplicate and stores once", () => {
  const rolePath = makeRole("rp-api-dedupe-");
  const text = "Use guard clauses at function entry";

  try {
    const first = addRoleLearning(rolePath, ROLE_NAME, text, { appendDaily: false });
    assert.deepEqual({ stored: first.stored, layer: first.layer }, { stored: true, layer: "consolidated" });

    // Whitespace differences normalize to the same text
    const second = addRoleLearning(rolePath, ROLE_NAME, `  Use guard clauses   at function entry `, { appendDaily: false });
    assert.deepEqual(
      { stored: second.stored, duplicate: second.duplicate, reason: second.reason, id: second.id },
      { stored: false, duplicate: true, reason: "duplicate", id: first.id },
    );

    assert.equal(readRoleMemory(rolePath, ROLE_NAME).learnings.length, 1);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("reinforce: used count increments and reaches the high-priority tier at 3x", () => {
  const rolePath = makeRole("rp-api-reinforce-");
  const text = "Prefer immutable data structures in shared state";

  try {
    const added = addRoleLearning(rolePath, ROLE_NAME, text, { appendDaily: false });
    assert.equal(added.stored, true);

    assert.deepEqual(
      (({ updated, used }) => ({ updated, used }))(reinforceRoleLearning(rolePath, ROLE_NAME, added.id!)),
      { updated: true, used: 1 },
    );
    // Fuzzy text lookup also works
    assert.equal(reinforceRoleLearning(rolePath, ROLE_NAME, "immutable data structures").used, 2);
    assert.equal(reinforceRoleLearning(rolePath, ROLE_NAME, added.id!).used, 3);

    const learning = readRoleMemory(rolePath, ROLE_NAME).learnings.find((l) => l.id === added.id);
    assert.ok(learning);
    assert.equal(learning.used, 3);

    // used >= 3 renders under the High Priority section
    const raw = readFileSync(join(rolePath, "memory", "consolidated.md"), "utf-8");
    const highSection = raw.split("# Learnings (High Priority)")[1]?.split("# Learnings")[0] ?? "";
    assert.ok(highSection.includes(`- [3x] ${text}`), `high-priority section missing entry:\n${raw}`);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("repair: corrupted consolidated.md (duplicate section, stray line) is backed up and normalized", () => {
  const rolePath = makeRole("rp-api-repair-");
  const memoryFile = join(rolePath, "memory", "consolidated.md");
  const corrupted = [
    `# Memory: ${ROLE_NAME}`,
    "# Learnings (Normal)",
    "- lesson one",
    "stray line without bullet",
    "# Learnings (Normal)",
    "- lesson one",
    "- lesson two",
    "",
  ].join("\n");

  try {
    writeFileSync(memoryFile, corrupted, "utf-8");

    const result = repairRoleMemory(rolePath, ROLE_NAME);
    assert.deepEqual({ repaired: result.repaired, issues: result.issues }, { repaired: true, issues: 1 });
    assert.ok(result.backupPath && existsSync(result.backupPath), "backup file must exist");
    assert.equal(readFileSync(result.backupPath!, "utf-8"), corrupted);

    // Repaired file parses cleanly, keeps deduped content, and reports no issues
    const data = readRoleMemory(rolePath, ROLE_NAME);
    assert.deepEqual(data.issues, []);
    assert.deepEqual(
      data.learnings.map((l) => ({ text: l.text, used: l.used })).sort((a, b) => a.text.localeCompare(b.text)),
      [
        { text: "lesson one", used: 1 },
        { text: "lesson two", used: 1 },
        { text: "stray line without bullet", used: 1 },
      ],
    );

    // Second run finds nothing left to fix
    assert.deepEqual(repairRoleMemory(rolePath, ROLE_NAME), { repaired: false, issues: 0 });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});
