import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCacheDir, readCache, writeCache } from "../src/cache.ts";
import { getSessionsRoot, resolveRange, scanSessionFiles } from "../src/collector/scan.ts";
import { assertInside, getSessionsRoot as exportedRoot, loadSessionDetail } from "../src/index-api.ts";

const DAY = 24 * 60 * 60 * 1000;

// A path outside the sessions root is rejected before anything is read.
{
	const root = getSessionsRoot();
	assert.equal(exportedRoot(), root);

	const escapes = [
		"/etc/passwd",
		join(root, "..", "..", "..", "etc", "passwd"),
		join(root, "--proj--", "..", "..", "secrets.jsonl"),
		root,
		`${root}-sibling/leak.jsonl`,
	];
	for (const candidate of escapes) {
		await assert.rejects(
			() => loadSessionDetail(candidate),
			(error) => {
				assert.match(error.message, /path outside sessions root/, `expected rejection for ${candidate}`);
				return true;
			},
		);
	}

	// A path inside the root that simply is not there is a different failure.
	await assert.rejects(() => loadSessionDetail(join(root, "--nope--", "missing.jsonl")), /session not found/);

	// The prefix check is on a path boundary, not a string prefix.
	assert.throws(() => assertInside("/a/root", "/a/rootery/x.jsonl"), /path outside sessions root/);
	assert.throws(() => assertInside("/a/root", "/a/root"), /path outside sessions root/);
	assert.doesNotThrow(() => assertInside("/a/root", "/a/root/p/x.jsonl"));
	console.log("path escape rejection: ok");
}

// The scan walks every project directory and every file in it.
{
	const root = await mkdtemp(join(tmpdir(), "pi-insights-scan-"));
	const now = Date.now();
	try {
		for (const project of ["--proj-a--", "--proj-b--"]) {
			await mkdir(join(root, project));
			for (const name of ["one.jsonl", "two.jsonl", "notes.md"]) {
				await writeFile(join(root, project, name), "{}\n");
			}
		}
		// Old file in range terms, and a private temp project that never counts.
		const stale = join(root, "--proj-a--", "stale.jsonl");
		await writeFile(stale, "{}\n");
		await utimes(stale, new Date(now - 40 * DAY), new Date(now - 40 * DAY));
		await mkdir(join(root, "--private-tmp-scratch--"));
		await writeFile(join(root, "--private-tmp-scratch--", "x.jsonl"), "{}\n");
		await writeFile(join(root, "loose.jsonl"), "{}\n");
		await writeFile(join(root, "--proj-a--", "empty.jsonl"), "");

		const all = await scanSessionFiles(resolveRange("all", now), root);
		assert.equal(all.files.length, 5, "two files per project plus the stale one, ignoring .md and empty");
		assert.equal(
			all.files.filter((f) => f.path.includes("private-tmp")).length,
			0,
			"private temp sessions are never reported",
		);
		assert.ok(all.bytes > 0);

		const recent = await scanSessionFiles(resolveRange("7d", now), root);
		assert.equal(recent.files.length, 4, "the 40 day old file falls outside the window");

		// An unreadable project is counted, never thrown.
		const locked = join(root, "--proj-locked--");
		await mkdir(locked, { mode: 0o000 });
		const guarded = await scanSessionFiles(resolveRange("all", now), root);
		assert.equal(guarded.files.length, 5);
		if (process.getuid?.() !== 0) assert.equal(guarded.unreadableDirs, 1);
		await chmod(locked, 0o700);

		assert.deepEqual(await scanSessionFiles(resolveRange("all", now), join(root, "does-not-exist")), {
			files: [],
			bytes: 0,
			unreadableDirs: 1,
		});
		console.log("scan walks every project: ok");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

// The cache is keyed by path and invalidated by mtime or size.
{
	const ref = { path: join(tmpdir(), `pi-insights-cache-probe-${process.pid}.jsonl`), mtimeMs: 1000, size: 20 };
	const entryPath = join(getCacheDir(), `${createHash("sha1").update(ref.path).digest("hex")}.json`);
	try {
		assert.equal(await readCache(ref), null, "cold cache is a miss");

		await writeCache(ref, { detail: null, badLines: 3 });
		assert.deepEqual(await readCache(ref), { detail: null, badLines: 3 });

		assert.equal(await readCache({ ...ref, mtimeMs: 2000 }), null, "a newer transcript invalidates");
		assert.equal(await readCache({ ...ref, size: 21 }), null, "a resized transcript invalidates");

		await writeFile(entryPath, "{not json", { mode: 0o600 });
		assert.equal(await readCache(ref), null, "a corrupt entry is a miss, not an error");
		console.log("cache invalidation: ok");
	} finally {
		await rm(entryPath, { force: true });
	}
}
