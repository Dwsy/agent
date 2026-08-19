/** Canvas transpile pipeline tests (bun — imports ./canvas.ts directly). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileCanvas, validateCanvasCode, canvasDocumentHTML, canvasShellHTML } from "./canvas.ts";
import { loadTemplate } from "./templates/index.ts";

const VALID_TSX = `
import React, { useState } from "react";
import { useHostTheme, sendToAgent } from "@gen-ui/canvas";

interface Row { name: string; value: number }
const ROWS: Row[] = [{ name: "a", value: 1 }];

export default function Report() {
  const theme = useHostTheme();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ color: theme.text.primary }}>
      {ROWS.map((r) => (
        <button key={r.name} onClick={() => { setSelected(r.name); sendToAgent({ pick: r.name }); }}>
          {r.name}: {r.value}
        </button>
      ))}
      {selected && <p>picked {selected}</p>}
    </div>
  );
}
`;

test("valid TSX compiles to a self-contained IIFE", async () => {
  const js = await transpileCanvas(VALID_TSX);
  assert.ok(js.length > 100);
  // Types stripped, JSX lowered to createElement
  assert.ok(!js.includes("interface Row"));
  assert.ok(!js.includes("<div"));
  assert.match(js, /createElement/);
  // Mount + error boundary + shims present
  assert.match(js, /canvas-root/);
  assert.match(js, /CanvasErrorBoundary/);
  assert.match(js, /window\.React/);
  assert.match(js, /window\.ReactDOM/);
  // SDK inlined
  assert.match(js, /useHostTheme/);
});

test("disallowed imports fail with a readable diagnostic", async () => {
  // Note: the import must actually be used — esbuild's TS loader elides
  // unused imports (they might be type-only), which is dead code anyway.
  await assert.rejects(
    () => transpileCanvas(`import _ from "lodash";\nexport default () => <div>{_.chunk([1], 1)}</div>;`),
    (err) => {
      assert.match(err.message, /Canvas compile failed/);
      assert.match(err.message, /"lodash" is not allowed/);
      assert.match(err.message, /Allowed imports: react/);
      return true;
    },
  );
});

test("syntax errors carry canvas_code line locations", async () => {
  await assert.rejects(
    () => transpileCanvas(`export default function Broken() {\n  return <div>;\n}`),
    (err) => {
      assert.match(err.message, /Canvas compile failed/);
      assert.match(err.message, /line \d+/);
      return true;
    },
  );
});

test("validateCanvasCode enforces contract", () => {
  assert.throws(() => validateCanvasCode(`const x = 1;`), /default-export/);
  assert.throws(
    () => validateCanvasCode(`export default () => { fetch("https://x.dev"); return null; }`),
    /cannot use fetch/,
  );
  assert.throws(
    () => validateCanvasCode(`export default () => <img src="https://evil.example/x.png" />;`),
    /approved CDN host/,
  );
  // interactive requires an agent bridge call
  assert.throws(() => validateCanvasCode(`export default () => null;`, true), /sendToAgent/);
  assert.doesNotThrow(() => validateCanvasCode(VALID_TSX, true));
});

test("saved canvas document embeds vendored React runtime and compiled bundle", async () => {
  const js = await transpileCanvas(VALID_TSX);
  const doc = canvasDocumentHTML(js, "canvas_test_id");
  // React UMD is inlined, not loaded from a CDN
  assert.ok(!doc.includes("unpkg.com/react"));
  assert.match(doc, /react\.production\.min\.js/); // @license banner of the vendored UMD
  assert.match(doc, /react-dom\.production\.min\.js/);
  assert.ok(doc.includes('version="18.3.1"'));
  assert.match(doc, /id="canvas-root"/);
  assert.ok(doc.includes("Content-Security-Policy"));
  assert.ok(doc.includes(js.slice(0, 60)));
  assert.match(doc, /window\.__canvasId = "canvas_test_id"/);
  assert.match(doc, /__generativeUICanvasHost/);
  assert.match(doc, /window\.__canvasHostBridge/);
  assert.match(doc, /gen-ui-canvas-theme-change/);

  const shell = canvasShellHTML();
  assert.match(shell, /id="canvas-root"/);
  assert.match(shell, /_themeVars/);
});

test("SDK base components (Card, Stat, DataTable) transpile into the bundle", async () => {
  const js = await transpileCanvas(`
import React from "react";
import { Card, Stat, DataTable } from "@gen-ui/canvas";

export default function Dashboard() {
  return (
    <Card title="Throughput">
      <Stat label="p95 latency" value="212 ms" hint="last 24h" />
      <DataTable
        columns={[
          { key: "name", label: "Route" },
          { key: "count", label: "Requests", align: "right" },
        ]}
        rows={[{ name: "/api/health", count: 1201 }]}
      />
    </Card>
  );
}
`);
  assert.match(js, /--color-border-tertiary/);
  assert.match(js, /fontVariantNumeric/);
  assert.match(js, /tabular-nums/);
  // Component implementations are inlined from the SDK
  assert.match(js, /function Card\b/);
  assert.match(js, /function Stat\b/);
  assert.match(js, /function DataTable\b/);
});

test("Cursor-compatible SDK public runtime surface transpiles", async () => {
  const js = await transpileCanvas(`
import React from "react";
import {
  BarChart, Button, Callout, Card, CardBody, CardHeader, Checkbox, CollapsibleSection,
  Code, DiffStats, DiffView, Divider, Grid, H1, H2, H3, IconButton, LineChart, Link,
  PieChart, Pill, Row, Select, Spacer, Stack, Stat, Swatch, Table, Text, TextArea,
  TextInput, TodoList, TodoListCard, Toggle, UsageBar, categoryPaletteDark,
  categoryPaletteLight, colorPalette, usageColorSequence, canvasPaletteDark,
  canvasPaletteLight, canvasTokens, canvasTokensLight, computeDAGLayout, mergeStyle,
  useCanvasAction, useCanvasState, useHostTheme
} from "@gen-ui/canvas";

const TODOS = [
  { id: "one", content: "Inspect", status: "completed" },
  { id: "two", content: "Verify", status: "in_progress" },
];

export default function Surface() {
  const theme = useHostTheme();
  const [name, setName] = useCanvasState("name", "canvas");
  const [enabled, setEnabled] = useCanvasState("enabled", true);
  const dispatch = useCanvasAction();
  const dag = computeDAGLayout({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }] });
  const paletteProof = [categoryPaletteDark.blue, categoryPaletteLight.blue, colorPalette.blue, canvasPaletteDark.foreground, canvasPaletteLight.foreground, canvasTokens.text.primary, canvasTokensLight.text.primary, usageColorSequence.length].join("|");
  return (
    <Stack gap={12} style={mergeStyle({ color: theme.text.primary }, { minWidth: 0 })}>
      <H1>SDK surface</H1>
      <Text tone="secondary">{theme.kind} · {paletteProof} · {dag.width}</Text>
      <Row align="center"><Pill active>Active</Pill><Spacer /><Button onClick={() => dispatch({ type: "openFile", path: "README.md" })}>Open</Button><IconButton title="More">+</IconButton></Row>
      <Grid columns={2}><Stat value="12" label="Checks" /><Swatch color="blue" /></Grid>
      <Divider />
      <H2>Forms</H2>
      <TextInput value={name} onChange={setName} />
      <TextArea value={name} onChange={setName} rows={2} />
      <Checkbox checked={enabled} onChange={setEnabled} label="Enabled" />
      <Toggle checked={enabled} onChange={setEnabled} />
      <Select value="a" onChange={() => {}} options={[{ value: "a", label: "A" }]} />
      <Callout tone="info" title="Info"><Text as="span">Use <Code>tokens</Code> and <Link href="https://example.com">links</Link>.</Text></Callout>
      <H2>Data</H2>
      <Table headers={["Name", "Value"]} rows={[["a", "1"]]} columnAlign={["left", "right"]} />
      <BarChart categories={["Mon", "Tue"]} series={[{ name: "RPS", data: [1, 2] }]} />
      <LineChart categories={["Mon", "Tue"]} series={[{ name: "p95", data: [2, 3] }]} />
      <PieChart data={[{ label: "A", value: 2 }, { label: "B", value: 1 }]} donut />
      <Card collapsible defaultOpen><CardHeader trailing={<DiffStats additions={1} deletions={1} />}>a.ts</CardHeader><CardBody style={{ padding: 0 }}><DiffView path="a.ts" lines={[{ type: "added", content: "+a", lineNumber: 1 }]} /></CardBody></Card>
      <CollapsibleSection title="Details" defaultOpen><H3>Nested</H3><Text>Detail</Text></CollapsibleSection>
      <TodoList todos={TODOS} />
      <TodoListCard todos={TODOS} />
      <UsageBar total={10} segments={[{ id: "used", value: 4, color: "green" }]} topLeftLabel="Used" topRightLabel="4 / 10" />
    </Stack>
  );
}
`);
  for (const symbol of ["BarChart", "LineChart", "PieChart", "computeDAGLayout", "DiffView", "TextInput", "TodoListCard", "UsageBar", "useCanvasState", "useCanvasAction"]) {
    assert.match(js, new RegExp(symbol));
  }
});

test("Canvas progressive TSX templates all transpile", async () => {
  for (const id of ["canvas-brief", "canvas-dashboard", "canvas-charts", "canvas-form-state", "canvas-diff", "canvas-todo"]) {
    const source = loadTemplate(id);
    assert.match(source, /export default function/);
    const js = await transpileCanvas(source);
    assert.match(js, /canvas-root/, id);
  }
});

test("Canvas host keeps state namespace stable and actions fire-and-forget", () => {
  const source = readFileSync(new URL("./tools.ts", import.meta.url), "utf8");
  assert.match(source, /const canvasStateId = process\.cwd\(\) \+ "::" \+ safeTitle/);
  assert.match(source, /canvasStateId,/);
  assert.match(source, /canvasDocumentHTML\(compiled, canvasStateId, provenanceFooter\)/);
  assert.match(source, /validateGroundingDeclaration\(params\.grounding\)/);
  assert.match(source, /genui-grounding/);
  assert.match(source, /const isCanvasAction =/);
  assert.match(source, /!isCanvasAction && !resolved && !settling/);
});
