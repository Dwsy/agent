import test from "node:test";
import assert from "node:assert/strict";
import { validateWidgetCode } from "./widget-validation.ts";

test("validateWidgetCode accepts safe focused fragments", () => {
  assert.doesNotThrow(() => validateWidgetCode(`<section aria-label="Summary"><p>Grounded result</p></section>`));
  assert.doesNotThrow(() => validateWidgetCode(`<button onclick="sendPrompt('inspect')">Inspect</button>`, true));
  assert.doesNotThrow(() => validateWidgetCode(`<img alt="diagram" src="https://cdn.jsdelivr.net/npm/example.png">`));
});

test("validateWidgetCode rejects full documents and network APIs", () => {
  assert.throws(() => validateWidgetCode(`<!doctype html><html><body>x</body></html>`), /HTML fragment/);
  assert.throws(() => validateWidgetCode(`<script>fetch('https://example.com')</script>`), /cannot use fetch/);
  assert.throws(() => validateWidgetCode(`<script>new WebSocket('wss://example.com')</script>`), /WebSocket/);
});

test("validateWidgetCode restricts external resources to approved hosts", () => {
  assert.throws(
    () => validateWidgetCode(`<img src="https://evil.example/tracker.png">`),
    /approved CDN host/,
  );
  assert.doesNotThrow(() => validateWidgetCode(`<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js"></script>`));
});

test("interactive widgets must use an agent event bridge", () => {
  assert.throws(() => validateWidgetCode(`<button>Choose</button>`, true), /must send a choice/);
  assert.doesNotThrow(() => validateWidgetCode(`<button onclick="sendWidgetEvent({type:'choice'})">Choose</button>`, true));
});

test("validateWidgetCode enforces the 2 MB inline-data ceiling", () => {
  assert.throws(() => validateWidgetCode(`<div>${"x".repeat(2 * 1024 * 1024)}</div>`), /smaller than 2 MB/);
});
