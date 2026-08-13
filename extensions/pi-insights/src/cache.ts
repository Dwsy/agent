/**
 * Per-session parse cache.
 *
 * One JSON file per transcript, keyed by a hash of the absolute path and
 * invalidated whenever the transcript's mtime or size changes. Aggregation is
 * never cached — it is cheap once the per-session records exist.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionDetail } from "./types.js";
import type { SessionFileRef } from "./collector/scan.js";

/** Bumped whenever the parser changes shape, which invalidates every entry. */
const CACHE_VERSION = 1;

export interface CachedParse {
	/** Null records a transcript we read and deliberately skipped. */
	detail: SessionDetail | null;
	badLines: number;
}

interface CacheEntry extends CachedParse {
	version: number;
	mtimeMs: number;
	size: number;
}

export function getCacheDir(): string {
	return join(homedir(), ".pi", "agent", "usage-data", "insights");
}

export async function readCache(ref: SessionFileRef): Promise<CachedParse | null> {
	const raw = await readFile(cachePath(ref.path), "utf8").catch(() => null);
	if (raw === null) return null;

	let entry: CacheEntry;
	try {
		entry = JSON.parse(raw) as CacheEntry;
	} catch {
		// A truncated or corrupt entry is a miss, not a failure.
		return null;
	}

	if (entry.version !== CACHE_VERSION) return null;
	if (entry.mtimeMs !== ref.mtimeMs || entry.size !== ref.size) return null;
	if (entry.detail !== null && typeof entry.detail !== "object") return null;
	return { detail: entry.detail, badLines: entry.badLines ?? 0 };
}

export async function writeCache(ref: SessionFileRef, value: CachedParse): Promise<void> {
	const entry: CacheEntry = {
		version: CACHE_VERSION,
		mtimeMs: ref.mtimeMs,
		size: ref.size,
		detail: value.detail,
		badLines: value.badLines,
	};
	await ensureCacheDir();
	// A failed cache write only costs a re-parse next time.
	await writeFile(cachePath(ref.path), JSON.stringify(entry), { mode: 0o600 }).catch(() => undefined);
}

export async function countCachedSessions(): Promise<number> {
	const names = await readdir(getCacheDir()).catch(() => null);
	if (!names) return 0;
	return names.filter((name) => name.endsWith(".json")).length;
}

function cachePath(sessionFilePath: string): string {
	const key = createHash("sha1").update(sessionFilePath).digest("hex");
	return join(getCacheDir(), `${key}.json`);
}

let cacheDirReady: Promise<void> | null = null;

function ensureCacheDir(): Promise<void> {
	if (!cacheDirReady) {
		// An unwritable cache degrades to re-parsing; it never fails a report.
		cacheDirReady = mkdir(getCacheDir(), { recursive: true, mode: 0o700 }).then(
			() => undefined,
			() => undefined,
		);
	}
	return cacheDirReady;
}
