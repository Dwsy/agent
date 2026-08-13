/**
 * Scan coordination shared by the HTTP routes and the `/insights` command.
 *
 * A scan is expensive and reads the same files for everyone, so concurrent
 * callers asking for the same work join one promise instead of racing.
 */

import { buildReport } from "../index-api.js";
import type { InsightsReport, RangeKey } from "../types.js";

/** Cheapest first — the order `/api/status` reports warm ranges in. */
export const RANGE_KEYS: readonly RangeKey[] = ["24h", "7d", "30d", "90d", "all"];
export const DEFAULT_RANGE: RangeKey = "30d";

export type ScanProgress = { done: number; total: number; phase: "scan" | "parse" | "aggregate" };
export type ScanProgressListener = (progress: ScanProgress) => void;

const inFlight = new Map<string, Promise<InsightsReport>>();
/** Ranges already built in this process; the aggregate itself is never cached. */
const built = new Set<RangeKey>();
const listeners = new Set<ScanProgressListener>();

/** Returns null for an unknown range so callers can fail instead of guessing. */
export function parseRange(raw: string | null | undefined): RangeKey | null {
	if (raw === null || raw === undefined || raw === "") return DEFAULT_RANGE;
	return RANGE_KEYS.find((key) => key === raw) ?? null;
}

export function onScanProgress(listener: ScanProgressListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function warmRanges(): RangeKey[] {
	return RANGE_KEYS.filter((key) => built.has(key));
}

export function requestReport(range: RangeKey, refresh: boolean): Promise<InsightsReport> {
	const key = `${range}:${refresh ? "fresh" : "cached"}`;
	const existing = inFlight.get(key);
	if (existing) return existing;

	const task = buildReport(range, { refresh, onProgress: emit })
		.then((report) => {
			built.add(range);
			return report;
		})
		.finally(() => {
			inFlight.delete(key);
		});
	inFlight.set(key, task);
	return task;
}

function emit(progress: ScanProgress): void {
	for (const listener of listeners) {
		try {
			listener(progress);
		} catch {
			listeners.delete(listener);
		}
	}
}
