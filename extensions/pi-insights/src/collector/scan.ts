/**
 * Discovery of session transcripts on disk.
 *
 * The scan is deliberately dumb: it lists every `.jsonl` in every project
 * directory and filters on file mtime only. mtime is always >= the session's
 * first entry timestamp, so an mtime window is a strict superset of a
 * start-time window — the precise filter happens after parsing.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RangeKey } from "../types.js";

/** Sessions written by pi for throwaway temp cwds; never real work. */
const PRIVATE_DIR_PREFIX = "--private-tmp";

const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
	"24h": 24 * 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
	"90d": 90 * 24 * 60 * 60 * 1000,
};

export interface SessionFileRef {
	/** Absolute path to the `.jsonl`. */
	path: string;
	mtimeMs: number;
	size: number;
}

export interface ScanResult {
	files: SessionFileRef[];
	bytes: number;
	/** Project directories that could not be listed. Counted, never thrown. */
	unreadableDirs: number;
}

export interface ResolvedRange {
	key: RangeKey;
	startMs: number;
	endMs: number;
}

export function getSessionsRoot(): string {
	return join(homedir(), ".pi", "agent", "sessions");
}

export function isRangeKey(value: unknown): value is RangeKey {
	return value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "all";
}

export function resolveRange(key: RangeKey, now: number = Date.now()): ResolvedRange {
	if (key === "all") return { key, startMs: 0, endMs: now };
	return { key, startMs: now - RANGE_MS[key], endMs: now };
}

/**
 * Lists every transcript whose mtime falls inside the range window.
 *
 * Unreadable directories and files are skipped and counted; a broken symlink
 * or a permission error in one project must not fail the whole scan.
 */
export async function scanSessionFiles(range: ResolvedRange, root: string = getSessionsRoot()): Promise<ScanResult> {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => null);
	if (!entries) return { files: [], bytes: 0, unreadableDirs: 1 };

	const files: SessionFileRef[] = [];
	let bytes = 0;
	let unreadableDirs = 0;

	for (const entry of entries) {
		if (entry.name.startsWith(PRIVATE_DIR_PREFIX)) continue;
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

		const dir = join(root, entry.name);
		const names = await readdir(dir).catch(() => null);
		if (!names) {
			unreadableDirs += 1;
			continue;
		}

		const refs = await Promise.all(names.map((file) => statTranscript(dir, file)));
		for (const ref of refs) {
			if (!ref) continue;
			if (ref.mtimeMs < range.startMs) continue;
			files.push(ref);
			bytes += ref.size;
		}
	}

	files.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return { files, bytes, unreadableDirs };
}

async function statTranscript(dir: string, file: string): Promise<SessionFileRef | null> {
	if (!file.endsWith(".jsonl")) return null;
	const path = join(dir, file);
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size === 0) return null;
		return { path, mtimeMs: info.mtimeMs, size: info.size };
	} catch {
		return null;
	}
}
