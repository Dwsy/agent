import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerTools } from "./tools.ts";

function fakeWindow(sent) {
  const handlers = new Map();
  return {
    send(code) { sent.push(String(code)); },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      if (event === "ready") handler({});
    },
    close() {},
  };
}

function registerHarness(sent) {
  const definitions = new Map();
  const pi = {
    registerTool(definition) { definitions.set(definition.name, definition); },
  };
  const ctx = { streaming: null, activeWindows: [], lastVisualPlan: null };
  registerTools(pi, ctx, {
    openWindow(_html, _options) { return fakeWindow(sent); },
  });
  return { definitions, ctx };
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
    label: "tools.ts registerTools",
    kind: "code",
    locator: "extensions/generative-ui/tools.ts#registerTools",
    as_of: "2026-08-19",
  }],
};

test("registered render tools enforce and persist route-aware provenance end to end", async () => {
  const previousDir = process.env.GENERATIVE_UI_WIDGETS_DIR;
  const dir = await mkdtemp(join(tmpdir(), "generative-ui-render-boundary-"));
  process.env.GENERATIVE_UI_WIDGETS_DIR = dir;
  const sent = [];

  try {
    const { definitions, ctx } = registerHarness(sent);
    const readMe = definitions.get("visualize_read_me");
    const widget = definitions.get("show_widget");
    const canvas = definitions.get("show_canvas");
    assert.ok(readMe && widget && canvas);

    await assert.rejects(
      () => widget.execute("widget-missing-grounding", { title: "missing", widget_code: "<main>facts</main>" }),
      /grounding is required/,
    );

    const widgetPlan = await readMe.execute("route-widget", { request: "chart current API latency" });
    assert.equal(widgetPlan.details.target, "show_widget");
    assert.equal(widgetPlan.details.research, "required");
    await canvas.execute("unrelated-canvas", {
      title: "concept_canvas",
      canvas_code: "export default function Concept(){ return <main>Concept only</main>; }",
      grounding: { status: "not_applicable", evidence_scope: "Purely conceptual canvas" },
    });
    assert.equal(ctx.lastVisualPlan?.target, "show_widget");
    await assert.rejects(
      () => widget.execute("widget-route-escape", {
        title: "latency",
        widget_code: "<main>42 ms</main>",
        grounding: { status: "not_applicable", evidence_scope: "No evidence" },
      }),
      /requires factual retrieval/,
    );
    assert.equal(ctx.lastVisualPlan?.target, "show_widget");

    const widgetResult = await widget.execute("widget-grounded", {
      title: "latency",
      widget_code: "<main>42 ms</main>",
      grounding: WEB_GROUNDING,
    });
    assert.equal(ctx.lastVisualPlan, null);
    assert.deepEqual(widgetResult.details.grounding, WEB_GROUNDING);
    assert.ok(sent.at(-1).includes("data-genui-provenance"));
    assert.ok(sent.at(-1).includes("https://example.com/latency-report"));
    const widgetSaved = await readFile(widgetResult.details.fullPath, "utf8");
    assert.ok(widgetSaved.includes('data-genui-provenance="grounded"'));
    assert.ok(widgetSaved.includes("https://example.com/latency-report"));

    const canvasPlan = await readMe.execute("route-canvas", { request: "audit repository changes" });
    assert.equal(canvasPlan.details.target, "show_canvas");
    await widget.execute("unrelated-widget", {
      title: "concept_widget",
      widget_code: "<main>Concept only</main>",
      grounding: { status: "not_applicable", evidence_scope: "Purely conceptual widget" },
    });
    assert.equal(ctx.lastVisualPlan?.target, "show_canvas");
    await assert.rejects(
      () => canvas.execute("canvas-route-escape", {
        title: "audit",
        canvas_code: "export default function Audit(){ return <main>Finding</main>; }",
        grounding: { status: "not_applicable", evidence_scope: "No evidence" },
      }),
      /evidence\/structure-bearing/,
    );
    assert.equal(ctx.lastVisualPlan?.target, "show_canvas");

    const canvasResult = await canvas.execute("canvas-grounded", {
      title: "audit",
      canvas_code: "export default function Audit(){ return <main>Finding</main>; }",
      grounding: CODE_GROUNDING,
    });
    assert.equal(ctx.lastVisualPlan, null);
    assert.deepEqual(canvasResult.details.grounding, CODE_GROUNDING);
    assert.ok(sent.at(-1).includes("genui-grounding"));
    assert.ok(sent.at(-1).includes("extensions/generative-ui/tools.ts#registerTools"));
    const canvasSaved = await readFile(canvasResult.details.fullPath, "utf8");
    assert.ok(canvasSaved.includes('data-genui-provenance="grounded"'));
    assert.ok(canvasSaved.includes("extensions/generative-ui/tools.ts#registerTools"));

    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    const savedWidget = index.find((entry) => entry.file === widgetResult.details.savedFile);
    const savedCanvas = index.find((entry) => entry.file === canvasResult.details.savedFile);
    assert.deepEqual(savedWidget.grounding, WEB_GROUNDING);
    assert.deepEqual(savedCanvas.grounding, CODE_GROUNDING);
  } finally {
    if (previousDir === undefined) delete process.env.GENERATIVE_UI_WIDGETS_DIR;
    else process.env.GENERATIVE_UI_WIDGETS_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  }
});
