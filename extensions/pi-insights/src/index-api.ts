/**
 * The only surface the server layer imports.
 *
 * Everything below the collector/analyzer boundary stays private so the HTTP
 * layer cannot grow a dependency on how a transcript is shaped.
 */

import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { aggregate } from "./analyzer/aggregate.js";
import { countCachedSessions, getCacheDir, readCache, writeCache, type CachedParse } from "./cache.js";
import { parseSessionFile } from "./collector/parse-session.js";
import { getSessionsRoot, resolveRange, scanSessionFiles, type SessionFileRef } from "./collector/scan.js";
import type { InsightsReport, RangeKey, ScanStats, SessionDetail } from "./types.js";

/** Enough parallelism to keep the disk busy without exhausting descriptors. */
const PARSE_CONCURRENCY = 8;

/** Progress is throttled; 7000 callbacks would cost more than the parse. */
const PROGRESS_EVERY = 25;

export type ProgressPhase = "scan" | "parse" | "aggregate";

export interface Progress {
	done: number;
	total: number;
	phase: ProgressPhase;
}

export interface BuildReportOptions {
	refresh?: boolean;
	onProgress?: (progress: Progress) => void;
}

export { getCacheDir, getSessionsRoot, countCachedSessions };

export async function buildReport(range: RangeKey, options: BuildReportOptions = {}): Promise<InsightsReport> {
	const startedMs = Date.now();
	const window = resolveRange(range, startedMs);
	const emit = (phase: ProgressPhase, done: number, total: number): void => {
		try {
			options.onProgress?.({ phase, done, total });
		} catch {
			// A broken progress consumer must not fail the scan.
		}
	};

	emit("scan", 0, 1);
	const scan = await scanSessionFiles(window);
	emit("scan", 1, 1);

	const total = scan.files.length;
	let done = 0;
	let parsed = 0;
	let skipped = 0;
	let badLines = 0;
	let freshReads = 0;
	const details: SessionDetail[] = [];

	await mapWithConcurrency(scan.files, PARSE_CONCURRENCY, async (ref) => {
		const cached = options.refresh ? null : await readCache(ref);
		const result = cached ?? (await parseAndCache(ref));
		if (!cached) freshReads += 1;

		if (result.detail) {
			parsed += 1;
			// mtime is only a prefilter: a session resumed today may have started
			// long before the window opened.
			if (Date.parse(result.detail.startedAt) >= window.startMs) details.push(result.detail);
		} else {
			skipped += 1;
		}
		badLines += result.badLines;

		done += 1;
		if (done % PROGRESS_EVERY === 0 || done === total) emit("parse", done, total);
	});

	emit("aggregate", 0, 1);
	const stats: ScanStats = {
		files: total,
		parsed,
		skipped,
		badLines,
		bytes: scan.bytes,
		durationMs: Date.now() - startedMs,
		cached: total > 0 && freshReads === 0,
	};

	const report = aggregate({
		details,
		range: { key: range, start: new Date(window.startMs).toISOString(), end: new Date(window.endMs).toISOString() },
		scan: stats,
		now: startedMs,
	});
	emit("aggregate", 1, 1);
	return report;
}

/**
 * Loads one transcript in full. Rejects anything outside the sessions root so
 * the server can map the failure to a 403 without doing its own path checks.
 */
export async function loadSessionDetail(filePath: string): Promise<SessionDetail> {
	const root = await realpath(getSessionsRoot()).catch(() => getSessionsRoot());
	assertInside(root, resolve(filePath));

	// Re-check after following symlinks; the cheap check above only sees the name.
	const real = await realpath(resolve(filePath)).catch(() => null);
	if (real === null) throw new Error(`session not found: ${filePath}`);
	assertInside(root, real);

	const info = await stat(real).catch(() => null);
	if (!info || !info.isFile()) throw new Error(`session not found: ${filePath}`);

	const ref: SessionFileRef = { path: real, mtimeMs: info.mtimeMs, size: info.size };
	const cached = await readCache(ref);
	const result = cached ?? (await parseAndCache(ref));
	if (!result.detail) throw new Error(`session is not a readable transcript: ${filePath}`);
	return result.detail;
}

async function parseAndCache(ref: SessionFileRef): Promise<CachedParse> {
	const parsed = await parseSessionFile(ref);
	const value: CachedParse = { detail: parsed?.detail ?? null, badLines: parsed?.badLines ?? 0 };
	await writeCache(ref, value);
	return value;
}

/** Throws with a message the server maps to 403. */
export function assertInside(root: string, candidate: string): void {
	const prefix = root.endsWith(sep) ? root : root + sep;
	if (!candidate.startsWith(prefix)) throw new Error(`path outside sessions root: ${candidate}`);
}

async function mapWithConcurrency<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next;
			next += 1;
			await run(items[index]);
		}
	});
	await Promise.all(workers);
}
