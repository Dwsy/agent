import assert from "node:assert/strict";
import { buildStructuredPrompt, getFileDetails, selectSummaryText } from "../src/structured.js";

const prompt = buildStructuredPrompt("conversation", "previous", "focus here");
assert.match(prompt, /<conversation>\nconversation\n<\/conversation>/);
assert.match(prompt, /<previous-summary>\nprevious\n<\/previous-summary>/);
assert.match(prompt, /focus here/);
assert.match(prompt, /persistent role instructions/);
assert.match(buildStructuredPrompt("conversation", undefined, undefined, "extract <memory>"), /Mandatory memory extraction:\nextract <memory>/);

assert.equal(selectSummaryText([{ type: "thinking", text: "ignored" }, { type: "text", text: "summary" }]), "summary");
assert.deepEqual(
  getFileDetails({
    read: new Set(["a.ts", "b.ts"]),
    written: new Set(["b.ts"]),
    edited: new Set(["c.ts"]),
  }),
  { readFiles: ["a.ts"], modifiedFiles: ["b.ts", "c.ts"] },
);

console.log("algorithms.test.ts: ok");
