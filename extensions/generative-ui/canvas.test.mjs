/** Canvas transpile pipeline tests (bun — imports ./canvas.ts directly). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { transpileCanvas, validateCanvasCode, canvasDocumentHTML, canvasShellHTML } from "./canvas.ts";

const VALID_TSX = `
import React, { useState } from "react";
import { useHostTheme, sendToAgent } from "@gen-ui/canvas";

interface Row { name: string; value: number }
const ROWS: Row[] = [{ name: "a", value: 1 }];

export default function Report() {
  const theme = useHostTheme();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ color: theme.text }}>
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
  const doc = canvasDocumentHTML(js);
  // React UMD is inlined, not loaded from a CDN
  assert.ok(!doc.includes("unpkg.com/react"));
  assert.match(doc, /react\.production\.min\.js/); // @license banner of the vendored UMD
  assert.match(doc, /react-dom\.production\.min\.js/);
  assert.ok(doc.includes('version="18.3.1"'));
  assert.match(doc, /id="canvas-root"/);
  assert.ok(doc.includes("Content-Security-Policy"));
  assert.ok(doc.includes(js.slice(0, 60)));

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
