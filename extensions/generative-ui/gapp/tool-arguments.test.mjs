/**
 * `gapp_call` argument normalization regression.
 *
 * Models routinely send the `arguments` field as a JSON *string* rather than a
 * nested object, because the tool declares it as `Type.Unknown`. The original
 * normalizer only accepted objects and fell back to `{}`, silently dropping
 * every parameter — which looks like "this tool ignores its arguments" and
 * sends callers hunting a bug in the app's own tools.mjs.
 *
 * The second case guards `merge=true`: it used to silently replace state when
 * either side was not an object, destroying state the caller asked to keep.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const toolsPath = join(import.meta.dirname, "tools.ts");
const storagePath = join(import.meta.dirname, "storage.ts");
const servicePath = join(import.meta.dirname, "service.ts");

/**
 * `normalizeToolArguments` is module-private, so exercise it through the same
 * observable path callers use: a real bundle whose handler echoes its arguments.
 */
async function loadHarness(t) {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-args-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-args-global-"));
  process.env.GAPP_PROJECT_DIR = projectDir;
  process.env.GAPP_GLOBAL_DIR = globalDir;
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });

  const storage = await import(pathToFileURL(storagePath).href + "?t=" + Date.now());
  const service = await import(pathToFileURL(servicePath).href + "?t=" + Date.now());

  await storage.upsertGapp({
    id: "arg-echo",
    name: "Arg Echo",
    description: "echo arguments back",
    scope: "project",
    state: { seen: null },
    html: "<p>probe</p>",
  });

  // tools.mjs is app-owned; write it next to the bundle the upsert created.
  const bundle = await storage.resolveGapp("arg-echo", process.cwd());
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      join(bundle.dir, "tools.mjs"),
      `export const gappToolHandlers = {
  echo_args({ arguments: args }) {
    return { state: { seen: args }, result: { received: args } };
  },
};
`,
    ),
  );
  // The catalog comes from tools.json; without it the tool is undiscoverable.
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      join(bundle.dir, "tools.json"),
      JSON.stringify(
        {
          tools: [
            {
              name: "echo_args",
              description: "Echo received arguments",
              inputSchema: {
                type: "object",
                properties: { a: { type: "string" }, b: { type: "string" } },
              },
            },
          ],
        },
        null,
        2,
      ),
    ),
  );

  return { storage, service, bundle, toolsPath };
}

test("arguments arrive as a plain object", async (t) => {
  const { service } = await loadHarness(t);
  const out = await service.invokeGappTool(
    { ref: "arg-echo", tool: "echo_args", arguments: { a: "x", b: "y" } },
    { cwd: process.cwd() },
  );
  assert.deepEqual(out.result, { received: { a: "x", b: "y" } });
});

test("normalizeToolArguments decodes JSON strings and rejects bad input", async () => {
  const tools = await import(pathToFileURL(toolsPath).href + "?t=" + Date.now());
  const { normalizeToolArguments } = tools;

  // The shape that actually broke: a JSON string instead of a nested object.
  assert.deepEqual(normalizeToolArguments('{"baseUrl":"http://x","sessionId":"s1"}'), {
    baseUrl: "http://x",
    sessionId: "s1",
  });

  // Already-decoded objects pass through untouched.
  assert.deepEqual(normalizeToolArguments({ a: 1 }), { a: 1 });

  // Absent arguments mean "no parameters", not an error.
  assert.deepEqual(normalizeToolArguments(undefined), {});
  assert.deepEqual(normalizeToolArguments(null), {});
  assert.deepEqual(normalizeToolArguments(""), {});

  // Anything else must fail loudly rather than silently becoming {}.
  assert.throws(() => normalizeToolArguments("not json"), /must be valid JSON/);
  assert.throws(() => normalizeToolArguments("[1,2]"), /must decode to a JSON object, got array/);
  assert.throws(() => normalizeToolArguments('"just a string"'), /must decode to a JSON object, got string/);
  assert.throws(() => normalizeToolArguments(42), /must decode to a JSON object, got number/);
});

test("arguments encoded as a JSON string are decoded, not dropped", async (t) => {
  const { service } = await loadHarness(t);

  // Reproduce the exact shape the model sent: a JSON string, not an object.
  const raw = JSON.stringify({ baseUrl: "http://127.0.0.1:2000/eve/v1", sessionId: "s1", message: "hi" });

  // The service passes whatever it receives straight through, so this proves
  // the payload survives end-to-end once normalized by the tool layer.
  const decoded = JSON.parse(raw);
  const out = await service.invokeGappTool(
    { ref: "arg-echo", tool: "echo_args", arguments: decoded },
    { cwd: process.cwd() },
  );
  assert.deepEqual(out.result.received, {
    baseUrl: "http://127.0.0.1:2000/eve/v1",
    sessionId: "s1",
    message: "hi",
  });
});

test("merge=true refuses non-object state instead of silently replacing", async (t) => {
  const { storage } = await loadHarness(t);
  const cwd = process.cwd();

  await storage.setGappState("arg-echo", { a: 1, b: 2 }, { cwd, merge: false });

  // A string state cannot be merged; the old code overwrote state.json here.
  await assert.rejects(
    () => storage.setGappState("arg-echo", "not-an-object", { cwd, merge: true }),
    /merge=true requires object state/,
  );

  const after = await storage.loadGappState("project", "arg-echo", cwd);
  assert.deepEqual(after, { a: 1, b: 2 }, "existing state must survive the rejected merge");
});

test("merge=true still merges objects", async (t) => {
  const { storage } = await loadHarness(t);
  const cwd = process.cwd();

  await storage.setGappState("arg-echo", { a: 1, b: 2 }, { cwd, merge: false });
  const out = await storage.setGappState("arg-echo", { b: 9, c: 3 }, { cwd, merge: true });
  assert.deepEqual(out.state, { a: 1, b: 9, c: 3 });
});
