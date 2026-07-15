import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const hasBun = typeof Bun !== "undefined";
const storagePath = join(import.meta.dirname, "storage.ts");

function record(i) {
  return {
    id: `id-${i}`,
    title: `widget ${i}`,
    timestamp: `2026-07-13T10-00-${String(i).padStart(2, "0")}`,
    file: `2026-07-13T10-00-${String(i).padStart(2, "0")}_widget_${i}.html`,
    width: 800,
    height: 600,
    isSVG: false,
    cwd: "/tmp/generative-ui-test",
  };
}

test("parallel saveWidget keeps all index entries via real storage.ts", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "generative-ui-widgets-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  if (hasBun) {
    process.env.GENERATIVE_UI_WIDGETS_DIR = dir;
    t.after(() => {
      delete process.env.GENERATIVE_UI_WIDGETS_DIR;
    });
    const storage = await import(pathToFileURL(storagePath).href + "?t=" + Date.now());
    const n = 8;
    await Promise.all(
      Array.from({ length: n }, (_, i) => storage.saveWidget(record(i), `<p>${i}</p>`)),
    );
    const index = await storage.loadWidgetIndex();
    assert.equal(index.length, n);
    const files = new Set(index.map((r) => r.file));
    assert.equal(files.size, n);
    for (let i = 0; i < n; i++) {
      assert.ok(files.has(record(i).file));
      assert.equal(await readFile(join(dir, record(i).file), "utf8"), `<p>${i}</p>`);
    }

    await Promise.all(
      Array.from({ length: n }, (_, i) => storage.appendWidgetEvent(record(0).file, {
        type: "annotation",
        targetId: ` target-${i} `,
        comment: ` feedback-${i} `,
      })),
    );
    const updated = (await storage.loadWidgetIndex()).find((item) => item.file === record(0).file);
    assert.equal(updated.events.length, n);
    assert.deepEqual(
      new Set(updated.events.map((event) => event.targetId)),
      new Set(Array.from({ length: n }, (_, i) => `target-${i}`)),
    );
    assert.equal(updated.interactionData, undefined);

    await storage.appendWidgetEvent(record(0).file, { choice: "A" });
    await storage.appendWidgetEvent(record(0).file, {
      type: "annotation",
      targetId: "confirm",
      comment: "Keep the selected choice visible.",
    });
    const compatible = (await storage.loadWidgetIndex()).find((item) => item.file === record(0).file);
    assert.deepEqual(compatible.interactionData, { choice: "A" });
    assert.equal(compatible.events.length, n + 2);
    return;
  }

  // node --test: drive real storage.ts through bun -e
  const script = `
    process.env.GENERATIVE_UI_WIDGETS_DIR = ${JSON.stringify(dir)};
    const s = await import(${JSON.stringify(pathToFileURL(storagePath).href)});
    const n = 8;
    const rec = (i) => ({
      id: "id-" + i,
      title: "widget " + i,
      timestamp: "2026-07-13T10-00-" + String(i).padStart(2, "0"),
      file: "2026-07-13T10-00-" + String(i).padStart(2, "0") + "_widget_" + i + ".html",
      width: 800, height: 600, isSVG: false, cwd: "/tmp/t"
    });
    await Promise.all(Array.from({length:n}, (_,i) => s.saveWidget(rec(i), "<p>"+i+"</p>")));
    const index = await s.loadWidgetIndex();
    if (index.length !== n) {
      console.error("FAIL length", index.length, index.map(x => x.file));
      process.exit(1);
    }
    await Promise.all(Array.from({length:n}, (_,i) => s.appendWidgetEvent(rec(0).file, {
      type: "annotation", targetId: " target-" + i + " ", comment: " feedback-" + i + " "
    })));
    const updated = (await s.loadWidgetIndex()).find(x => x.file === rec(0).file);
    if (updated.events.length !== n) {
      console.error("FAIL events", updated.events.length);
      process.exit(1);
    }
    const targets = new Set(updated.events.map(x => x.targetId));
    if (targets.size !== n || !targets.has("target-0") || !targets.has("target-7")) {
      console.error("FAIL targets", Array.from(targets));
      process.exit(1);
    }
    for (const invalid of [
      { type: "annotation", targetId: "", comment: "bad" },
      { type: "annotation", targetId: "target", comment: "bad", stateId: 0 },
    ]) {
      try {
        s.createWidgetEvent(invalid, "fixed");
        console.error("FAIL invalid annotation accepted");
        process.exit(1);
      } catch (error) {
        if (error.name !== "WidgetEventValidationError") throw error;
      }
    }
    console.log("OK", index.length, updated.events.length);
  `;
  const r = spawnSync("bun", ["-e", script], { encoding: "utf8" });
  if (r.error?.code === "ENOENT") {
    t.skip("bun required to import storage.ts under node --test");
    return;
  }
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /OK 8 8/);
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  assert.equal(index.length, 8);
});

test("event sidecar preserves concurrent cross-process appends", async (t) => {
  if (spawnSync("bun", ["--version"], { encoding: "utf8" }).status !== 0) {
    t.skip("bun required for cross-process TypeScript imports");
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), "generative-ui-events-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const target = record(0);
  await writeFile(join(dir, target.file), "<p>widget</p>", "utf8");
  await writeFile(join(dir, "index.json"), JSON.stringify([target]), "utf8");

  const run = (i) => new Promise((resolve, reject) => {
    const script = `
      process.env.GENERATIVE_UI_WIDGETS_DIR = ${JSON.stringify(dir)};
      const s = await import(${JSON.stringify(pathToFileURL(storagePath).href)});
      await s.appendWidgetEvent(${JSON.stringify(target.file)}, { value: ${i} });
    `;
    const child = spawn("bun", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `bun exited ${code}`));
    });
  });

  const n = 12;
  await Promise.all(Array.from({ length: n }, (_, i) => run(i)));
  const eventsDir = join(dir, target.file + ".events");
  const eventFiles = (await readdir(eventsDir)).filter((file) => file.endsWith(".json"));
  const events = await Promise.all(eventFiles.map(async (file) =>
    JSON.parse(await readFile(join(eventsDir, file), "utf8")),
  ));
  assert.equal(events.length, n);
  assert.deepEqual(
    new Set(events.map((event) => event.data.value)),
    new Set(Array.from({ length: n }, (_, i) => i)),
  );
});

test("deterministic barrier: unlocked rmw drops rows, queue keeps them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "generative-ui-race-"));
  try {
    const indexPath = join(dir, "index.json");
    await writeFile(indexPath, "[]", "utf8");

    const readIndex = async () => JSON.parse(await readFile(indexPath, "utf8"));
    const writeIndex = async (index) => writeFile(indexPath, JSON.stringify(index), "utf8");

    // Barrier so every unlocked writer reads before any writes.
    const n = 10;
    let arrived = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const saveUnlocked = async (i) => {
      await writeFile(join(dir, `u-${i}.html`), "x", "utf8");
      const index = await readIndex();
      arrived += 1;
      if (arrived === n) release();
      await gate;
      index.unshift({ file: `u-${i}.html`, id: `u-${i}` });
      await writeIndex(index);
    };

    await Promise.all(Array.from({ length: n }, (_, i) => saveUnlocked(i)));
    const unlocked = await readIndex();
    assert.equal(
      unlocked.length,
      1,
      `unlocked last-write-wins should keep 1 row, got ${unlocked.length}`,
    );

    // Locked queue.
    let queue = Promise.resolve();
    const withLock = (fn) => {
      const run = queue.then(fn, fn);
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    await writeIndex([]);
    const saveLocked = async (i) => {
      await writeFile(join(dir, `l-${i}.html`), "x", "utf8");
      await withLock(async () => {
        const index = await readIndex();
        index.unshift({ file: `l-${i}.html`, id: `l-${i}` });
        await writeIndex(index);
      });
    };
    await Promise.all(Array.from({ length: n }, (_, i) => saveLocked(i)));
    const locked = await readIndex();
    assert.equal(locked.length, n);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage source serializes index mutations", async () => {
  const src = await readFile(storagePath, "utf8");
  assert.match(src, /withIndexLock/);
  assert.match(src, /indexQueue/);
  assert.match(src, /GENERATIVE_UI_WIDGETS_DIR/);
  // All mutators go through the lock.
  assert.match(src, /export type WidgetEvent = WidgetAnnotationEvent \| WidgetInteractionEvent/);
  assert.match(src, /export function createWidgetEvent/);
  assert.match(src, /randomUUID\(\)/);
  assert.match(src, /flag: "wx"/);
  assert.match(src, /widgetEventsDir\(file\)/);
  for (const name of ["saveWidget", "renameWidgetTitle", "setWidgetsArchived", "deleteWidgets"]) {
    assert.match(src, new RegExp(`export async function ${name}[\\s\\S]*?withIndexLock`));
  }
});
