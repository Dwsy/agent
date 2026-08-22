/**
 * Behavior tests for the memory viewer data contract and HTML assembly.
 * Run: bun test memory-export-data.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
  addPendingLearning,
  addRoleEvent,
  addRoleLearning,
  addRolePreference,
  buildMemoryExportData,
  ensureRoleMemoryFiles,
  reinforceRoleLearning,
  renderMemoryViewerHtml,
} = await import("./memory-md.ts");

const ROLE_NAME = "viewer-role";

function makeRole(prefix: string): string {
  const rolePath = mkdtempSync(join(tmpdir(), prefix));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  return rolePath;
}

test("events carry title/body/text as strings, never a stringified record", () => {
  const rolePath = makeRole("rp-export-events-");
  try {
    addRoleEvent(rolePath, ROLE_NAME, "shipped the viewer rewrite", { title: "Viewer rewrite", date: "2026-08-11" });

    const data = buildMemoryExportData(rolePath, ROLE_NAME, "static");
    assert.equal(data.events.length, 1);

    const event = data.events[0];
    assert.equal(typeof event.text, "string");
    assert.equal(event.title, "Viewer rewrite");
    assert.equal(event.date, "2026-08-11");
    assert.ok(event.text.includes("shipped the viewer rewrite"));
    assert.ok(!JSON.stringify(data).includes("[object Object]"));
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("learnings are tiered by how often they were reinforced", () => {
  const rolePath = makeRole("rp-export-tiers-");
  try {
    const seasoned = "prefer explicit contracts at module edges";
    addRoleLearning(rolePath, ROLE_NAME, seasoned, {});
    for (let i = 0; i < 3; i++) reinforceRoleLearning(rolePath, ROLE_NAME, seasoned);
    addRoleLearning(rolePath, ROLE_NAME, "fresh insight not reinforced yet", {});
    addRolePreference(rolePath, ROLE_NAME, "style", "keep comments about intent only");

    const data = buildMemoryExportData(rolePath, ROLE_NAME, "static");

    assert.deepEqual(data.learnings.map((l) => l.tier).sort(), ["new", "reinforced"]);
    assert.equal(data.stats.byTier.reinforced, 1);
    assert.equal(data.stats.byTier.new, 1);
    assert.equal(data.stats.reinforced, 1);
    assert.equal(data.stats.preferences, 1);
    assert.equal(data.preferences[0].category, "style");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("tags come from the persisted tag index, flagged as idle when no item carries them", async () => {
  const rolePath = makeRole("rp-export-tags-");
  try {
    await Bun.write(join(rolePath, ".log", "memory-tags.json"), JSON.stringify({
      version: "1.1",
      lastUpdated: new Date().toISOString(),
      learnedVocabulary: ["design"],
      tags: {
        design: { count: 7, lastUsed: new Date().toISOString().slice(0, 10), confidence: 0.9, associated: [], context: [] },
      },
      associations: {},
    }));

    const data = buildMemoryExportData(rolePath, ROLE_NAME, "static");
    const design = data.tags.find((t) => t.name === "design");

    assert.ok(design, "tag index entries should surface in the viewer data");
    assert.equal(design.count, 7);
    assert.equal(design.items, 0, "no current learning carries the tag");
    assert.ok(design.strength > 0 && design.strength <= 100);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("pending memories are counted separately from consolidated ones", () => {
  const rolePath = makeRole("rp-export-pending-");
  try {
    addPendingLearning(rolePath, "candidate memory awaiting a second sighting", "auto");

    const data = buildMemoryExportData(rolePath, ROLE_NAME, "static");
    assert.equal(data.pending.length, 1);
    assert.equal(data.stats.waiting, 1);
    assert.equal(data.pending[0].promoted, false);
    assert.equal(data.stats.total, 1);
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("static mode omits core files, live mode lists them", async () => {
  const rolePath = makeRole("rp-export-mode-");
  try {
    await Bun.write(join(rolePath, "core", "identity.md"), "# Identity\n\nabc\n");

    assert.deepEqual(buildMemoryExportData(rolePath, ROLE_NAME, "static").coreFiles, []);

    const live = buildMemoryExportData(rolePath, ROLE_NAME, "live");
    const identity = live.coreFiles.find((f) => f.path === "core/identity.md");
    assert.ok(identity, "core/identity.md should be listed in live mode");
    assert.equal(identity.dir, "core");
    assert.equal(identity.name, "identity");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("rendered document inlines assets and neutralises script-closing text", () => {
  const rolePath = makeRole("rp-export-html-");
  try {
    addRoleLearning(rolePath, ROLE_NAME, "escaping matters: </script><img src=x> stays inert", {});

    const html = renderMemoryViewerHtml(buildMemoryExportData(rolePath, ROLE_NAME, "static"));

    assert.ok(!html.includes("{{data}}"), "data placeholder must be substituted");
    assert.ok(!html.includes("/*{{styles}}*/"), "styles must be inlined");
    assert.ok(!html.includes("/*{{script}}*/"), "script must be inlined");
    assert.ok(!html.includes("{{title}}"), "title must be substituted");
    assert.ok(html.includes('id="viewer-data"'), "data island must be present");

    const payload = html.slice(html.indexOf('id="viewer-data"'));
    assert.ok(!payload.slice(0, payload.indexOf("</script>")).includes("</script"), "no early </script> in the JSON island");
    assert.ok(html.includes("\\u003c/script"), "angle brackets in memory text must be escaped");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});
