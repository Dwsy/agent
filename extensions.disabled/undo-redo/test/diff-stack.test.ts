import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCache } from "../cache.js";
import { formatDiffText, listDiffItems } from "../diff-stack.js";
import { SnapshotTracker } from "../tracker.js";

async function createTempDir(prefix: string): Promise<string> {
	return mkdtemp(path.join(tmpdir(), prefix));
}

test("diff helpers list buffered changes", async () => {
	const realRoot = await createTempDir("undo-redo-real-");
	const sandboxRoot = await createTempDir("undo-redo-sandbox-");
	const sessionId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const cache = createCache(sessionId);
	await cache.ensure();

	try {
		const basePath = "note.txt";
		const addedPath = "added.txt";
		const realBasePath = path.join(realRoot, basePath);
		const sandboxBasePath = path.join(sandboxRoot, basePath);
		const sandboxAddedPath = path.join(sandboxRoot, addedPath);

		await writeFile(realBasePath, "base", "utf-8");
		await cp(realBasePath, sandboxBasePath);

		const tracker = new SnapshotTracker(cache, realRoot, sandboxRoot);
		await tracker.loadBase();
		await tracker.ensureBaseFromSandbox(basePath);

		await writeFile(sandboxBasePath, "updated", "utf-8");
		await tracker.updateFromSandbox(basePath);
		await writeFile(sandboxAddedPath, "added", "utf-8");
		await tracker.updateFromSandbox(addedPath);
		await tracker.saveLeaf("leaf-1");

		const items = await listDiffItems(tracker, cache);
		assert.equal(items.length, 2);
		assert.ok(
			items.some(
				(item) =>
					item.leafId === "leaf-1" &&
					item.path === basePath &&
					item.change === "modified",
			),
		);
		assert.ok(
			items.some(
				(item) =>
					item.leafId === "leaf-1" &&
					item.path === addedPath &&
					item.change === "added",
			),
		);
	} finally {
		await rm(realRoot, { recursive: true, force: true });
		await rm(sandboxRoot, { recursive: true, force: true });
		await rm(cache.root, { recursive: true, force: true });
	}
});

test("formatDiffText renders textual diffs", async () => {
	const realRoot = await createTempDir("undo-redo-real-");
	const sandboxRoot = await createTempDir("undo-redo-sandbox-");
	const sessionId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const cache = createCache(sessionId);
	await cache.ensure();

	try {
		const filePath = "note.txt";
		const realPath = path.join(realRoot, filePath);
		const sandboxPath = path.join(sandboxRoot, filePath);

		await writeFile(realPath, "base", "utf-8");
		await cp(realPath, sandboxPath);

		const tracker = new SnapshotTracker(cache, realRoot, sandboxRoot);
		await tracker.loadBase();
		await tracker.ensureBaseFromSandbox(filePath);

		await writeFile(sandboxPath, "updated", "utf-8");
		const leafEntry = await tracker.updateFromSandbox(filePath);
		const baseEntry = tracker.getBaseManifest().get(filePath);

		const diffText = await formatDiffText(cache, baseEntry, leafEntry);
		assert.ok(diffText.includes("updated"));
	} finally {
		await rm(realRoot, { recursive: true, force: true });
		await rm(sandboxRoot, { recursive: true, force: true });
		await rm(cache.root, { recursive: true, force: true });
	}
});
