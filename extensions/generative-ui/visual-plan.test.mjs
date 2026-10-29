import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planVisualGuidance } from "./visual-plan.ts";

function writeManifest(root, skill, manifest) {
  const dir = join(root, skill);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "visual-routes.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
}

function ganttRoute(overrides = {}) {
  return {
    id: "gantt-timeline",
    title: "Gantt timeline",
    patterns: ["gantt", "甘特", "/\\broadmap\\b/"],
    target: "show_widget",
    modules: ["diagram"],
    templates: ["timeline-roadmap"],
    style: "workflow",
    reason: "Phased work is easiest to scan as bars over time.",
    contentPlan: ["Phase bars", "Milestone markers"],
    skillRef: "planning-skill",
    ...overrides,
  };
}

function withSkillsRoot(root, fn) {
  const previous = process.env.VISUAL_SKILLS_ROOTS;
  process.env.VISUAL_SKILLS_ROOTS = root;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.VISUAL_SKILLS_ROOTS;
    else process.env.VISUAL_SKILLS_ROOTS = previous;
  }
}


test("request-first plan auto-routes and expands one matching skeleton", () => {
  const plan = planVisualGuidance({ request: "visualize our security audit findings" });
  assert.equal(plan.details.route, "evidence-brief");
  assert.equal(plan.details.target, "show_canvas");
  assert.equal(plan.details.style, "editorial");
  assert.equal(plan.details.research, "if_missing");
  assert.deepEqual(plan.details.modules, ["canvas"]);
  assert.deepEqual(plan.details.templates, ["canvas-brief"]);
  assert.match(plan.content, /## Auto route/);
  assert.match(plan.content, /Canvas evidence brief/);
  assert.match(plan.content, /Checkout change — evidence brief/);
  assert.doesNotMatch(plan.content, /Traffic and reliability/);
});

test("current data plan instructs retrieval before rendering", () => {
  const plan = planVisualGuidance({ request: "chart the latest market prices" });
  assert.equal(plan.details.research, "required");
  assert.match(plan.content, /Retrieve current\/authoritative facts/);
  assert.match(plan.content, /never substitute template\/demo values/i);
});

test("text-first plan does not load visual guidance or skeleton bodies", () => {
  const plan = planVisualGuidance({ request: "just answer in text, no visual" });
  assert.equal(plan.details.target, "markdown");
  assert.deepEqual(plan.details.modules, []);
  assert.deepEqual(plan.details.templates, []);
  assert.match(plan.content, /Text-first answer/);
  assert.doesNotMatch(plan.content, /Ready-made fragments/);
});

test("manual modules and templates remain expert overrides", () => {
  const plan = planVisualGuidance({
    request: "compare two plans",
    modules: ["canvas"],
    templates: ["canvas-dashboard"],
  });
  assert.equal(plan.details.target, "show_canvas");
  assert.deepEqual(plan.details.modules, ["canvas"]);
  assert.deepEqual(plan.details.templates, ["canvas-dashboard"]);
  assert.match(plan.content, /Service throughput/);
  assert.doesNotMatch(plan.content, /Side-by-side comparison/);
});

test("manual modules without template suppress auto skeleton expansion", () => {
  const plan = planVisualGuidance({ request: "compare two plans", modules: ["mockup"] });
  assert.equal(plan.details.target, "show_widget");
  assert.deepEqual(plan.details.templates, []);
  assert.match(plan.content, /Target: `show_widget`/);
  assert.doesNotMatch(plan.content, /Plan A/);
});

test("manual template infers its modules and target without a separate module hint", () => {
  const plan = planVisualGuidance({ request: "compare two plans", templates: ["canvas-dashboard"] });
  assert.equal(plan.details.target, "show_canvas");
  assert.deepEqual(plan.details.modules, ["canvas"]);
  assert.match(plan.content, /Target: `show_canvas`/);
  assert.match(plan.content, /Service throughput/);
});

test("registered skill routes surface skillRefs and fill the plan from the manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "planning-skill", { routes: [ganttRoute()] });
    withSkillsRoot(root, () => {
      const plan = planVisualGuidance({ request: "product roadmap for next year" });
      assert.equal(plan.details.route, "gantt-timeline");
      assert.deepEqual(plan.details.skillRefs, ["planning-skill"]);
      assert.equal(plan.details.target, "show_widget");
      assert.equal(plan.details.style, "workflow");
      assert.deepEqual(plan.details.modules, ["diagram"]);
      assert.deepEqual(plan.details.templates, ["timeline-roadmap"]);
      assert.match(plan.content, /Skill ref: `planning-skill`/);
      assert.match(plan.content, /Gantt timeline/);
      assert.match(plan.content, /Phase bars/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manual overrides win on modules/templates but keep the registered route identity", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "planning-skill", { routes: [ganttRoute()] });
    withSkillsRoot(root, () => {
      const plan = planVisualGuidance({ request: "product roadmap for next year", modules: ["canvas"] });
      assert.equal(plan.details.route, "gantt-timeline");
      assert.deepEqual(plan.details.skillRefs, ["planning-skill"]);
      assert.equal(plan.details.target, "show_canvas");
      assert.deepEqual(plan.details.modules, ["canvas"]);
      assert.deepEqual(plan.details.templates, []);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bad skill manifests surface warnings without breaking the plan", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "broken-skill", "{ not json");
    withSkillsRoot(root, () => {
      const plan = planVisualGuidance({ request: "compare the pro and team plans" });
      assert.equal(plan.details.route, "option-comparison");
      assert.deepEqual(plan.details.skillRefs, []);
      assert.equal(plan.details.warnings.length, 1);
      assert.match(plan.details.warnings[0], /broken-skill.*invalid JSON/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built-in plans and manual-only plans expose no skill refs or warnings", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    withSkillsRoot(root, () => {
      const auto = planVisualGuidance({ request: "visualize our security audit findings" });
      assert.equal(auto.details.route, "evidence-brief");
      assert.deepEqual(auto.details.skillRefs, []);
      assert.equal(auto.details.warnings, undefined);
      const manual = planVisualGuidance({ modules: ["canvas"] });
      assert.deepEqual(manual.details.skillRefs, []);
      assert.equal(manual.details.warnings, undefined);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
