import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatVisualRoute, routeVisualRequest } from "./routing.ts";
import { loadVisualRouteRegistry } from "./visual-registry.ts";

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

const cases = [
  ["draw the authentication architecture", "architecture-map", "show_widget", "architecture-cards"],
  ["画一个登录流程图，有失败分支", "process-network", "show_widget", "flow-mermaid"],
  ["show the onboarding steps", "process-linear", "show_widget", "flow-steps"],
  ["产品未来三个阶段的路线图", "timeline-roadmap", "show_widget", "timeline-roadmap"],
  ["compare the pro and team plans", "option-comparison", "show_widget", "compare-cards"],
  ["show this customer record", "record-detail", "show_widget", "contact-card"],
  ["plot weekly latency trend", "single-chart", "show_widget", "metric-chart"],
  ["dashboard with traffic, latency and error trends", "multi-chart-analysis", "show_canvas", "canvas-charts"],
  ["security audit findings and remediation evidence", "evidence-brief", "show_canvas", "canvas-brief"],
  ["review this patch and changed files", "code-diff-review", "show_canvas", "canvas-diff"],
  ["create a persistent deployment settings form", "form-state", "show_canvas", "canvas-form-state"],
  ["make a release checklist with task status", "task-workflow", "show_canvas", "canvas-todo"],
  ["design a checkout screen mockup", "ui-mockup", "show_widget", null],
  ["make an interactive calculator explainer", "interactive-explainer", "show_widget", null],
  ["draw an illustration of the deployment lifecycle", "illustration", "show_widget", null],
  ["只要文字回答，不要图", "text-first", "markdown", null],
];

test("routes common user intents to medium, representation, and one skeleton", () => {
  for (const [request, id, target, template] of cases) {
    const route = routeVisualRequest(request);
    assert.equal(route.id, id, request);
    assert.equal(route.target, target, request);
    assert.ok(route.contentPlan.length >= 2, request);
    assert.ok(route.templates.length <= 1, request + " should expand at most one skeleton");
    assert.equal(route.templates[0] ?? null, template, request);
  }
});

test("explicit representation wins over architecture subject words", () => {
  assert.equal(routeVisualRequest("compare two system architectures").id, "option-comparison");
  assert.equal(routeVisualRequest("architecture migration roadmap").id, "timeline-roadmap");
  assert.equal(routeVisualRequest("workflow between backend services").id, "process-linear");
});

test("large architecture switches content plan to overview plus grouped detail", () => {
  const route = routeVisualRequest("visualize a complex full system architecture with dozens of services");
  assert.equal(route.id, "architecture-map");
  assert.match(route.reason, /small topology overview plus grouped detail/i);
  assert.ok(route.contentPlan.some((item) => /Grouped component detail/i.test(item)));
});

test("current or explicit research requests require retrieval", () => {
  for (const request of [
    "chart the latest market prices",
    "搜索并比较当前三个方案的价格",
    "verify sources and visualize the recent release",
  ]) {
    const route = routeVisualRequest(request);
    assert.equal(route.research, "required", request);
    assert.match(route.researchInstruction, /Retrieve current\/authoritative facts/);
  }
});

test("non-current factual visuals retrieve only when evidence is missing", () => {
  const route = routeVisualRequest("visualize our security audit findings");
  assert.equal(route.research, "if_missing");
  assert.match(route.researchInstruction, /never invent filler data/i);
});

test("generic visual request falls back to content-rich evidence brief", () => {
  const route = routeVisualRequest("make this visual and easy to understand");
  assert.equal(route.id, "visual-brief");
  assert.equal(route.target, "show_canvas");
  assert.deepEqual(route.templates, ["canvas-brief"]);
});

test("unknown non-visual request stays text-first", () => {
  const route = routeVisualRequest("explain dependency injection");
  assert.equal(route.id, "text-first");
  assert.equal(route.target, "markdown");
});

test("formatted route includes unified UIUX and grounding contracts", () => {
  const text = formatVisualRoute(routeVisualRequest("visualize our incident review"));
  assert.match(text, /Unified UI\/UX contract/);
  assert.match(text, /24px title, 18px section, 16px subheading, 14px body, 12px metadata/);
  assert.match(text, /4\/8\/12\/16\/24\/32 rhythm/);
  assert.match(text, /context → one dominant artifact → evidence\/detail → source\/recency/);
  assert.match(text, /Replace them with supplied or retrieved evidence/);
  assert.match(text, /Minimum content plan/);
});

test("registered skill routes override the built-in chain and fill fields from the manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "planning-skill", { routes: [ganttRoute()] });
    const registry = loadVisualRouteRegistry([root]);
    const route = routeVisualRequest("product roadmap for next year", registry);
    assert.equal(route.id, "gantt-timeline");
    assert.equal(route.title, "Gantt timeline");
    assert.equal(route.target, "show_widget");
    assert.deepEqual(route.modules, ["diagram"]);
    assert.deepEqual(route.templates, ["timeline-roadmap"]);
    assert.equal(route.style, "workflow");
    assert.equal(route.reason, "Phased work is easiest to scan as bars over time.");
    assert.deepEqual(route.contentPlan, ["Phase bars", "Milestone markers"]);
    assert.equal(route.skillRef, "planning-skill");
    assert.equal(route.research, "if_missing");
    assert.match(route.researchInstruction, /never invent filler data/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registered routes still follow the research policy", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "planning-skill", { routes: [ganttRoute()] });
    const registry = loadVisualRouteRegistry([root]);
    const route = routeVisualRequest("gantt chart of the latest market prices", registry);
    assert.equal(route.id, "gantt-timeline");
    assert.equal(route.research, "required");
    assert.match(route.researchInstruction, /Retrieve current\/authoritative facts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built-in routes keep the chain behavior and carry no skillRef", () => {
  const registry = loadVisualRouteRegistry([]);
  assert.deepEqual(registry, { routes: [], warnings: [] });
  const route = routeVisualRequest("compare the pro and team plans", registry);
  assert.equal(route.id, "option-comparison");
  assert.equal(route.skillRef, undefined);
  assert.equal(routeVisualRequest("explain dependency injection", registry).id, "text-first");
});

test("malformed skill manifests never break built-in routing", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "broken-skill", "{ not json");
    writeManifest(root, "invalid-skill", { routes: [ganttRoute({ target: "show_diagram" })] });
    const registry = loadVisualRouteRegistry([root]);
    assert.deepEqual(registry.routes, []);
    assert.equal(registry.warnings.length, 2);
    const route = routeVisualRequest("product roadmap for next year", registry);
    assert.equal(route.id, "timeline-roadmap");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("formatVisualRoute surfaces the skill ref only for registered routes", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-routes-"));
  try {
    writeManifest(root, "planning-skill", { routes: [ganttRoute()] });
    const registry = loadVisualRouteRegistry([root]);
    const registered = formatVisualRoute(routeVisualRequest("product roadmap for next year", registry));
    assert.match(registered, /Skill ref: `planning-skill`/);
    const builtIn = formatVisualRoute(routeVisualRequest("compare the pro and team plans", registry));
    assert.doesNotMatch(builtIn, /Skill ref/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
