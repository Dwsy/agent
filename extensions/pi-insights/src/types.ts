/**
 * pi-insights data contract.
 *
 * Every field here is derived from facts recorded in Pi session JSONL files
 * (`~/.pi/agent/sessions/<project>/<stamp>_<uuid>.jsonl`). Nothing is estimated,
 * inferred by a language model, or extrapolated. If a fact cannot be read from
 * the transcript it is absent, not guessed.
 */

export type RangeKey = "24h" | "7d" | "30d" | "90d" | "all";

/** Token and cost totals, summed from `message.usage` on assistant messages. */
export interface UsageTotals {
	/** Non-cached prompt tokens. */
	input: number;
	/** Completion tokens. */
	output: number;
	/** Prompt tokens served from the provider cache. */
	cacheRead: number;
	/** Prompt tokens written into the provider cache. */
	cacheWrite: number;
	/** Reasoning tokens, when the provider reports them separately. */
	reasoning: number;
	/** Provider-reported total; may exceed input+output when reasoning is billed apart. */
	totalTokens: number;
	/** Provider-reported cost in USD. Zero when the provider reports no pricing. */
	costUsd: number;
	/** Number of assistant messages carrying a usage block. */
	requests: number;
}

/** Usage attributed to one provider/model pair. */
export interface ModelUsage {
	/** `${provider}/${model}` — stable identity used as a map key and DOM key. */
	key: string;
	provider: string;
	model: string;
	/** pi-ai API family, e.g. `openai-responses`, `anthropic-messages`. */
	api?: string;
	usage: UsageTotals;
	/** Sessions in which this pair produced at least one message. */
	sessions: number;
}

export interface ToolStat {
	name: string;
	calls: number;
	/** Tool results flagged `isError: true`. */
	errors: number;
	/** Sessions in which the tool was called at least once. */
	sessions: number;
}

/** File mutations counted from `write` / `edit` tool-call arguments. */
export interface EditStats {
	filesTouched: number;
	writes: number;
	edits: number;
	linesAdded: number;
	linesRemoved: number;
}

export interface LanguageStat {
	/** Lowercase file extension without the dot, or `other` when absent. */
	ext: string;
	/** Human label, e.g. `TypeScript`. Falls back to the extension. */
	label: string;
	files: number;
	linesAdded: number;
	linesRemoved: number;
}

export interface ProjectStat {
	/** Absolute cwd recorded in the session header. */
	cwd: string;
	/** Display name — the last path segment. */
	name: string;
	sessions: number;
	activeMinutes: number;
	userMessages: number;
	toolCalls: number;
	usage: UsageTotals;
	edits: EditStats;
	firstAt: string;
	lastAt: string;
}

/** One row in the session list. Cheap to compute, safe to send in bulk. */
export interface SessionSummary {
	sessionId: string;
	/** Path of the source JSONL, used to load full detail on demand. */
	filePath: string;
	/** Name from the latest `session_info` entry, when the session was named. */
	name?: string;
	cwd: string;
	project: string;
	startedAt: string;
	endedAt: string;
	/** Wall clock between the first and last entry. */
	wallMinutes: number;
	/** Sum of gaps between consecutive entries, ignoring gaps over IDLE_GAP_MINUTES. */
	activeMinutes: number;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolErrors: number;
	/** Assistant messages that stopped with `aborted` — the user pressed escape. */
	interruptions: number;
	/** Assistant messages that stopped with `error`. */
	errors: number;
	/** `compaction` entries — the context was summarized and truncated. */
	compactions: number;
	usage: UsageTotals;
	edits: EditStats;
	/** Distinct `${provider}/${model}` keys used, in first-seen order. */
	models: string[];
}

/** Full per-session detail, loaded when a session row is opened. */
export interface SessionDetail extends SessionSummary {
	tools: ToolStat[];
	languages: LanguageStat[];
	modelUsage: ModelUsage[];
	/** Chronological milestones for the session timeline. */
	events: SessionEvent[];
	/** Files touched by write/edit, most-edited first. */
	files: Array<{ path: string; writes: number; edits: number; linesAdded: number; linesRemoved: number }>;
}

export interface SessionEvent {
	at: string;
	kind: "start" | "user" | "compaction" | "model_change" | "branch" | "interrupt" | "error" | "end";
	/** Short, factual label. Free text from the transcript is truncated by the collector. */
	label: string;
}

/** One calendar day in the local timezone. */
export interface DailyPoint {
	/** `YYYY-MM-DD` in local time. */
	date: string;
	sessions: number;
	userMessages: number;
	activeMinutes: number;
	tokens: number;
	costUsd: number;
	linesAdded: number;
	linesRemoved: number;
}

/**
 * A deterministic, threshold-based observation about the data.
 *
 * These are computed by fixed rules in `src/analyzer/signals.ts`, never by a
 * language model. Each one carries the numbers that triggered it so the reader
 * can check the claim instead of trusting it.
 */
export interface Signal {
	/** Stable rule id, e.g. `cache-underused`. */
	id: string;
	severity: "info" | "notice" | "warn";
	/** i18n key resolved by the frontend; the backend never ships prose. */
	titleKey: string;
	/** Values interpolated into the i18n string. */
	values: Record<string, string | number>;
	/** The measurements behind the rule, shown next to the claim. */
	evidence: Array<{ labelKey: string; value: string }>;
}

/** Scan bookkeeping, surfaced so the numbers are auditable. */
export interface ScanStats {
	/** JSONL files found in range. */
	files: number;
	/** Files parsed without a fatal error. */
	parsed: number;
	/** Files skipped: unreadable, empty, or no session header. */
	skipped: number;
	/** Lines that failed JSON.parse across all files. */
	badLines: number;
	bytes: number;
	durationMs: number;
	/** True when the result came from the on-disk cache rather than a fresh read. */
	cached: boolean;
}

export interface InsightsTotals {
	sessions: number;
	/** Days with at least one session. */
	activeDays: number;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolErrors: number;
	interruptions: number;
	errors: number;
	compactions: number;
	activeMinutes: number;
	wallMinutes: number;
	usage: UsageTotals;
	edits: EditStats;
	/** cacheRead / (input + cacheRead); 0 when there is no prompt traffic. */
	cacheHitRate: number;
	/** toolErrors / toolCalls; 0 when no tools ran. */
	toolErrorRate: number;
	/** Longest run of consecutive local days with at least one session. */
	longestStreakDays: number;
	/** Streak ending today or yesterday, else 0. */
	currentStreakDays: number;
	/** Peak number of sessions whose active spans overlap at one instant. */
	peakConcurrentSessions: number;
	/** Sessions that overlap in time with at least one other session. */
	concurrentSessions: number;
}

/** The full payload behind `GET /api/report`. */
export interface InsightsReport {
	generatedAt: string;
	range: { key: RangeKey; start: string; end: string };
	scan: ScanStats;
	totals: InsightsTotals;
	/** Ascending by date, gap-filled with zero rows so charts have no holes. */
	daily: DailyPoint[];
	/** 24 buckets of user-message counts, index 0 = local midnight hour. */
	hourly: number[];
	/** 7 buckets of user-message counts, index 0 = Monday. */
	weekday: number[];
	models: ModelUsage[];
	tools: ToolStat[];
	languages: LanguageStat[];
	projects: ProjectStat[];
	/** Every session in range, newest first. The UI paginates client-side. */
	sessions: SessionSummary[];
	signals: Signal[];
}

/** Gaps longer than this are treated as the user walking away, not working. */
export const IDLE_GAP_MINUTES = 5;

export function emptyUsage(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		totalTokens: 0,
		costUsd: 0,
		requests: 0,
	};
}

export function emptyEdits(): EditStats {
	return { filesTouched: 0, writes: 0, edits: 0, linesAdded: 0, linesRemoved: 0 };
}

export function addUsage(target: UsageTotals, source: UsageTotals): UsageTotals {
	target.input += source.input;
	target.output += source.output;
	target.cacheRead += source.cacheRead;
	target.cacheWrite += source.cacheWrite;
	target.reasoning += source.reasoning;
	target.totalTokens += source.totalTokens;
	target.costUsd += source.costUsd;
	target.requests += source.requests;
	return target;
}

export function addEdits(target: EditStats, source: EditStats): EditStats {
	target.filesTouched += source.filesTouched;
	target.writes += source.writes;
	target.edits += source.edits;
	target.linesAdded += source.linesAdded;
	target.linesRemoved += source.linesRemoved;
	return target;
}
