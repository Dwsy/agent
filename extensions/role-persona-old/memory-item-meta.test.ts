/**
 * Per-item metadata (tags / source / last-seen) must survive the markdown
 * round-trip, which it historically did not: the bullet format only carried
 * the used-count, so tags died on the first save.
 * Run: bun test memory-item-meta.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  addRoleLearning,
  addRolePreference,
  buildMemoryExportData,
  consolidateRoleMemory,
  ensureRoleMemoryFiles,
  readRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  updateRoleLearning,
} = await import("./memory-md.ts");

const ROLE = "meta-role";

function makeRole(prefix: string): string {
  const rolePath = mkdtempSync(join(tmpdir(), prefix));
  ensureRoleMemoryFiles(rolePath, ROLE);
  return rolePath;
}

const memoryFile = (rolePath: string) => join(rolePath, "memory", "consolidated.md");

test("learning tags, source and last-seen survive a save/read cycle", () => {
  const rolePath = makeRole("rp-meta-learning-");
  try {
    const text = "prefer explicit contracts at module edges";
    addRoleLearning(rolePath, ROLE, text, { tags: ["design", "api"], source: "viewer", appendDaily: false });

    const raw = readFileSync(memoryFile(rolePath), "utf-8");
    assert.match(raw, /tags: design, api/, "metadata is written as a trailing comment");
    assert.match(raw, /src: viewer/);

    const learning = readRoleMemory(rolePath, ROLE).learnings[0];
    assert.equal(learning.text, text, "the comment is not part of the text");
    assert.deepEqual(learning.tags, ["design", "api"]);
    assert.equal(learning.source, "viewer");
    assert.ok(learning.lastAccessed, "the write stamps a last-seen date");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("preference tags round-trip through the category sections", () => {
  const rolePath = makeRole("rp-meta-pref-");
  try {
    addRolePreference(rolePath, ROLE, "style", "guard clauses over nesting", { appendDaily: false });
    writeFileSync(memoryFile(rolePath), readFileSync(memoryFile(rolePath), "utf-8").replace(
      "- guard clauses over nesting",
      "- guard clauses over nesting <!-- tags: readability, review -->"
    ));

    const pref = readRoleMemory(rolePath, ROLE).preferences.find((p) => p.category === "style");
    assert.ok(pref);
    assert.equal(pref.text, "guard clauses over nesting");
    assert.deepEqual(pref.tags, ["readability", "review"]);

    // Re-saving through a normal mutation must not lose them.
    addRolePreference(rolePath, ROLE, "style", "one more preference", { appendDaily: false });
    const after = readRoleMemory(rolePath, ROLE).preferences.find((p) => p.text === "guard clauses over nesting");
    assert.deepEqual(after?.tags, ["readability", "review"]);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("reinforcing bumps last-seen without touching tags", () => {
  const rolePath = makeRole("rp-meta-reinforce-");
  try {
    addRoleLearning(rolePath, ROLE, "chunk long running work", { tags: ["performance"], appendDaily: false });

    reinforceRoleLearning(rolePath, ROLE, "chunk long running work");
    const learning = readRoleMemory(rolePath, ROLE).learnings[0];

    assert.equal(learning.used, 1);
    assert.equal(learning.lastAccessed, new Date().toISOString().slice(0, 10));
    assert.deepEqual(learning.tags, ["performance"]);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("bullets written before metadata existed still parse", () => {
  const rolePath = makeRole("rp-meta-legacy-");
  try {
    writeFileSync(memoryFile(rolePath), [
      `# Memory: ${ROLE}`,
      "",
      "# Learnings (High Priority)",
      "- [4x] an old bullet with no metadata",
      "",
      "# Learnings (Normal)",
      "- a bullet without even a count",
      "",
      "# Preferences: style",
      "- an old preference",
      "",
      "# Events",
      "- (none)",
      "",
    ].join("\n"));

    const data = readRoleMemory(rolePath, ROLE);
    const old = data.learnings.find((l) => l.text === "an old bullet with no metadata");
    assert.ok(old);
    assert.equal(old.used, 4);
    assert.equal(old.tags, undefined);
    assert.equal(data.preferences[0].text, "an old preference");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("editing and consolidating keep metadata attached", () => {
  const rolePath = makeRole("rp-meta-keep-");
  try {
    addRoleLearning(rolePath, ROLE, "vector rebuilds block the event loop", { tags: ["performance"], source: "auto", usePending: false, appendDaily: false });

    updateRoleLearning(rolePath, ROLE, "vector rebuilds block the event loop", "vector rebuilds block the event loop — chunk them");
    let learning = readRoleMemory(rolePath, ROLE).learnings[0];
    assert.deepEqual(learning.tags, ["performance"], "an edit must not strip tags");
    assert.equal(learning.source, "auto");

    consolidateRoleMemory(rolePath, ROLE);
    learning = readRoleMemory(rolePath, ROLE).learnings[0];
    assert.deepEqual(learning.tags, ["performance"], "consolidation must not strip tags");

    repairRoleMemory(rolePath, ROLE);
    learning = readRoleMemory(rolePath, ROLE).learnings[0];
    assert.deepEqual(learning.tags, ["performance"], "repair must not strip tags");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("deduping two copies of one learning unions their metadata", () => {
  const rolePath = makeRole("rp-meta-dedupe-");
  try {
    writeFileSync(memoryFile(rolePath), [
      `# Memory: ${ROLE}`,
      "",
      "# Learnings (High Priority)",
      "- [5x] one truth <!-- tags: alpha | src: compaction | seen: 2026-08-01 -->",
      "",
      "# Learnings (New)",
      "- [0x] one truth <!-- tags: beta | seen: 2026-08-09 -->",
      "",
      "# Events",
      "- (none)",
      "",
    ].join("\n"));

    const learnings = readRoleMemory(rolePath, ROLE).learnings;
    assert.equal(learnings.length, 1, "identical text collapses to one record");
    assert.equal(learnings[0].used, 5, "the higher count wins");
    assert.deepEqual(learnings[0].tags, ["alpha", "beta"], "tags are unioned, not dropped");
    assert.equal(learnings[0].source, "compaction");
    assert.equal(learnings[0].lastAccessed, "2026-08-09", "the later sighting wins");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("persisted tags reach the viewer as filterable, not idle", () => {
  const rolePath = makeRole("rp-meta-viewer-");
  try {
    addRoleLearning(rolePath, ROLE, "tagging finally sticks", { tags: ["memory"], appendDaily: false });

    const tag = buildMemoryExportData(rolePath, ROLE, "static").tags.find((t) => t.name === "memory");
    assert.ok(tag, "the tag shows up in viewer data");
    assert.equal(tag.items, 1, "it is attached to a current item, so the viewer can filter by it");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});
