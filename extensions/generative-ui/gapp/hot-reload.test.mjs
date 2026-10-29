/**
 * Hot-reload regression for app-owned modules (tools.mjs / tui.mjs).
 *
 * Bun keys its ESM cache by resolved path and ignores URL query strings, so
 * `import(`${url}?mtime=…`)` kept returning the first-loaded copy for the life
 * of the daemon: an edited tools.mjs never took effect until a restart. These
 * tests pin the loader that fixes it (app-module.ts / tool-module.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

async function load(name) {
  return import(pathToFileURL(join(root, name)).href + "?t=" + Date.now());
}

/** Deterministic mtimes: distinct edits must not depend on clock granularity. */
const EARLY = new Date(1_600_000_000_000);
const LATE = new Date(1_700_000_000_000);

async function tempDir() {
  return mkdtemp(join(tmpdir(), "gapp-hot-"));
}

test("loadAppModule re-executes after the file changes (mtime)", async () => {
  const { loadAppModule } = await load("app-module.ts");
  const dir = await tempDir();
  try {
    const file = join(dir, "mod.mjs");
    await writeFile(file, "export const v = 1;\n");
    await utimes(file, EARLY, EARLY);
    assert.equal((await loadAppModule(file)).v, 1);

    await writeFile(file, "export const v = 2;\n");
    await utimes(file, LATE, LATE);
    assert.equal((await loadAppModule(file)).v, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalidateAppModule re-executes even when the mtime is unchanged", async () => {
  const { loadAppModule, invalidateAppModule } = await load("app-module.ts");
  const dir = await tempDir();
  try {
    const file = join(dir, "mod.mjs");
    await writeFile(file, "export const v = 1;\n");
    await utimes(file, EARLY, EARLY);
    assert.equal((await loadAppModule(file)).v, 1);

    await writeFile(file, "export const v = 2;\n");
    await utimes(file, EARLY, EARLY); // same mtime as the memoized load
    assert.equal((await loadAppModule(file)).v, 1, "unchanged mtime must stay memoized");

    invalidateAppModule(file);
    assert.equal((await loadAppModule(file)).v, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tools.mjs handlers hot-swap without a daemon restart", async () => {
  const { loadGappExecutableToolModule } = await load("tool-module.ts");
  const dir = await tempDir();
  try {
    const file = join(dir, "tools.mjs");
    const write = async (value, stamp) => {
      await writeFile(
        file,
        `export const gappToolHandlers = { ping: () => ({ state: {}, result: "${value}" }) };\n`,
      );
      await utimes(file, stamp, stamp);
    };

    await write("one", EARLY);
    let module = await loadGappExecutableToolModule(dir);
    assert.equal((await module.handlers.ping({ state: {}, arguments: {} })).result, "one");

    await write("two", LATE);
    module = await loadGappExecutableToolModule(dir);
    assert.equal((await module.handlers.ping({ state: {}, arguments: {} })).result, "two");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing tools.mjs still resolves to null", async () => {
  const { loadGappExecutableToolModule } = await load("tool-module.ts");
  const dir = await tempDir();
  try {
    assert.equal(await loadGappExecutableToolModule(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
