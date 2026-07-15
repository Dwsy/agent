import assert from "node:assert/strict";
import { appendFileDetails, buildStructuredPrompt, getFileDetails, mergeFileDetails, selectSummaryText } from "../src/structured.js";

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

const cumulativeFiles = mergeFileDetails(
  { readFiles: ["current-read.ts", "changed.ts"], modifiedFiles: ["current-edit.ts"] },
  "## Previous\n\n<read-files>\nprevious-read.ts\nchanged.ts\n</read-files>\n\n<modified-files>\nchanged.ts\n</modified-files>",
);
assert.deepEqual(cumulativeFiles, {
  readFiles: ["current-read.ts", "previous-read.ts"],
  modifiedFiles: ["changed.ts", "current-edit.ts"],
});
assert.equal(
  appendFileDetails("## Checkpoint\n\n<read-files>\nstale.ts\n</read-files>", cumulativeFiles),
  "## Checkpoint\n\n<read-files>\ncurrent-read.ts\nprevious-read.ts\n</read-files>\n\n<modified-files>\nchanged.ts\ncurrent-edit.ts\n</modified-files>",
);

console.log("algorithms.test.ts: ok");
