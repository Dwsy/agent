import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCache } from "../cache.js";
import { SnapshotTracker } from "../tracker.js";

async function createTempDir(prefix: string): Promise<string> {
	return mkdtemp(path.join(tmpdir(), prefix));
}

test("SnapshotTracker saves and restores leaf", async () => {
	const realRoot = await createTempDir("undo-redo-real-");
	const sandboxRoot = await createTempDir("undo-redo-sandbox-");
	const sessionId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const cache = createCache(sessionId);
	await cache.ensure();

	try {
		const relativePath = "note.txt";
		const realPath = path.join(realRoot, relativePath);
		const sandboxPath = path.join(sandboxRoot, relativePath);

		await writeFile(realPath, "base", "utf-8");
		await cp(realPath, sandboxPath);

		const tracker = new SnapshotTracker(cache, realRoot, sandboxRoot);
		await tracker.loadBase();
		await tracker.ensureBaseFromSandbox(relativePath);

		await writeFile(sandboxPath, "updated", "utf-8");
		await tracker.updateFromSandbox(relativePath);
		await tracker.saveLeaf("leaf-1");

		await writeFile(realPath, "other", "utf-8");
		await tracker.restoreLeaf("leaf-1", [realRoot]);

		const restored = await readFile(realPath, "utf-8");
		assert.equal(restored, "updated");
	} finally {
		await rm(realRoot, { recursive: true, force: true });
		await rm(sandboxRoot, { recursive: true, force: true });
		await rm(cache.root, { recursive: true, force: true });
	}
});
