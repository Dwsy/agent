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

test("gallery hosts Canvas state/theme without weakening iframe sandbox", () => {
  const src = readFileSync(join(root, "gallery.ts"), "utf8");
  assert.match(src, /iframe\.setAttribute\("sandbox", "allow-scripts"\)/);
  assert.doesNotMatch(src, /sandbox", "allow-scripts allow-same-origin/);
  assert.match(src, /__generativeUICanvasHost/);
  assert.match(src, /handleCanvasHostMessage/);
  assert.match(src, /w\.kind !== "canvas"/);
  assert.match(src, /CANVAS_STATE_PREFIX/);
  assert.match(src, /broadcastCanvasTheme\(\)/);
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
  const widgetValidation = readFileSync(join(root, "widget-validation.ts"), "utf8");
  const grounding = readFileSync(join(root, "grounding.ts"), "utf8");
  const guidelines = readFileSync(join(root, "guidelines.ts"), "utf8");

  assert.match(tools, /materially improves understanding or a decision/);
  assert.match(tools, /never invent filter, search, reset, dashboard, or KPI panels/);
  assert.match(tools, /semantic HTML and native controls/);
  assert.match(tools, /Do not choose Canvas merely because data is present/);
  assert.match(tools, /request set to the user's actual goal/);
  assert.match(tools, /Do not ask the user to choose Canvas vs Widget/);
  assert.match(tools, /Respect the returned retrieval policy/);
  assert.match(tools, /Never copy demo values from a skeleton/);
  assert.match(tools, /The first render must be useful/);
  assert.match(tools, /Keep presentation-only interactions local/);
  assert.match(tools, /validateWidgetCode\(code, params\.interactive \?\? false\)/);
  assert.match(tools, /grounding: GROUNDING_SCHEMA/);
  assert.match(tools, /validateGroundingDeclaration\(params\.grounding\)/);
  assert.match(tools, /groundingFooterHTML\(grounding\)/);
  assert.match(widgetValidation, /MAX_WIDGET_CODE_BYTES/);
  assert.match(widgetValidation, /fetch, XMLHttpRequest, or WebSocket/);
  assert.match(widgetValidation, /ALLOWED_RESOURCE_HOSTS/);
  assert.match(widgetValidation, /fonts\.googleapis\.com/);
  assert.match(grounding, /grounded visual renders require at least one provenance source/);
  assert.match(grounding, /data-genui-provenance="grounded"/);
  assert.match(tools, /data-tooltip support backed by Floating UI/);
  assert.match(widgetValidation, /script\|link\|img\|audio\|video\|source/);
  assert.match(widgetValidation, /interactive widgets must send a choice/);
  assert.match(guidelines, /Use the smallest medium that fits: Mermaid/);
  assert.match(guidelines, /Interaction budget/);
  assert.match(guidelines, /support 320px-wide windows/);
  assert.match(guidelines, /animate only meaningful state transitions/);
  assert.match(guidelines, /use verified GeoJSON\/TopoJSON/);
  assert.match(guidelines, /interactive: true/);
  assert.match(guidelines, /Resolve colors from/);
  assert.match(guidelines, /built-in tooltip, icon, CDN, and widget-host contract/);
  assert.match(guidelines, /smallest composition that materially improves/);
  assert.match(guidelines, /self-contained analytical artifact/);
  assert.match(guidelines, /h1 = 24px\/30px/);
  assert.match(guidelines, /4\/8\/12\/16\/24\/32px spacing rhythm/);
  assert.match(guidelines, /remain readable down to roughly 320px/);
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

test("canvas template catalog is progressive and TSX-aware", async () => {
  const rt = await loadRuntime();
  if (!rt) {
    const src = readFileSync(join(root, "templates/index.ts"), "utf8");
    assert.match(src, /canvas-dashboard/);
    assert.match(src, /canvas-brief/);
    assert.match(src, /format: "tsx"/);
    assert.match(src, /target: "show_canvas"/);
    return;
  }

  const catalog = rt.templates.getTemplatesSection(["canvas"]);
  assert.match(catalog, /canvas-brief/);
  assert.match(catalog, /canvas-dashboard/);
  assert.match(catalog, /canvas-charts/);
  assert.match(catalog, /show_canvas/);
  assert.match(catalog, /tsx/);
  assert.doesNotMatch(catalog, /Service throughput/);

  const expanded = rt.templates.getTemplatesSection(["canvas"], {
    includeBodies: ["canvas-dashboard"],
  });
  assert.match(expanded, /```tsx/);
  assert.match(expanded, /Service throughput/);
  assert.doesNotMatch(expanded, /Traffic and reliability/);
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

test("canvas guidelines stay catalog-first and expand one skeleton on demand", async () => {
  const rt = await loadRuntime();
  if (!rt) return;

  const light = rt.guidelines.getGuidelines(["canvas"]);
  assert.match(light, /Cursor-compatible SDK catalog/);
  assert.match(light, /canvas-dashboard/);
  assert.doesNotMatch(light, /Service throughput/);
  assert.doesNotMatch(light, /Traffic and reliability/);

  const heavy = rt.guidelines.getGuidelines(["canvas"], {
    templates: ["canvas-dashboard"],
  });
  assert.match(heavy, /```tsx/);
  assert.match(heavy, /Service throughput/);
  assert.doesNotMatch(heavy, /Traffic and reliability/);
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
