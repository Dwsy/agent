import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { wrapHTML } from "./html-helpers.ts";
import { WIDGET_STEPS_CSS, WIDGET_STEPS_SCRIPT } from "./widget-steps.ts";

const root = dirname(fileURLToPath(import.meta.url));

test("both shells inject the step mechanism", () => {
  const html = wrapHTML("<div>x</div>");
  assert.ok(html.includes(WIDGET_STEPS_CSS), "widget shell lacks the step CSS");
  assert.ok(html.includes(WIDGET_STEPS_SCRIPT), "widget shell lacks the step script");

  const canvas = readFileSync(join(root, "canvas.ts"), "utf8");
  assert.match(canvas, /WIDGET_STEPS_CSS/);
  assert.match(canvas, /WIDGET_STEPS_SCRIPT/);
});

test("the mechanism uses host tokens, not hardcoded colors", () => {
  assert.match(WIDGET_STEPS_CSS, /var\(--color-text-primary\)/);
  assert.match(WIDGET_STEPS_CSS, /var\(--color-background-secondary\)/);
  assert.match(WIDGET_STEPS_CSS, /var\(--color-border-tertiary\)/);
  assert.doesNotMatch(WIDGET_STEPS_CSS, /#[0-9a-fA-F]{3,6}\b/);
});

test("content stays visible until the runtime initialises", () => {
  // The hiding rule is scoped to .is-steps-ready, which only the script adds.
  assert.match(WIDGET_STEPS_CSS, /\[data-steps\]\.is-steps-ready/);
  assert.doesNotMatch(WIDGET_STEPS_CSS, /^\[data-step\]\{display:none\}/m);
  assert.match(WIDGET_STEPS_SCRIPT, /classList\.add\('is-steps-ready'\)/);
});

test("the mechanism covers the documented contract", () => {
  for (const hook of [
    "data-steps",
    "data-step",
    "data-step-in",
    "data-step-captions",
    "data-step-prev",
    "data-step-next",
    "data-step-play",
    "data-step-open",
  ]) {
    assert.ok(WIDGET_STEPS_SCRIPT.includes(hook), `script is missing ${hook}`);
  }
  assert.match(WIDGET_STEPS_SCRIPT, /aria-current/);
  assert.match(WIDGET_STEPS_SCRIPT, /aria-label/);
  assert.match(WIDGET_STEPS_SCRIPT, /MutationObserver/);
});

test("the runtime survives the host replacing widget content", () => {
  // Steps are bound on document, not on the widget element, so a re-render keeps working.
  assert.match(WIDGET_STEPS_SCRIPT, /document\.addEventListener\('click'/);
  assert.match(WIDGET_STEPS_SCRIPT, /document\.addEventListener\('input'/);
  assert.doesNotMatch(WIDGET_STEPS_SCRIPT, /addEventListener\('click'[^)]*,\s*false\)/);
});

test("guidelines point at the mechanism instead of a hand-rolled stepper", () => {
  const guidelines = readFileSync(join(root, "guidelines.ts"), "utf8");
  assert.match(guidelines, /data-steps/);
  assert.match(guidelines, /do not hand-roll it/);
  assert.match(guidelines, /Write no JavaScript for this/);
});

test("the skill documents the mechanism", () => {
  const quality = readFileSync(join(root, "skills", "generative-ui", "references", "quality.md"), "utf8");
  assert.match(quality, /data-step-in/);
  assert.match(quality, /data-step-captions/);
  assert.match(quality, /Degradation/);
});
