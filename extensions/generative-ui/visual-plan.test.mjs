import test from "node:test";
import assert from "node:assert/strict";
import { planVisualGuidance } from "./visual-plan.ts";


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
