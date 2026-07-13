import assert from "node:assert/strict";
import { normalizeConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/types.js";

const normalized = normalizeConfig({
  enabled: false,
  model: { provider: "google", id: "gemini-2.5-flash" },
  algorithm: "structured",
  maxSummaryTokens: 12000,
  showStatusWidget: false,
});

assert.deepEqual(normalized, {
  enabled: false,
  model: { provider: "google", id: "gemini-2.5-flash" },
  algorithm: "structured",
  maxSummaryTokens: 12000,
  showStatusWidget: false,
});

assert.deepEqual(normalizeConfig({ algorithm: "invalid", maxSummaryTokens: -1 }), DEFAULT_CONFIG);
assert.equal(DEFAULT_CONFIG.showStatusWidget, false);
assert.equal(normalizeConfig({ model: { provider: "", id: "model" } }).model, null);

console.log("config.test.ts: ok");
