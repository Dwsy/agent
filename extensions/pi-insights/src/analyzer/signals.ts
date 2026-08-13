/**
 * Deterministic observations about the report.
 *
 * Fixed thresholds over measured totals — no language model, no ranking model.
 * Each rule carries the numbers that triggered it so the reader can check the
 * claim. Every rule is guarded by a minimum volume, because a rate over a
 * handful of events is noise dressed up as a finding.
 *
 * Ids and keys are the ones `public/js/i18n.js` can resolve; a rule that
 * invents a key would render as a raw string in the UI.
 */

import type { InsightsTotals, ModelUsage, SessionSummary, Signal, ToolStat } from "../types.js";

export interface SignalInput {
	totals: InsightsTotals;
	models: readonly ModelUsage[];
	tools: readonly ToolStat[];
	sessions: readonly SessionSummary[];
}

/** Minimum volume each rule needs before it is allowed to speak. */
const MIN_PROMPT_TOKENS = 200_000;
const MIN_TOOL_CALLS = 200;
const MIN_CALLS_PER_TOOL = 20;
const MIN_SESSIONS = 10;
const MIN_ASSISTANT_MESSAGES = 100;
const MIN_COMPACTIONS = 10;
const MIN_TOKENS = 1_000_000;

const CACHE_HIT_FLOOR = 0.5;
const TOOL_ERROR_CEILING = 0.08;
const INTERRUPTION_CEILING = 0.05;
const COMPACTIONS_PER_SESSION = 0.25;
const MODEL_CONCENTRATION = 0.7;
const CONCURRENCY_FLOOR = 3;

const SEVERITY_ORDER: Record<Signal["severity"], number> = { warn: 0, notice: 1, info: 2 };

export function computeSignals(input: SignalInput): Signal[] {
	const signals = [
		cacheUnderused(input),
		toolErrorSpike(input),
		interruptionRate(input),
		contextCompaction(input),
		modelConcentration(input),
		concurrentSessions(input),
	].filter((signal): signal is Signal => signal !== null);

	return signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function cacheUnderused({ totals }: SignalInput): Signal | null {
	const promptTokens = totals.usage.input + totals.usage.cacheRead;
	if (promptTokens < MIN_PROMPT_TOKENS) return null;
	if (totals.cacheHitRate >= CACHE_HIT_FLOOR) return null;

	return {
		id: "cache-underused",
		severity: "notice",
		titleKey: "signal.cache-underused",
		values: { rate: percent(totals.cacheHitRate), threshold: percent(CACHE_HIT_FLOOR) },
		evidence: [
			{ labelKey: "ev.cacheHitRate", value: percent(totals.cacheHitRate) },
			{ labelKey: "ev.cacheRead", value: count(totals.usage.cacheRead) },
			{ labelKey: "ev.promptTokens", value: count(promptTokens) },
			{ labelKey: "ev.threshold", value: percent(CACHE_HIT_FLOOR) },
		],
	};
}

function toolErrorSpike({ totals, tools }: SignalInput): Signal | null {
	if (totals.toolCalls < MIN_TOOL_CALLS) return null;

	const candidates = tools.filter((tool) => tool.calls >= MIN_CALLS_PER_TOOL && tool.errors > 0);
	const worst = [...candidates].sort((a, b) => b.errors / b.calls - a.errors / a.calls)[0];
	if (!worst) return null;

	const rate = worst.errors / worst.calls;
	if (rate < TOOL_ERROR_CEILING) return null;

	// A spike has to stand out from the tools it is being compared against, so the
	// baseline excludes the candidate itself. Otherwise the tool doing most of the
	// work always sits at the overall rate and can never be flagged.
	const otherCalls = totals.toolCalls - worst.calls;
	const otherRate = otherCalls > 0 ? (totals.toolErrors - worst.errors) / otherCalls : 0;
	if (rate <= otherRate) return null;

	return {
		id: "tool-error-spike",
		severity: "warn",
		titleKey: "signal.tool-error-spike",
		values: { tool: worst.name, rate: percent(rate) },
		evidence: [
			{ labelKey: "ev.tool", value: worst.name },
			{ labelKey: "ev.errors", value: count(worst.errors) },
			{ labelKey: "ev.calls", value: count(worst.calls) },
			{ labelKey: "ev.sessions", value: count(worst.sessions) },
		],
	};
}

function interruptionRate({ totals }: SignalInput): Signal | null {
	if (totals.assistantMessages < MIN_ASSISTANT_MESSAGES) return null;
	const rate = totals.interruptions / totals.assistantMessages;
	if (rate < INTERRUPTION_CEILING) return null;

	return {
		id: "interruption-rate",
		severity: "notice",
		titleKey: "signal.interruption-rate",
		values: { rate: percent(rate) },
		evidence: [
			{ labelKey: "ev.interruptions", value: count(totals.interruptions) },
			{ labelKey: "ev.assistantMessages", value: count(totals.assistantMessages) },
		],
	};
}

function contextCompaction({ totals, sessions }: SignalInput): Signal | null {
	if (totals.sessions < MIN_SESSIONS) return null;
	if (totals.compactions < MIN_COMPACTIONS) return null;
	if (totals.compactions / totals.sessions < COMPACTIONS_PER_SESSION) return null;

	const byProject = new Map<string, number>();
	for (const session of sessions) {
		if (session.compactions === 0) continue;
		byProject.set(session.project, (byProject.get(session.project) ?? 0) + session.compactions);
	}
	const worst = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0];
	if (!worst) return null;

	return {
		id: "context-compaction",
		severity: "notice",
		titleKey: "signal.context-compaction",
		values: { count: count(totals.compactions), project: worst[0] },
		evidence: [
			{ labelKey: "ev.compactions", value: count(totals.compactions) },
			{ labelKey: "ev.project", value: `${worst[0]} (${count(worst[1])})` },
			{ labelKey: "ev.sessions", value: count(totals.sessions) },
		],
	};
}

function modelConcentration({ totals, models }: SignalInput): Signal | null {
	if (totals.usage.totalTokens < MIN_TOKENS) return null;
	// Concentration is not a finding when there is nothing to concentrate against.
	if (models.length < 2) return null;

	const top = [...models].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)[0];
	const share = top.usage.totalTokens / totals.usage.totalTokens;
	if (share < MODEL_CONCENTRATION) return null;

	return {
		id: "model-concentration",
		severity: "info",
		titleKey: "signal.model-concentration",
		values: { model: top.key, share: percent(share) },
		evidence: [
			{ labelKey: "ev.model", value: top.key },
			{ labelKey: "ev.tokens", value: count(top.usage.totalTokens) },
			{ labelKey: "ev.share", value: percent(share) },
		],
	};
}

function concurrentSessions({ totals }: SignalInput): Signal | null {
	if (totals.sessions < MIN_SESSIONS) return null;
	if (totals.peakConcurrentSessions < CONCURRENCY_FLOOR) return null;

	return {
		id: "concurrent-sessions",
		severity: "info",
		titleKey: "signal.concurrent-sessions",
		values: { peak: totals.peakConcurrentSessions },
		evidence: [
			{ labelKey: "ev.peak", value: count(totals.peakConcurrentSessions) },
			{ labelKey: "ev.sessions", value: count(totals.concurrentSessions) },
		],
	};
}

/** The UI substitutes these verbatim, so they arrive display-ready. */
function percent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function count(value: number): string {
	return value.toLocaleString("en-US");
}
