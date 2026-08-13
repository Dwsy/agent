/**
 * Folds per-session records into the report payload.
 *
 * Everything here is arithmetic over facts the collector already read. No new
 * facts are introduced and nothing is estimated.
 */

import {
	addEdits,
	addUsage,
	emptyEdits,
	emptyUsage,
	type DailyPoint,
	type InsightsReport,
	type InsightsTotals,
	type LanguageStat,
	type ModelUsage,
	type ProjectStat,
	type RangeKey,
	type ScanStats,
	type SessionDetail,
	type SessionSummary,
	type ToolStat,
} from "../types.js";
import { computeSignals } from "./signals.js";

export interface AggregateInput {
	details: readonly SessionDetail[];
	range: { key: RangeKey; start: string; end: string };
	scan: ScanStats;
	now?: number;
}

export function aggregate(input: AggregateInput): InsightsReport {
	const now = input.now ?? Date.now();
	const details = [...input.details].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

	const totals = emptyTotals();
	const daily = new Map<string, DailyPoint>();
	const hourly = new Array<number>(24).fill(0);
	const weekday = new Array<number>(7).fill(0);
	const models = new Map<string, ModelUsage>();
	const tools = new Map<string, ToolStat>();
	const languages = new Map<string, LanguageStat>();
	const projects = new Map<string, ProjectStat>();

	for (const detail of details) {
		totals.sessions += 1;
		totals.userMessages += detail.userMessages;
		totals.assistantMessages += detail.assistantMessages;
		totals.toolCalls += detail.toolCalls;
		totals.toolErrors += detail.toolErrors;
		totals.interruptions += detail.interruptions;
		totals.errors += detail.errors;
		totals.compactions += detail.compactions;
		totals.activeMinutes += detail.activeMinutes;
		totals.wallMinutes += detail.wallMinutes;
		addUsage(totals.usage, detail.usage);
		addEdits(totals.edits, detail.edits);

		accumulateDaily(daily, detail);
		accumulateClock(hourly, weekday, detail);
		accumulateModels(models, detail);
		accumulateTools(tools, detail);
		accumulateLanguages(languages, detail);
		accumulateProject(projects, detail);
	}

	totals.activeMinutes = round1(totals.activeMinutes);
	totals.wallMinutes = round1(totals.wallMinutes);
	totals.activeDays = daily.size;
	totals.cacheHitRate = ratio(totals.usage.cacheRead, totals.usage.input + totals.usage.cacheRead);
	totals.toolErrorRate = ratio(totals.toolErrors, totals.toolCalls);

	const activeDates = [...daily.keys()].sort();
	const streaks = computeStreaks(activeDates, dayKey(new Date(now)));
	totals.longestStreakDays = streaks.longest;
	totals.currentStreakDays = streaks.current;

	const concurrency = computeConcurrency(
		details.map((detail) => ({ start: Date.parse(detail.startedAt), end: Date.parse(detail.endedAt) })),
	);
	totals.peakConcurrentSessions = concurrency.peak;
	totals.concurrentSessions = concurrency.concurrent;

	const points = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
	const fillStart = input.range.key === "all" ? (points[0]?.date ?? dayKey(new Date(now))) : dayKey(new Date(input.range.start));
	const fillEnd = dayKey(new Date(input.range.end));

	const report: Omit<InsightsReport, "signals"> = {
		generatedAt: new Date(now).toISOString(),
		range: input.range,
		scan: input.scan,
		totals,
		daily: fillDailyGaps(points, fillStart, fillEnd),
		hourly,
		weekday,
		models: [...models.values()].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens || a.key.localeCompare(b.key)),
		tools: [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
		languages: [...languages.values()].sort(
			(a, b) => b.linesAdded + b.linesRemoved - (a.linesAdded + a.linesRemoved) || b.files - a.files,
		),
		projects: [...projects.values()].sort((a, b) => b.activeMinutes - a.activeMinutes || b.sessions - a.sessions),
		sessions: details.map(toSummary),
	};

	return {
		...report,
		signals: computeSignals({ totals, models: report.models, tools: report.tools, sessions: report.sessions }),
	};
}

export function toSummary(detail: SessionDetail): SessionSummary {
	return {
		sessionId: detail.sessionId,
		filePath: detail.filePath,
		name: detail.name,
		cwd: detail.cwd,
		project: detail.project,
		startedAt: detail.startedAt,
		endedAt: detail.endedAt,
		wallMinutes: detail.wallMinutes,
		activeMinutes: detail.activeMinutes,
		userMessages: detail.userMessages,
		assistantMessages: detail.assistantMessages,
		toolCalls: detail.toolCalls,
		toolErrors: detail.toolErrors,
		interruptions: detail.interruptions,
		errors: detail.errors,
		compactions: detail.compactions,
		usage: detail.usage,
		edits: detail.edits,
		models: detail.models,
	};
}

/** `YYYY-MM-DD` in the local timezone. */
export function dayKey(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export function nextDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	// Constructing through local components keeps DST transitions on one day each.
	return dayKey(new Date(year, month - 1, day + 1));
}

/** Inserts zero rows so a chart drawn from `daily` has no holes. */
export function fillDailyGaps(points: readonly DailyPoint[], startDate: string, endDate: string): DailyPoint[] {
	// With no data there are no holes to fill, and an all-zero chart says nothing.
	if (points.length === 0) return [];

	const byDate = new Map(points.map((point) => [point.date, point]));
	const first = points[0]?.date ?? startDate;
	const last = points[points.length - 1]?.date ?? endDate;
	const from = startDate < first ? startDate : first;
	const to = endDate > last ? endDate : last;

	const filled: DailyPoint[] = [];
	let cursor = from;
	// Bounded so a corrupt date can never spin forever.
	for (let guard = 0; cursor <= to && guard < 20000; guard += 1) {
		filled.push(byDate.get(cursor) ?? emptyDaily(cursor));
		cursor = nextDayKey(cursor);
	}
	return filled;
}

export function computeStreaks(activeDates: readonly string[], today: string): { longest: number; current: number } {
	if (activeDates.length === 0) return { longest: 0, current: 0 };

	const sorted = [...activeDates].sort();
	let longest = 1;
	let run = 1;
	for (let i = 1; i < sorted.length; i += 1) {
		run = nextDayKey(sorted[i - 1]) === sorted[i] ? run + 1 : 1;
		if (run > longest) longest = run;
	}

	const last = sorted[sorted.length - 1];
	const yesterday = previousDayKey(today);
	const current = last === today || last === yesterday ? run : 0;
	return { longest, current };
}

/**
 * Sweep over start/end events. Spans are closed intervals, so two sessions
 * that touch at a single instant count as overlapping.
 */
export function computeConcurrency(
	spans: ReadonlyArray<{ start: number; end: number }>,
): { peak: number; concurrent: number } {
	const events: Array<{ at: number; delta: 1 | -1; index: number }> = [];
	spans.forEach((span, index) => {
		if (!Number.isFinite(span.start)) return;
		const end = Number.isFinite(span.end) && span.end > span.start ? span.end : span.start;
		events.push({ at: span.start, delta: 1, index });
		events.push({ at: end, delta: -1, index });
	});
	// Opens before closes at the same instant, so touching spans overlap.
	events.sort((a, b) => a.at - b.at || b.delta - a.delta);

	const open = new Set<number>();
	// Sessions still open that have not yet been proven concurrent. Draining this
	// set keeps the whole sweep linear instead of quadratic.
	const openUnproven = new Set<number>();
	let peak = 0;
	let concurrent = 0;

	for (const event of events) {
		if (event.delta === -1) {
			open.delete(event.index);
			openUnproven.delete(event.index);
			continue;
		}
		if (open.size > 0) {
			concurrent += 1 + openUnproven.size;
			openUnproven.clear();
			open.add(event.index);
		} else {
			open.add(event.index);
			openUnproven.add(event.index);
		}
		if (open.size > peak) peak = open.size;
	}

	return { peak, concurrent };
}

function accumulateDaily(daily: Map<string, DailyPoint>, detail: SessionDetail): void {
	const key = dayKey(new Date(detail.startedAt));
	const point = daily.get(key) ?? emptyDaily(key);
	point.sessions += 1;
	point.userMessages += detail.userMessages;
	point.activeMinutes = round1(point.activeMinutes + detail.activeMinutes);
	point.tokens += detail.usage.totalTokens;
	point.costUsd += detail.usage.costUsd;
	point.linesAdded += detail.edits.linesAdded;
	point.linesRemoved += detail.edits.linesRemoved;
	daily.set(key, point);
}

function accumulateClock(hourly: number[], weekday: number[], detail: SessionDetail): void {
	for (const event of detail.events) {
		if (event.kind !== "user") continue;
		const at = new Date(event.at);
		if (Number.isNaN(at.getTime())) continue;
		hourly[at.getHours()] += 1;
		// Monday first, matching the contract's index 0.
		weekday[(at.getDay() + 6) % 7] += 1;
	}
}

function accumulateModels(models: Map<string, ModelUsage>, detail: SessionDetail): void {
	for (const usage of detail.modelUsage) {
		const existing = models.get(usage.key);
		if (!existing) {
			models.set(usage.key, {
				key: usage.key,
				provider: usage.provider,
				model: usage.model,
				api: usage.api,
				usage: addUsage(emptyUsage(), usage.usage),
				sessions: 1,
			});
			continue;
		}
		addUsage(existing.usage, usage.usage);
		existing.sessions += 1;
		existing.api = existing.api ?? usage.api;
	}
}

function accumulateTools(tools: Map<string, ToolStat>, detail: SessionDetail): void {
	for (const tool of detail.tools) {
		const existing = tools.get(tool.name);
		if (!existing) {
			tools.set(tool.name, { name: tool.name, calls: tool.calls, errors: tool.errors, sessions: 1 });
			continue;
		}
		existing.calls += tool.calls;
		existing.errors += tool.errors;
		existing.sessions += 1;
	}
}

function accumulateLanguages(languages: Map<string, LanguageStat>, detail: SessionDetail): void {
	for (const language of detail.languages) {
		const existing = languages.get(language.ext);
		if (!existing) {
			languages.set(language.ext, { ...language });
			continue;
		}
		existing.files += language.files;
		existing.linesAdded += language.linesAdded;
		existing.linesRemoved += language.linesRemoved;
	}
}

function accumulateProject(projects: Map<string, ProjectStat>, detail: SessionDetail): void {
	const existing = projects.get(detail.cwd);
	if (!existing) {
		projects.set(detail.cwd, {
			cwd: detail.cwd,
			name: detail.project,
			sessions: 1,
			activeMinutes: detail.activeMinutes,
			userMessages: detail.userMessages,
			toolCalls: detail.toolCalls,
			usage: addUsage(emptyUsage(), detail.usage),
			edits: addEdits(emptyEdits(), detail.edits),
			firstAt: detail.startedAt,
			lastAt: detail.endedAt,
		});
		return;
	}
	existing.sessions += 1;
	existing.activeMinutes = round1(existing.activeMinutes + detail.activeMinutes);
	existing.userMessages += detail.userMessages;
	existing.toolCalls += detail.toolCalls;
	addUsage(existing.usage, detail.usage);
	addEdits(existing.edits, detail.edits);
	if (detail.startedAt < existing.firstAt) existing.firstAt = detail.startedAt;
	if (detail.endedAt > existing.lastAt) existing.lastAt = detail.endedAt;
}

function emptyDaily(date: string): DailyPoint {
	return { date, sessions: 0, userMessages: 0, activeMinutes: 0, tokens: 0, costUsd: 0, linesAdded: 0, linesRemoved: 0 };
}

function emptyTotals(): InsightsTotals {
	return {
		sessions: 0,
		activeDays: 0,
		userMessages: 0,
		assistantMessages: 0,
		toolCalls: 0,
		toolErrors: 0,
		interruptions: 0,
		errors: 0,
		compactions: 0,
		activeMinutes: 0,
		wallMinutes: 0,
		usage: emptyUsage(),
		edits: emptyEdits(),
		cacheHitRate: 0,
		toolErrorRate: 0,
		longestStreakDays: 0,
		currentStreakDays: 0,
		peakConcurrentSessions: 0,
		concurrentSessions: 0,
	};
}

function previousDayKey(key: string): string {
	const [year, month, day] = key.split("-").map(Number);
	return dayKey(new Date(year, month - 1, day - 1));
}

function ratio(numerator: number, denominator: number): number {
	return denominator > 0 ? numerator / denominator : 0;
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}
