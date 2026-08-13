/**
 * Tests for autonomous-editing upgrades: ID-annotated read view, ID-carrying
 * prompt injection blocks, pending review block, and promote returning the
 * consolidated learning id.
 * Run: bun test memory-autonomy.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
  addRoleEvent,
  addRoleLearning,
  addRolePreference,
  buildPendingReviewBlock,
  ensureRoleMemoryFiles,
  isMemoryReadSection,
  promotePendingLearning,
  readLongTermMemoryBlock,
  readRoleMemory,
  renderMemoryReadView,
} = await import("./memory-md.ts");

const ROLE_NAME = "test-role";

function makeRole(prefix: string): string {
  const rolePath = mkdtempSync(join(tmpdir(), prefix));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  return rolePath;
}

test("renderMemoryReadView: every entry carries [id:...]; section filter works", () => {
  const rolePath = makeRole("rp-auto-read-");
  try {
    const learning = addRoleLearning(rolePath, ROLE_NAME, "prefer guard clauses over nesting", { appendDaily: false });
    const pref = addRolePreference(rolePath, ROLE_NAME, "Code", "always reply in Simplified Chinese", { appendDaily: false });
    const event = addRoleEvent(rolePath, ROLE_NAME, "shipped the memory upgrade", { title: "Memory v2", appendDaily: false });
    const pending = addPendingLearning(rolePath, "candidate insight about caching", "auto");

    const all = renderMemoryReadView(rolePath, ROLE_NAME, "all");
    for (const id of [learning.id, pref.id, event.id, pending.id]) {
      assert.ok(all.text.includes(`[id:${id}]`), `read view missing [id:${id}]:\n${all.text}`);
    }
    assert.deepEqual(
      { learnings: all.learnings, preferences: all.preferences, events: all.events, pending: all.pending },
      { learnings: 1, preferences: 1, events: 1, pending: 1 },
    );

    const pendingOnly = renderMemoryReadView(rolePath, ROLE_NAME, "pending");
    assert.ok(pendingOnly.text.includes(`[id:${pending.id}]`));
    assert.ok(!pendingOnly.text.includes(`[id:${learning.id}]`), "pending section must not include learnings");

    assert.equal(isMemoryReadSection("events"), true);
    assert.equal(isMemoryReadSection("bogus"), false);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("readLongTermMemoryBlock: renders parsed entries with ids, no frontmatter dump", () => {
  const rolePath = makeRole("rp-auto-block-");
  try {
    assert.equal(readLongTermMemoryBlock(rolePath, ROLE_NAME), null, "empty memory injects nothing");

    const learning = addRoleLearning(rolePath, ROLE_NAME, "session trust must be re-checked", { appendDaily: false });
    const pref = addRolePreference(rolePath, ROLE_NAME, "Workflow", "commit only when asked", { appendDaily: false });

    const block = readLongTermMemoryBlock(rolePath, ROLE_NAME)!;
    assert.ok(block.startsWith("### Long-Term Memory"));
    assert.ok(block.includes(`[id:${learning.id}]`), `missing learning id:\n${block}`);
    assert.ok(block.includes(`[id:${pref.id}] [Workflow]`), `missing preference id:\n${block}`);
    assert.ok(!block.includes("---\nname:"), "frontmatter must not leak into the prompt block");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("buildPendingReviewBlock: lists unreviewed candidates with ids, null when empty", () => {
  const rolePath = makeRole("rp-auto-pending-");
  try {
    assert.equal(buildPendingReviewBlock(rolePath), null);

    const added = addPendingLearning(rolePath, "auto-extracted candidate one", "auto");
    const block = buildPendingReviewBlock(rolePath)!;
    assert.ok(block.includes("Pending Memories Awaiting Review (1)"));
    assert.ok(block.includes(`[id:${added.id}]`));

    // Promoted items drop out of the review block
    promotePendingLearning(rolePath, ROLE_NAME, added.id!);
    assert.equal(buildPendingReviewBlock(rolePath), null);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("promotePendingLearning: returns the consolidated learningId for index sync", () => {
  const rolePath = makeRole("rp-auto-promote-");
  const text = "hard-won insight about flaky ci";
  try {
    const added = addPendingLearning(rolePath, text, "compaction");
    const result = promotePendingLearning(rolePath, ROLE_NAME, added.id!);

    assert.equal(result.promoted, true);
    assert.ok(result.learningId, "promote must expose the consolidated learning id");
    const learning = readRoleMemory(rolePath, ROLE_NAME).learnings.find((l) => l.id === result.learningId);
    assert.ok(learning, "learningId must resolve to the consolidated entry");
    assert.equal(learning.text, text);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});
