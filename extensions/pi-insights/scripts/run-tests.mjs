#!/usr/bin/env node
/**
 * Runs every `test/*.test.mjs` under bun, which resolves the TypeScript sources
 * directly so the suite needs no build step.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "test");

let files = [];
try {
	files = readdirSync(testDir)
		.filter((name) => name.endsWith(".test.mjs"))
		.sort();
} catch {
	console.error("no test/ directory");
	process.exit(1);
}

if (files.length === 0) {
	console.error("no test files found in test/");
	process.exit(1);
}

let failed = 0;
for (const file of files) {
	const result = spawnSync("bun", [join(testDir, file)], { cwd: root, stdio: "inherit" });
	if (result.status !== 0) {
		console.error(`FAIL ${file}`);
		failed += 1;
	}
}

if (failed > 0) {
	console.error(`${failed} of ${files.length} test files failed`);
	process.exit(1);
}
console.log(`all ${files.length} test files passed`);
