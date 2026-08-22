/**
 * Integration tests for the memory viewer HTTP surface: routing, status codes,
 * path confinement, and the exact-id precondition that keeps the record
 * mutators' fuzzy text fallback from firing on a UI-issued edit.
 * Run: bun test memory-viewer-api.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  getMarkdownTheme: () => ({}),
}));

mock.module("@earendil-works/pi-tui", () => ({
  Key: { escape: "escape", up: "up", down: "down", pageUp: "pageUp", pageDown: "pageDown", home: "home", end: "end", ctrl: (c: string) => c },
  Markdown: class { render() { return []; } invalidate() {} },
  matchesKey: () => false,
  truncateToWidth: (s: string) => s,
  visibleWidth: (s: string) => s.length,
}));

const { addPendingLearning, addRoleLearning, ensureRoleMemoryFiles, readRoleMemory } = await import("./memory-md.ts");
const { startMemoryServer } = await import("./memory-viewer.ts");

const ROLE = "api-role";

async function withServer(
  prefix: string,
  seed: (rolePath: string) => void,
  run: (call: {
    rolePath: string;
    get: (path: string) => Promise<Response>;
    put: (path: string, payload: unknown) => Promise<Response>;
    mutate: (payload: unknown) => Promise<Response>;
  }) => Promise<void>,
): Promise<void> {
  const rolePath = mkdtempSync(join(tmpdir(), prefix));
  ensureRoleMemoryFiles(rolePath, ROLE);
  seed(rolePath);

  const server = await startMemoryServer(rolePath, ROLE);
  const send = (path: string, method: string, payload: unknown) =>
    fetch(server.url + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    await run({
      rolePath,
      get: (path) => fetch(server.url + path),
      put: (path, payload) => send(path, "PUT", payload),
      mutate: (payload) => send("/api/memory", "POST", payload),
    });
  } finally {
    await server.close();
    rmSync(rolePath, { recursive: true, force: true });
  }
}

test("serves the viewer document and a live data snapshot", async () => {
  await withServer("rp-api-serve-", (rolePath) => {
    addRoleLearning(rolePath, ROLE, "the viewer serves live data", { appendDaily: false });
  }, async ({ get }) => {
    const page = await get("/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") || "", /text\/html/);
    const html = await page.text();
    assert.ok(html.includes('id="viewer-data"'));

    const data = await (await get("/api/data")).json();
    assert.equal(data.mode, "live");
    assert.equal(data.learnings.length, 1);
    assert.equal(data.learnings[0].text, "the viewer serves live data");

    assert.equal((await get("/nope")).status, 404);
  });
});

test("create, update, reinforce and delete a learning round-trip to disk", async () => {
  await withServer("rp-api-crud-", () => {}, async ({ rolePath, mutate }) => {
    const created = await (await mutate({ action: "create", kind: "learning", text: "prefer boring solutions" })).json();
    assert.equal(created.ok, true);
    assert.ok(created.id);

    const updated = await (await mutate({ action: "update", kind: "learning", id: created.id, text: "prefer boring, obvious solutions" })).json();
    assert.equal(updated.ok, true);
    assert.notEqual(updated.id, created.id, "content-derived id changes with the text");

    const reinforced = await (await mutate({ action: "reinforce", id: updated.id })).json();
    assert.equal(reinforced.ok, true);
    assert.equal(readRoleMemory(rolePath, ROLE).learnings[0].used, 1);

    const deleted = await mutate({ action: "delete", kind: "learning", id: updated.id });
    assert.equal(deleted.status, 200);
    assert.equal(readRoleMemory(rolePath, ROLE).learnings.length, 0);
  });
});

test("a stale id is refused instead of fuzzy-matching a different record", async () => {
  await withServer("rp-api-exact-", (rolePath) => {
    addRoleLearning(rolePath, ROLE, "always reproduce the bug before fixing it", { appendDaily: false });
    addRoleLearning(rolePath, ROLE, "always reproduce the bug before fixing it in production", { appendDaily: false });
  }, async ({ rolePath, mutate }) => {
    const before = readRoleMemory(rolePath, ROLE).learnings.map((l) => l.text).sort();

    const stale = await mutate({ action: "delete", kind: "learning", id: "0000deadbeef" });
    assert.equal(stale.status, 409);
    assert.match(await stale.text(), /changed on disk/);

    const staleUpdate = await mutate({ action: "update", kind: "learning", id: "0000deadbeef", text: "rewritten" });
    assert.equal(staleUpdate.status, 409);

    const after = readRoleMemory(rolePath, ROLE).learnings.map((l) => l.text).sort();
    assert.deepEqual(after, before, "no record may be touched when the id misses");
  });
});

test("duplicates and malformed requests fail with actionable statuses", async () => {
  await withServer("rp-api-guard-", (rolePath) => {
    addRoleLearning(rolePath, ROLE, "one of a kind", { appendDaily: false });
  }, async ({ mutate }) => {
    const duplicate = await mutate({ action: "create", kind: "learning", text: "one of a kind" });
    assert.equal(duplicate.status, 409);
    assert.match(await duplicate.text(), /already exists/);

    assert.equal((await mutate({ action: "create", kind: "learning", text: "   " })).status, 400);
    assert.equal((await mutate({ action: "create", kind: "nonsense", text: "x" })).status, 400);
    assert.equal((await mutate({ action: "explode", kind: "learning" })).status, 400);
    assert.equal((await mutate({ action: "delete", kind: "learning" })).status, 400);
  });
});

test("pending memories can be promoted and discarded", async () => {
  await withServer("rp-api-pending-", (rolePath) => {
    addPendingLearning(rolePath, "candidate worth keeping", "auto");
    addPendingLearning(rolePath, "candidate worth dropping", "auto");
  }, async ({ rolePath, get, mutate }) => {
    const data = await (await get("/api/data")).json();
    const keep = data.pending.find((p: { text: string }) => p.text.includes("keeping"));
    const drop = data.pending.find((p: { text: string }) => p.text.includes("dropping"));

    assert.equal((await mutate({ action: "promote", id: keep.id })).status, 200);
    assert.equal((await mutate({ action: "discard", id: drop.id })).status, 200);

    const after = await (await get("/api/data")).json();
    assert.equal(after.pending.length, 0);
    assert.ok(after.learnings.some((l: { text: string }) => l.text === "candidate worth keeping"));

    assert.equal((await mutate({ action: "promote", id: drop.id })).status, 409, "a discarded item is gone");
  });
});

test("events are editable and keep their markdown round-trip", async () => {
  await withServer("rp-api-events-", () => {}, async ({ rolePath, mutate }) => {
    const created = await (await mutate({
      action: "create", kind: "event", title: "Shipped the editor", text: "Records can be edited in the browser.", date: "2026-08-11",
    })).json();
    assert.equal(created.ok, true);

    const updated = await (await mutate({
      action: "update", kind: "event", id: created.id, title: "Shipped the record editor", text: "Records can be edited in the browser.", date: "2026-08-11",
    })).json();
    assert.equal(updated.ok, true);

    const events = readRoleMemory(rolePath, ROLE).events;
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Shipped the record editor");
    assert.equal(events[0].date, "2026-08-11");
    assert.equal(events[0].id, updated.id, "the id parsed back off disk matches the one handed to the client");

    assert.equal((await mutate({ action: "delete", kind: "event", id: updated.id })).status, 200);
    assert.equal(readRoleMemory(rolePath, ROLE).events.length, 0);
  });
});

test("an event needs a title or details, but not both", async () => {
  await withServer("rp-api-event-title-", () => {}, async ({ rolePath, mutate }) => {
    const headline = await mutate({ action: "create", kind: "event", title: "Cutover completed", text: "", date: "2026-08-11" });
    assert.equal(headline.status, 200);

    const stored = readRoleMemory(rolePath, ROLE).events[0];
    assert.equal(stored.title, "Cutover completed");
    assert.equal(stored.body, "");

    const blank = await mutate({ action: "create", kind: "event", title: "  ", text: "" });
    assert.equal(blank.status, 400);
    assert.match(await blank.text(), /title or some details/);
  });
});

test("journal entries are addressable by day and position", async () => {
  await withServer("rp-api-daily-", (rolePath) => {
    mkdirSync(join(rolePath, "memory", "daily"), { recursive: true });
    writeFileSync(join(rolePath, "memory", "daily", "2026-08-11.md"), [
      "# Memory: 2026-08-11",
      "",
      "## [09:14] EVENT",
      "",
      "first entry",
      "",
      "## [14:02] LESSON",
      "",
      "second entry",
      "spanning two lines",
      "",
    ].join("\n"));
  }, async ({ rolePath, get, mutate }) => {
    const data = await (await get("/api/data")).json();
    assert.equal(data.daily.length, 2);
    assert.equal(data.daily[0].index, 0);
    assert.equal(data.daily[0].kind, "EVENT");
    assert.equal(data.daily[1].text, "second entry\nspanning two lines", "line breaks survive parsing");

    const edited = await mutate({
      action: "update", kind: "daily", date: "2026-08-11", index: 0, text: "first entry, corrected", previous: "first entry",
    });
    assert.equal(edited.status, 200);

    const file = () => readFileSync(join(rolePath, "memory", "daily", "2026-08-11.md"), "utf-8");
    assert.match(file(), /## \[09:14\] EVENT/, "the original timestamp and kind are preserved");
    assert.match(file(), /first entry, corrected/);
    assert.match(file(), /spanning two lines/, "the untouched entry keeps its line breaks");

    const stale = await mutate({
      action: "update", kind: "daily", date: "2026-08-11", index: 0, text: "x", previous: "first entry",
    });
    assert.equal(stale.status, 409, "the previous text no longer matches");

    const removed = await mutate({
      action: "delete", kind: "daily", date: "2026-08-11", index: 1, previous: "second entry\nspanning two lines",
    });
    assert.equal(removed.status, 200);
    assert.doesNotMatch(file(), /second entry/);
    assert.match(file(), /first entry, corrected/, "deleting one entry keeps the others");

    assert.equal((await mutate({ action: "update", kind: "daily", date: "11-08-2026", index: 0, text: "x" })).status, 400);
    assert.equal((await mutate({ action: "update", kind: "daily", date: "2026-08-11", index: -1, text: "x" })).status, 400);
    assert.equal((await mutate({ action: "update", kind: "daily", date: "2026-08-11", index: 9, text: "x" })).status, 409);
    assert.equal((await mutate({ action: "update", kind: "daily", date: "2026-01-01", index: 0, text: "x" })).status, 409, "a day with no file");
    assert.equal((await mutate({ action: "create", kind: "daily", text: "x" })).status, 400, "journal entries cannot be created here");
  });
});

test("core file access stays inside the role's editable directories", async () => {
  await withServer("rp-api-core-", () => {}, async ({ get, put }) => {
    assert.equal((await get("/api/core?file=../../../etc/passwd")).status, 403);
    assert.equal((await get("/api/core?file=memory/consolidated.md")).status, 403);
    assert.equal((await get("/api/core?file=core/identity.exe")).status, 403);
    assert.equal((await get("/api/core")).status, 400);
    assert.equal((await get("/api/core?file=core/missing.md")).status, 404);

    assert.equal((await put("/api/core", { file: "../escape.md", content: "nope" })).status, 403);
    assert.equal((await put("/api/core", { file: "core/identity.md" })).status, 400);
  });
});

test("core markdown can be written and read back", async () => {
  await withServer("rp-api-core-write-", () => {}, async ({ rolePath, get, put }) => {
    const content = "# Identity\n\nedited by the viewer\n";
    assert.equal((await put("/api/core", { file: "core/identity.md", content })).status, 200);
    assert.equal(readFileSync(join(rolePath, "core", "identity.md"), "utf-8"), content);

    const reread = await get("/api/core?file=core/identity.md");
    assert.equal(reread.status, 200);
    assert.match(await reread.text(), /edited by the viewer/);
  });
});
