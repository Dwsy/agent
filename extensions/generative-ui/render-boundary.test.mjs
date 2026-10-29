import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runVisualCli } from "./visual-cli.ts";
import { enforceGroundingForPlan } from "./render-policy.ts";

async function withTempWorld(fn) {
  const dir = await mkdtemp(join(tmpdir(), "generative-ui-render-boundary-"));
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

const CODE_GROUNDING = {
  status: "grounded",
  evidence_scope: "Repository implementation",
  sources: [{
    label: "render-policy enforceGroundingForPlan",
    kind: "code",
    locator: "extensions/generative-ui/render-policy.ts#enforceGroundingForPlan",
    as_of: "2026-08-19",
  }],
};

const NOT_APPLICABLE = { status: "not_applicable", evidence_scope: "No evidence" };

test("render-policy is the single plan-grounding authority", () => {
  const researchRequired = { route: "evidence-brief", target: "show_widget", research: "required" };
  assert.throws(
    () => enforceGroundingForPlan(NOT_APPLICABLE, researchRequired, "show_widget"),
    /requires factual retrieval/,
  );
  assert.doesNotThrow(() => enforceGroundingForPlan(WEB_GROUNDING, researchRequired, "show_widget"));
  // A plan never constrains the other target.
  assert.doesNotThrow(() => enforceGroundingForPlan(NOT_APPLICABLE, researchRequired, "show_canvas"));

  const evidenceBearing = { route: "metric-chart", target: "show_widget", research: "if_missing" };
  assert.throws(
    () => enforceGroundingForPlan(NOT_APPLICABLE, evidenceBearing, "show_widget"),
    /evidence\/structure-bearing/,
  );
  for (const route of ["illustration", "ui-mockup", "interactive-explainer"]) {
    assert.doesNotThrow(
      () => enforceGroundingForPlan(NOT_APPLICABLE, { route, target: "show_widget", research: "if_missing" }, "show_widget"),
    );
  }
  assert.doesNotThrow(() => enforceGroundingForPlan(NOT_APPLICABLE, null, "show_widget"));
});

test("visual-cli renders enforce and persist route-aware provenance end to end", async () => {
  await withTempWorld(async (dir) => {
    const planPath = join(dir, "last-plan.json");

    // Grounding is mandatory before any plan consideration.
    const missing = parseError(await runVisualCli([
      "widget", "--title", "missing", "--html", "<main>facts</main>", "--no-open",
    ]));
    assert.equal(missing.ok, false);
    assert.match(missing.error.message, /grounding is required/);

    // Route persists the plan; skillRefs stay empty with isolated skill roots.
    const widgetRoute = parseResult(await runVisualCli(["route", "chart current API latency"]));
    assert.equal(widgetRoute.details.target, "show_widget");
    assert.equal(widgetRoute.details.research, "required");
    assert.deepEqual(widgetRoute.details.skillRefs, []);
    assert.equal(widgetRoute.details.warnings, undefined);
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(plan.target, "show_widget");
    assert.equal(plan.research, "required");

    // A render of the other target is free and never steals the pending plan.
    parseResult(await runVisualCli([
      "canvas", "--title", "concept_canvas",
      "--tsx", "export default function Concept(){ return <main>Concept only</main>; }",
      "--grounding", JSON.stringify({ status: "not_applicable", evidence_scope: "Purely conceptual canvas" }),
      "--no-open",
    ]));
    assert.ok(existsSync(planPath), "non-matching render keeps the plan");

    // The matching render is enforced: not_applicable cannot escape a research-required route.
    const escaped = parseError(await runVisualCli([
      "widget", "--title", "latency", "--html", "<main>42 ms</main>",
      "--grounding", JSON.stringify(NOT_APPLICABLE),
      "--no-open",
    ]));
    assert.equal(escaped.ok, false);
    assert.match(escaped.error.message, /requires factual retrieval/);
    assert.ok(existsSync(planPath), "failed render keeps the plan");

    // A grounded matching render succeeds and consumes the plan.
    const widgetResult = parseResult(await runVisualCli([
      "widget", "--title", "latency", "--html", "<main>42 ms</main>",
      "--grounding", JSON.stringify(WEB_GROUNDING),
      "--no-open",
    ]));
    assert.equal(widgetResult.ok, true);
    assert.deepEqual(widgetResult.grounding, WEB_GROUNDING);
    assert.equal(existsSync(planPath), false, "matching render consumes the plan");
    const widgetSaved = await readFile(join(dir, widgetResult.savedFile), "utf8");
    assert.ok(widgetSaved.includes('data-genui-provenance="grounded"'));
    assert.ok(widgetSaved.includes("https://example.com/latency-report"));

    // Same contract on the canvas side.
    const canvasRoute = parseResult(await runVisualCli(["route", "audit repository changes"]));
    assert.equal(canvasRoute.details.target, "show_canvas");
    parseResult(await runVisualCli([
      "widget", "--title", "concept_widget", "--html", "<main>Concept only</main>",
      "--grounding", JSON.stringify({ status: "not_applicable", evidence_scope: "Purely conceptual widget" }),
      "--no-open",
    ]));
    assert.ok(existsSync(planPath), "non-matching render keeps the plan");

    const canvasEscaped = parseError(await runVisualCli([
      "canvas", "--title", "audit",
      "--tsx", "export default function Audit(){ return <main>Finding</main>; }",
      "--grounding", JSON.stringify(NOT_APPLICABLE),
      "--no-open",
    ]));
    assert.equal(canvasEscaped.ok, false);
    assert.match(canvasEscaped.error.message, /evidence\/structure-bearing/);
    assert.ok(existsSync(planPath), "failed render keeps the plan");

    const canvasResult = parseResult(await runVisualCli([
      "canvas", "--title", "audit",
      "--tsx", "export default function Audit(){ return <main>Finding</main>; }",
      "--grounding", JSON.stringify(CODE_GROUNDING),
      "--no-open",
    ]));
    assert.equal(canvasResult.ok, true);
    assert.deepEqual(canvasResult.grounding, CODE_GROUNDING);
    assert.equal(existsSync(planPath), false, "matching render consumes the plan");
    const canvasSaved = await readFile(join(dir, canvasResult.savedFile), "utf8");
    assert.ok(canvasSaved.includes('data-genui-provenance="grounded"'));
    assert.ok(canvasSaved.includes("genui-grounding"));
    assert.ok(canvasSaved.includes("extensions/generative-ui/render-policy.ts#enforceGroundingForPlan"));
    const canvasSource = await readFile(join(dir, canvasResult.sourceFile), "utf8");
    assert.match(canvasSource, /export default function Audit/);

    // Provenance persists in the index for both artifacts.
    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    const savedWidget = index.find((entry) => entry.file === widgetResult.savedFile);
    const savedCanvas = index.find((entry) => entry.file === canvasResult.savedFile);
    assert.deepEqual(savedWidget.grounding, WEB_GROUNDING);
    assert.deepEqual(savedCanvas.grounding, CODE_GROUNDING);
  });
});
