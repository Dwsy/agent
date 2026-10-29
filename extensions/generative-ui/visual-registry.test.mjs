import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadVisualRouteRegistry, matchRegisteredRoute, skillRoots } from "./visual-registry.ts";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "visual-routes-"));
}

function writeManifest(root, skill, manifest) {
  const dir = join(root, skill);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "visual-routes.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
}

function validRoute(overrides = {}) {
  return {
    id: "gantt-timeline",
    title: "Gantt timeline",
    patterns: ["gantt"],
    target: "show_widget",
    modules: ["diagram"],
    templates: ["timeline-roadmap"],
    style: "workflow",
    reason: "Phased work is easiest to scan as bars over time.",
    contentPlan: ["Phase bars", "Milestone markers"],
    ...overrides,
  };
}

test("loads manifest routes in scan-root then directory-name order with skill dir as default skillRef", () => {
  const rootA = makeRoot();
  const rootB = makeRoot();
  try {
    writeManifest(rootA, "zeta-skill", { routes: [validRoute({ id: "zeta-route" })] });
    writeManifest(rootA, "alpha-skill", { routes: [validRoute({ id: "alpha-route" })] });
    writeManifest(rootB, "mid-skill", { routes: [validRoute({ id: "mid-route" })] });

    const registry = loadVisualRouteRegistry([rootA, rootB]);
    assert.deepEqual(registry.warnings, []);
    assert.deepEqual(registry.routes.map((route) => route.id), ["alpha-route", "zeta-route", "mid-route"]);
    assert.deepEqual(registry.routes.map((route) => route.skillRef), ["alpha-skill", "zeta-skill", "mid-skill"]);
    assert.equal(registry.routes[0].title, "Gantt timeline");
    assert.equal(registry.routes[0].target, "show_widget");
    assert.deepEqual(registry.routes[0].modules, ["diagram"]);
    assert.deepEqual(registry.routes[0].templates, ["timeline-roadmap"]);
    assert.equal(registry.routes[0].style, "workflow");
    assert.equal(registry.routes[0].reason, "Phased work is easiest to scan as bars over time.");
    assert.deepEqual(registry.routes[0].contentPlan, ["Phase bars", "Milestone markers"]);
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});

test("manifest skillRef overrides the skill directory name", () => {
  const root = makeRoot();
  try {
    writeManifest(root, "plain-dir-name", { routes: [validRoute({ skillRef: "explicit-skill-ref" })] });
    const registry = loadVisualRouteRegistry([root]);
    assert.deepEqual(registry.warnings, []);
    assert.equal(registry.routes[0].skillRef, "explicit-skill-ref");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("patterns match case-insensitive substrings and /regex/ forms", () => {
  const root = makeRoot();
  try {
    writeManifest(root, "planning-skill", {
      routes: [validRoute({ patterns: ["gantt", "甘特", "/\\broadmap\\b/"] })],
    });
    const { routes } = loadVisualRouteRegistry([root]);
    assert.ok(matchRegisteredRoute("Draw a Gantt chart", routes));
    assert.ok(matchRegisteredRoute("画一个甘特图", routes));
    assert.ok(matchRegisteredRoute("the 2026 Roadmap please", routes));
    assert.equal(matchRegisteredRoute("roadmappy quarterly plan", routes), null);
    assert.equal(matchRegisteredRoute("quarterly plan", routes), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("first matching route in load order wins", () => {
  const root = makeRoot();
  try {
    writeManifest(root, "planning-skill", {
      routes: [validRoute({ id: "first-route", patterns: ["roadmap"] }), validRoute({ id: "second-route", patterns: ["roadmap"] })],
    });
    const registry = loadVisualRouteRegistry([root]);
    assert.equal(matchRegisteredRoute("product roadmap", registry.routes)?.id, "first-route");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bad manifests are skipped with warnings while good routes still load", () => {
  const root = makeRoot();
  try {
    writeManifest(root, "a-broken-json", "{ not json");
    writeManifest(root, "b-broken-entry", { routes: ["nope", validRoute({ id: "kept-route" })] });
    writeManifest(root, "c-missing-field", { routes: [validRoute({ id: "missing-id", title: undefined })] });
    writeManifest(root, "d-bad-target", { routes: [validRoute({ id: "bad-target", target: "show_diagram" })] });
    writeManifest(root, "e-bad-pattern", { routes: [validRoute({ id: "bad-pattern", patterns: ["/[a-/"] })] });
    writeManifest(root, "f-no-routes-array", { routes: "nope" });

    const registry = loadVisualRouteRegistry([root]);
    assert.deepEqual(registry.routes.map((route) => route.id), ["kept-route"]);
    assert.equal(registry.warnings.length, 6);
    assert.match(registry.warnings[0], /a-broken-json.*invalid JSON/);
    assert.ok(registry.warnings.some((warning) => /b-broken-entry.*routes\[0\].*expected an object/.test(warning)));
    assert.ok(registry.warnings.some((warning) => /c-missing-field.*"title"/.test(warning)));
    assert.ok(registry.warnings.some((warning) => /d-bad-target.*"target"/.test(warning)));
    assert.ok(registry.warnings.some((warning) => /e-bad-pattern.*not a valid regex/.test(warning)));
    assert.ok(registry.warnings.some((warning) => /f-no-routes-array.*"routes" array/.test(warning)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("VISUAL_SKILLS_ROOTS overrides the default scan roots", () => {
  const rootA = makeRoot();
  const rootB = makeRoot();
  const previous = process.env.VISUAL_SKILLS_ROOTS;
  try {
    writeManifest(rootA, "env-skill-a", { routes: [validRoute({ id: "env-route-a" })] });
    writeManifest(rootB, "env-skill-b", { routes: [validRoute({ id: "env-route-b" })] });
    process.env.VISUAL_SKILLS_ROOTS = `${rootA}:${rootB}`;
    assert.deepEqual(skillRoots(), [rootA, rootB]);
    const registry = loadVisualRouteRegistry();
    assert.deepEqual(registry.routes.map((route) => route.id), ["env-route-a", "env-route-b"]);
  } finally {
    if (previous === undefined) delete process.env.VISUAL_SKILLS_ROOTS;
    else process.env.VISUAL_SKILLS_ROOTS = previous;
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});

test("missing scan roots are ignored without warnings", () => {
  const registry = loadVisualRouteRegistry([join(tmpdir(), "visual-routes-missing-root")]);
  assert.deepEqual(registry, { routes: [], warnings: [] });
});
