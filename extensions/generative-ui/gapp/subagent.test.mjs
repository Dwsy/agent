/** Parallel generate subagent tests (bun — imports .ts directly). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
// Canonical imports (no cache busting) so subagent/generate/registry share state.
const canonical = (name) => import(pathToFileURL(join(root, name)).href);

const FIXTURE = join(root, "test-fixtures", "fake-pi.mjs");

function useFakePi(t, env = {}) {
  process.env.GAPP_SUBAGENT_CMD = `node ${FIXTURE}`;
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  t.after(() => {
    delete process.env.GAPP_SUBAGENT_CMD;
    for (const key of Object.keys(env)) delete process.env[key];
  });
}

test("runSubagent passes headless flags and JSON instruction, returns assistant text", async (t) => {
  useFakePi(t);
  const { runSubagent } = await canonical("subagent.ts");

  const out = await runSubagent({ prompt: "hello world", system: "be terse", format: "json" });
  const { args } = JSON.parse(out);
  assert.ok(args.includes("-p"));
  assert.ok(args.includes("--no-session"));
  assert.ok(args.includes("--no-tools"));
  assert.equal(args[args.indexOf("--mode") + 1], "json");
  assert.equal(args[args.indexOf("--system-prompt") + 1], "be terse");
  const prompt = args[args.length - 1];
  assert.match(prompt, /^hello world/);
  assert.match(prompt, /valid JSON only/);
});

test("concurrency cap serializes excess jobs", async (t) => {
  useFakePi(t, { GAPP_SUBAGENT_CONCURRENCY: "2", FAKE_PI_DELAY_MS: "250" });
  const { runSubagent, subagentPoolStatus } = await canonical("subagent.ts");

  const started = Date.now();
  const jobs = Promise.all(
    Array.from({ length: 4 }, (_, i) => runSubagent({ prompt: `job ${i}` })),
  );
  // Give the pool a beat to admit the first batch, then check the cap holds.
  await new Promise((r) => setTimeout(r, 100));
  const status = subagentPoolStatus();
  assert.ok(status.active <= 2, `active ${status.active} exceeds cap`);
  assert.ok(status.waiting >= 1, "excess jobs should queue");

  await jobs;
  const elapsed = Date.now() - started;
  // 4 jobs × 250ms at concurrency 2 → at least two sequential batches.
  assert.ok(elapsed >= 400, `finished too fast for capped pool: ${elapsed}ms`);
});

test("resolves on agent_settled even though the process never exits", async (t) => {
  useFakePi(t, { FAKE_PI_DELAY_MS: "50" });
  const { runSubagent } = await canonical("subagent.ts");

  const started = Date.now();
  const out = await runSubagent({ prompt: "hang test", timeoutMs: 10_000 });
  const elapsed = Date.now() - started;

  // The fixture hangs forever after agent_settled; resolving at all proves
  // the kill-on-completion path, and elapsed must be far below the timeout.
  assert.ok(JSON.parse(out).args.includes("hang test"));
  assert.ok(elapsed < 5_000, `took ${elapsed}ms; should resolve right after agent_settled`);
});

test("non-zero exit rejects with diagnostic", async (t) => {
  useFakePi(t, { FAKE_PI_FAIL: "1" });
  const { runSubagent } = await canonical("subagent.ts");

  await assert.rejects(
    () => runSubagent({ prompt: "x" }),
    (err) => {
      assert.match(err.message, /exited with code 2/);
      assert.match(err.message, /boom/);
      return true;
    },
  );
});

test("dispatchGenerate subagent mode runs jobs in parallel and fills the registry", async (t) => {
  useFakePi(t, { FAKE_PI_DELAY_MS: "100" });
  const { dispatchGenerate } = await canonical("generate.ts");
  const { getGenerateJob } = await canonical("registry.ts");

  const ids = ["par_a", "par_b", "par_c"];
  for (const requestId of ids) {
    const result = dispatchGenerate({ appId: "demo", requestId, prompt: `p-${requestId}` });
    assert.equal(result.ok, true);
    assert.equal(result.via, "subagent");
    assert.equal(result.created, true);
  }
  // Duplicate requestId is deduped, not re-run.
  assert.equal(dispatchGenerate({ appId: "demo", requestId: "par_a", prompt: "again" }).created, false);

  const deadline = Date.now() + 5_000;
  while (ids.some((id) => getGenerateJob(id)?.status !== "done")) {
    if (Date.now() > deadline) throw new Error("jobs did not finish in time");
    await new Promise((r) => setTimeout(r, 25));
  }
  for (const requestId of ids) {
    const job = getGenerateJob(requestId);
    assert.equal(job.status, "done");
    const { args } = JSON.parse(job.text);
    assert.equal(args[args.length - 1], `p-${requestId}`);
  }
});

test("dispatchGenerate agent mode requires a bridge", async (t) => {
  useFakePi(t);
  const { dispatchGenerate } = await canonical("generate.ts");
  const { setAgentBridge } = await canonical("registry.ts");

  setAgentBridge({ notify: null });
  const result = dispatchGenerate({ appId: "demo", requestId: "agent_1", prompt: "x", mode: "agent" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "host_unavailable");

  const seen = [];
  setAgentBridge({ notify: (text) => seen.push(text), busy: () => false });
  const ok = dispatchGenerate({ appId: "demo", requestId: "agent_2", prompt: "hello", mode: "agent" });
  assert.equal(ok.ok, true);
  assert.equal(ok.via, "agent");
  assert.equal(seen.length, 1);
  assert.match(seen[0], /\[GAPP generate\] app=demo requestId=agent_2/);
});
