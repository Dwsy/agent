import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSandboxStats } from "../sandbox.js";
import type { SandboxEntryStats } from "../types.js";

test("diffSandboxStats detects added, changed, removed", () => {
	const before = new Map<string, SandboxEntryStats>([
		["a.txt", { size: 1, mtimeMs: 100 }],
		["b.txt", { size: 2, mtimeMs: 200 }],
	]);
	const after = new Map<string, SandboxEntryStats>([
		["b.txt", { size: 3, mtimeMs: 200 }],
		["c.txt", { size: 4, mtimeMs: 300 }],
	]);

	const diff = diffSandboxStats(before, after);
	assert.deepEqual(diff.added, ["c.txt"]);
	assert.deepEqual(diff.changed, ["b.txt"]);
	assert.deepEqual(diff.removed, ["a.txt"]);
});
