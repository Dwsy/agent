/** Keeps the checked-in SDK reference in sync with canvas-sdk-source.ts. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSdkReference } from "./sdk-reference.ts";
import { CANVAS_SDK_SOURCE } from "./canvas-sdk-source.ts";

const doc = readFileSync(new URL("./skills/generative-ui/references/sdk.md", import.meta.url), "utf8");

test("checked-in SDK reference matches the generated surface", () => {
  assert.equal(doc, renderSdkReference(CANVAS_SDK_SOURCE));
});

test("SDK reference is the closed, non-empty export surface", () => {
  assert.match(doc, /# @gen-ui\/canvas SDK reference/);
  assert.match(doc, /## Tokens & constants \(11\)/);
  assert.match(doc, /## Hooks, helpers & host bridges \(8\)/);
  assert.match(doc, /## Components \(39\)/);
  assert.match(doc, /`useHostTheme\(\)`/);
  assert.match(doc, /`canvasTokens`/);
  assert.match(doc, /`BarChart\(\{/);
  assert.match(doc, /`Heatmap\(\{/);
  assert.match(doc, /`Scatter\(\{/);
  assert.match(doc, /not `className`/);
  assert.doesNotMatch(doc, /`ColumnSeries`/); // whole cursor/pages kit was not imported
});
