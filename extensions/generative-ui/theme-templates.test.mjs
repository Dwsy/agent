import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

// Load TS sources via bun-compatible dynamic import when available; fallback to
// string contracts from built artifacts / source text for node --test.
const hasBun = typeof Bun !== "undefined";

async function loadRuntime() {
  if (hasBun) {
    const svg = await import(join(root, "svg-styles.ts"));
    const html = await import(join(root, "html-helpers.ts"));
    const templates = await import(join(root, "templates/index.ts"));
    const guidelines = await import(join(root, "guidelines.ts"));
    return { svg, html, templates, guidelines };
  }
  // node --test without TS loader: assert source contracts only
  return null;
}

test("cssVariables emits dual light/dark tokens", async () => {
  const rt = await loadRuntime();
  if (!rt) {
    const src = readFileSync(join(root, "svg-styles.ts"), "utf8");
    assert.match(src, /prefers-color-scheme:\s*dark/);
    assert.match(src, /--color-text-primary:\s*#1a1a1a/);
    assert.match(src, /--color-text-primary:\s*#e0e0e0/);
    assert.match(src, /--chart-tick/);
    assert.match(src, /--chart-grid/);
    return;
  }
  const vars = rt.svg.cssVariables(false);
  assert.match(vars, /prefers-color-scheme:\s*dark/);
  assert.match(vars, /--color-text-primary:\s*#1a1a1a/);
  assert.match(vars, /--color-text-primary:\s*#e0e0e0/);
  assert.match(vars, /--chart-tick/);
  assert.match(vars, /--color-text-info/);
});

test("SVG_STYLES has dual c-* ramps", async () => {
  const rt = await loadRuntime();
  const styles = rt ? rt.svg.SVG_STYLES : readFileSync(join(root, "svg-styles.ts"), "utf8");
  assert.match(styles, /prefers-color-scheme:\s*dark/);
  assert.match(styles, /#E6F1FB/); // light blue fill
  assert.match(styles, /#0C447C/); // dark blue fill
});

test("_themeVars contract includes chart fields", async () => {
  const rt = await loadRuntime();
  const script = rt
    ? rt.html.THEME_VARS_SCRIPT
    : readFileSync(join(root, "html-helpers.ts"), "utf8");
  for (const key of ["textInfo", "textSecondary", "chartTick", "chartGrid", "bg", "bgSecondary"]) {
    assert.match(script, new RegExp(key));
  }
  const shell = rt
    ? rt.html.shellHTML()
    : readFileSync(join(root, "html-helpers.ts"), "utf8");
  assert.match(shell, /_themeVars/);
  assert.match(shell, /color-scheme/);
  assert.doesNotMatch(shell, /background:#1a1a1a/);
});

test("widget UI kit is injected into native and saved documents", async () => {
  const rt = await loadRuntime();
  if (rt) {
    const shell = rt.html.shellHTML();
    const standalone = rt.html.wrapHTML("<button data-tooltip=\"Help\">Help</button>");
    for (const document of [shell, standalone]) {
      assert.match(document, /FloatingUIDOM/);
      assert.match(document, /lucide@1\.17\.0/);
      assert.match(document, /widget-tooltip/);
      assert.match(document, /Content-Security-Policy/);
      assert.match(document, /fonts\.googleapis\.com/);
    }
    return;
  }
  const helper = readFileSync(join(root, "html-helpers.ts"), "utf8");
  const kit = readFileSync(join(root, "widget-ui-kit.ts"), "utf8");
  assert.match(helper, /WIDGET_UI_KIT_RESOURCES/);
  assert.match(kit, /FloatingUIDOM/);
  assert.match(kit, /lucide@1\.17\.0/);
  assert.match(kit, /data-tooltip/);
  assert.match(kit, /default-src 'none'/);
  assert.match(kit, /fonts\.googleapis\.com/);
});

test("wrapHTML injects bridges before widget code", async () => {
  const rt = await loadRuntime();
  if (rt) {
    const html = rt.html.wrapHTML("<script>window.userWidgetCode = true;</script>");
    assert.ok(html.indexOf("window._themeVars") < html.indexOf("window.userWidgetCode"));
    return;
  }
  const source = readFileSync(join(root, "html-helpers.ts"), "utf8");
  assert.match(source, /<body>\$\{themeScript\}\$\{WIDGET_UI_KIT_RESOURCES\}\$\{code\}<\/body>/);
});

test("widget pages expose a native and gallery feedback bridge", async () => {
  const rt = await loadRuntime();
  const source = readFileSync(join(root, "html-helpers.ts"), "utf8");
  const script = rt ? rt.html.WIDGET_EVENTS_SCRIPT : source;
  assert.match(script, /sendWidgetEvent/);
  assert.match(script, /sendPrompt/);
  assert.match(script, /type: 'follow_up'/);
  assert.match(script, /sendAnnotation/);
  assert.match(script, /__generativeUIWidgetEvent/);
  assert.match(script, /postMessage/);

  if (rt) {
    assert.match(rt.html.shellHTML(), /sendAnnotation/);
    assert.match(rt.html.wrapHTML("<button>Review</button>"), /sendAnnotation/);
  }
});

test("gallery renders persisted feedback without HTML injection", () => {
  const src = readFileSync(join(root, "gallery.ts"), "utf8");
  assert.match(src, /data-tab="feedback"/);
  assert.match(src, /appendWidgetEvent/);
  assert.match(src, /renderFeedback/);
  assert.match(src, /comment\.textContent = event\.comment/);
  assert.doesNotMatch(src, /comment\.innerHTML = event\.comment/);
});

test("streaming preview defers widget scripts until message handlers exist", () => {
  const index = readFileSync(join(root, "index.ts"), "utf8");
  const tools = readFileSync(join(root, "tools.ts"), "utf8");
  assert.match(index, /window\._setContent\('[^']*'\);/);
  assert.doesNotMatch(index, /window\._setContent\('[^']*'\); window\._runScripts\(\);/);
  assert.ok(tools.indexOf('win.on("message"') < tools.indexOf("scheduleActivation();"));
  assert.match(tools, /window\._setContent\('[^']*'\); window\._runScripts\(\);/);
});

test("visualization prompts require focused, local, accessible interaction", () => {
  const tools = readFileSync(join(root, "tools.ts"), "utf8");
  const guidelines = readFileSync(join(root, "guidelines.ts"), "utf8");

  assert.match(tools, /materially improves understanding or a decision/);
  assert.match(tools, /never invent filter, search, reset, dashboard, or KPI panels/);
  assert.match(tools, /semantic HTML and native controls/);
  assert.match(tools, /validateWidgetCode\(code, params\.interactive \?\? false\)/);
  assert.match(tools, /MAX_WIDGET_CODE_BYTES/);
  assert.match(tools, /fetch, XMLHttpRequest, or WebSocket/);
  assert.match(tools, /ALLOWED_RESOURCE_HOSTS/);
  assert.match(tools, /fonts\.googleapis\.com/);
  assert.match(tools, /data-tooltip support backed by Floating UI/);
  assert.match(tools, /script\|link\|img\|audio\|video\|source/);
  assert.match(tools, /interactive widgets must send a choice/);
  assert.match(guidelines, /Use the smallest medium that fits: Mermaid/);
  assert.match(guidelines, /Interaction budget/);
  assert.match(guidelines, /support 320px-wide windows/);
  assert.match(guidelines, /animate only meaningful state transitions/);
  assert.match(guidelines, /use verified GeoJSON\/TopoJSON/);
  assert.match(guidelines, /interactive: true/);
  assert.match(guidelines, /Resolve colors from/);
  assert.match(guidelines, /built-in tooltip, icon, CDN, and widget-host contract/);
  assert.match(guidelines, /const WIDGET_RUNTIME/);
  assert.match(guidelines, /Never load Lucide or Floating UI yourself/);
});

test("template catalog filters by module", async () => {
  const rt = await loadRuntime();
  if (!rt) {
    const src = readFileSync(join(root, "templates/index.ts"), "utf8");
    assert.match(src, /flow-mermaid/);
    assert.match(src, /includeBodies/);
    return;
  }
  const catalogOnly = rt.templates.getTemplatesSection(["diagram"]);
  assert.match(catalogOnly, /Ready-made fragments/);
  assert.match(catalogOnly, /flow-mermaid/);
  assert.match(catalogOnly, /catalog only/i);
  assert.doesNotMatch(catalogOnly, /```html[\s\S]*flowchart TD/);

  const withBody = rt.templates.getTemplatesSection(["diagram"], {
    includeBodies: ["flow-mermaid"],
  });
  assert.match(withBody, /```html/);
  assert.match(withBody, /flowchart TD/);
  assert.doesNotMatch(withBody, /id="modChart"/); // chart not in diagram expand

  const chart = rt.templates.getTemplatesSection(["chart"], {
    includeBodies: ["metric-chart"],
  });
  assert.match(chart, /modChart/);
  assert.doesNotMatch(chart, /flow-steps/);
});

test("getGuidelines catalog-only by default; expands templates on request", async () => {
  const rt = await loadRuntime();
  if (!rt) return;
  const light = rt.guidelines.getGuidelines(["diagram"]);
  assert.match(light, /Canonical skeleton/);
  assert.match(light, /flow-mermaid/);
  assert.match(light, /No template bodies expanded|catalog only/i);
  // Full fragment body (unique to templates/flow-mermaid.html.frag) must stay out by default.
  assert.doesNotMatch(light, /flow-svg-/);

  const heavy = rt.guidelines.getGuidelines(["diagram"], {
    templates: ["flow-mermaid"],
  });
  assert.match(heavy, /flow-svg-/);
  assert.match(heavy, /getPropertyValue/);
  assert.ok(heavy.length > light.length);
});

test("template files exist and stay hex-light for UI chrome", async () => {
  const rt = await loadRuntime();
  const ids = rt
    ? rt.templates.TEMPLATE_IDS
    : ["flow-steps", "flow-mermaid", "architecture-cards", "metric-chart", "compare-cards", "contact-card"];
  for (const id of ids) {
    const body = rt
      ? rt.templates.loadTemplate(id)
      : readFileSync(join(root, "templates", id + ".html.frag"), "utf8");
    assert.ok(body.length > 40, id);
    if (id !== "flow-mermaid" && id !== "metric-chart") {
      assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}/, id + " should not hardcode hex chrome");
    }
  }
});


test("_runScripts preserves script attributes for module/onload", () => {
  const src = readFileSync(join(root, "html-helpers.ts"), "utf8");
  assert.match(src, /window\._runScripts\s*=\s*function/);
  assert.match(src, /old\.attributes/);
  assert.match(src, /setAttribute\(a\.name,\s*a\.value\)/);
  assert.match(src, /type=module/);
});

test("flow-mermaid template uses UMD + onload, not ESM module", () => {
  const body = readFileSync(join(root, "templates", "flow-mermaid.html.frag"), "utf8");
  assert.match(body, /mermaid\.min\.js/);
  assert.match(body, /onload="initMermaid\(\)"/);
  assert.match(body, /window\.mermaid/);
  assert.match(body, /setInterval/);
  assert.doesNotMatch(body, /type="module"/);
  assert.doesNotMatch(body, /import mermaid from/);
  assert.match(body, /_themeVars|getPropertyValue/);
});
