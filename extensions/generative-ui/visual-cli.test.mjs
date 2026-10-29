import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runVisualCli } from "./visual-cli.ts";

async function withTempWidgets(fn) {
  const dir = await mkdtemp(join(tmpdir(), "generative-ui-visual-cli-"));
  const emptySkills = join(dir, "empty-skills");
  await mkdir(emptySkills, { recursive: true });
  const prevWidgets = process.env.GENERATIVE_UI_WIDGETS_DIR;
  const prevRoots = process.env.VISUAL_SKILLS_ROOTS;
  process.env.GENERATIVE_UI_WIDGETS_DIR = dir;
  process.env.VISUAL_SKILLS_ROOTS = emptySkills;
  try {
    await fn(dir);
  } finally {
    if (prevWidgets === undefined) delete process.env.GENERATIVE_UI_WIDGETS_DIR;
    else process.env.GENERATIVE_UI_WIDGETS_DIR = prevWidgets;
    if (prevRoots === undefined) delete process.env.VISUAL_SKILLS_ROOTS;
    else process.env.VISUAL_SKILLS_ROOTS = prevRoots;
    await rm(dir, { recursive: true, force: true });
  }
}

function parseResult(result) {
  assert.equal(result.code, 0, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}

function parseError(result) {
  assert.equal(result.code, 1, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}

const WEB_GROUNDING = {
  status: "grounded",
  evidence_scope: "Current latency evidence",
  sources: [{
    label: "Latency report",
    kind: "web",
    locator: "https://example.com/latency-report",
    as_of: "2026-08-19",
  }],
};

test("route emits compact JSON, expands on --expand, and persists plan state", async () => {
  await withTempWidgets(async (dir) => {
    const compact = parseResult(await runVisualCli(["route", "chart current API latency"]));
    assert.equal(compact.ok, true);
    assert.equal(compact.details.target, "show_widget");
    assert.equal(compact.details.research, "required");
    assert.equal(compact.content, undefined);
    assert.ok(Array.isArray(compact.details.modules));
    assert.ok(Array.isArray(compact.details.templates));

    const expanded = parseResult(await runVisualCli(["route", "chart current API latency", "--expand"]));
    assert.equal(typeof expanded.content, "string");
    assert.ok(expanded.content.length > 0);
    assert.equal(expanded.details.route, compact.details.route);
    assert.equal(expanded.details.target, compact.details.target);
    assert.equal(expanded.details.research, compact.details.research);

    const plan = JSON.parse(await readFile(join(dir, "last-plan.json"), "utf8"));
    assert.equal(plan.route, compact.details.route);
    assert.equal(plan.target, "show_widget");
    assert.equal(plan.research, "required");
    assert.ok(Array.isArray(plan.modules));
    assert.ok(Array.isArray(plan.templates));
  });
});

test("widget render without a grounding declaration is rejected", async () => {
  await withTempWidgets(async () => {
    const body = parseError(await runVisualCli([
      "widget", "--title", "no_ground", "--html", "<main>facts</main>", "--no-open",
    ]));
    assert.equal(body.ok, false);
    assert.match(body.error.message, /grounding is required/);
  });
});

test("plan enforcement blocks not_applicable on research-required routes and consumes the plan on a grounded render", async () => {
  await withTempWidgets(async (dir) => {
    parseResult(await runVisualCli(["route", "chart current API latency"]));

    const blocked = parseError(await runVisualCli([
      "widget", "--title", "latency", "--html", "<main>42 ms</main>",
      "--grounding", JSON.stringify({ status: "not_applicable", evidence_scope: "No evidence" }),
      "--no-open",
    ]));
    assert.equal(blocked.ok, false);
    assert.match(blocked.error.message, /requires factual retrieval/);
    assert.ok(existsSync(join(dir, "last-plan.json")), "failed render keeps the plan");

    const grounded = parseResult(await runVisualCli([
      "widget", "--title", "latency", "--html", "<main>42 ms</main>",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));
    assert.equal(grounded.ok, true);
    assert.equal(existsSync(join(dir, "last-plan.json")), false, "matching render consumes the plan");
  });
});

test("widget --no-open saves the index record and a provenance footer", async () => {
  await withTempWidgets(async (dir) => {
    const body = parseResult(await runVisualCli([
      "widget", "--title", "latency_report", "--html", "<main>42 ms</main>",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));
    assert.equal(body.ok, true);
    assert.equal(body.opened, false);
    assert.equal(body.isSVG, false);

    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    const record = index.find((entry) => entry.file === body.savedFile);
    assert.ok(record, "index.json contains the saved widget");
    assert.deepEqual(record.grounding, WEB_GROUNDING);

    const saved = await readFile(join(dir, body.savedFile), "utf8");
    assert.match(saved, /data-genui-provenance="grounded"/);
    assert.match(saved, /https:\/\/example\.com\/latency-report/);
  });
});

test("browse lists saved widgets and returns their html", async () => {
  await withTempWidgets(async (dir) => {
    const rendered = parseResult(await runVisualCli([
      "widget", "--title", "browsable", "--html", "<main>hello</main>",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));

    const list = parseResult(await runVisualCli(["browse", "list"]));
    assert.equal(list.ok, true);
    assert.ok(list.widgets.length >= 1);
    assert.ok(list.widgets.some((entry) => entry.file === rendered.savedFile));

    const html = parseResult(await runVisualCli(["browse", "html", rendered.savedFile]));
    assert.equal(html.filename, rendered.savedFile);
    assert.match(html.html, /<main>hello<\/main>/);
  });
});

test("canvas --no-open compiles TSX, saves source, and surfaces compile errors verbatim", async () => {
  await withTempWidgets(async (dir) => {
    const body = parseResult(await runVisualCli([
      "canvas", "--title", "audit", "--tsx", "export default function Audit(){ return <main>Finding</main>; }",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));
    assert.equal(body.ok, true);
    assert.equal(body.kind, "canvas");
    const saved = await readFile(join(dir, body.savedFile), "utf8");
    assert.match(saved, /genui-grounding/);
    const source = await readFile(join(dir, body.sourceFile), "utf8");
    assert.match(source, /export default/);

    const broken = parseError(await runVisualCli([
      "canvas", "--title", "broken", "--tsx", "export default function Broken( { return <main>}</main>; }",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));
    assert.equal(broken.ok, false);
    assert.match(broken.error.message, /Canvas compile failed/);
  });
});
