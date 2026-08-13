import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeSignals } from "../src/analyzer/signals.ts";
import { emptyEdits, emptyUsage } from "../src/types.ts";

function totals(over = {}) {
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
		edits: emptyEdits(),
		cacheHitRate: 0,
		toolErrorRate: 0,
		longestStreakDays: 0,
		currentStreakDays: 0,
		peakConcurrentSessions: 0,
		concurrentSessions: 0,
		...over,
		usage: { ...emptyUsage(), ...(over.usage ?? {}) },
	};
}

function fire(input) {
	return computeSignals({ models: [], tools: [], sessions: [], ...input });
}

/** Keeps tool fixtures and the totals derived from them from drifting apart. */
function totalsFromTools(tools, over = {}) {
	const toolCalls = tools.reduce((sum, tool) => sum + tool.calls, 0);
	const toolErrors = tools.reduce((sum, tool) => sum + tool.errors, 0);
	return totals({ toolCalls, toolErrors, toolErrorRate: toolCalls > 0 ? toolErrors / toolCalls : 0, ...over });
}

function ids(input) {
	return fire(input).map((s) => s.id);
}

assert.deepEqual(ids({ totals: totals() }), [], "no data means no claims");

// cache-underused
{
	const cold = { usage: { input: 400_000, cacheRead: 50_000 }, cacheHitRate: 50_000 / 450_000 };
	const signal = fire({ totals: totals(cold) }).find((s) => s.id === "cache-underused");
	assert.ok(signal, "a cold cache over 200k prompt tokens is worth saying");
	assert.equal(signal.titleKey, "signal.cache-underused");
	assert.equal(signal.severity, "notice");
	assert.equal(signal.values.rate, "11.1%");
	assert.equal(signal.values.threshold, "50.0%");
	assert.equal(signal.evidence.find((e) => e.labelKey === "ev.promptTokens").value, "450,000");

	// Minimum volume guard: same rate, far too few tokens to mean anything.
	assert.equal(
		ids({ totals: totals({ usage: { input: 900, cacheRead: 100 }, cacheHitRate: 0.1 }) }).includes("cache-underused"),
		false,
	);

	// A warm cache does not fire.
	assert.equal(
		ids({ totals: totals({ usage: { input: 100_000, cacheRead: 900_000 }, cacheHitRate: 0.9 }) }).includes("cache-underused"),
		false,
	);
	console.log("signal cache-underused: ok");
}

// tool-error-spike
{
	const tools = [
		{ name: "bash", calls: 400, errors: 100, sessions: 10 },
		{ name: "read", calls: 600, errors: 20, sessions: 10 },
	];
	const signal = fire({ totals: totalsFromTools(tools), tools }).find((s) => s.id === "tool-error-spike");
	assert.ok(signal);
	assert.equal(signal.severity, "warn");
	assert.equal(signal.values.tool, "bash");
	assert.equal(signal.values.rate, "25.0%");
	assert.equal(signal.evidence.find((e) => e.labelKey === "ev.calls").value, "400");

	// Minimum volume guard: the same 25% rate over 20 calls in total proves nothing.
	const few = [{ name: "bash", calls: 20, errors: 5, sessions: 1 }];
	assert.equal(ids({ totals: totalsFromTools(few), tools: few }).includes("tool-error-spike"), false);

	// Minimum volume guard: a 90% failure rate over 10 calls cannot name a tool.
	const rare = [
		{ name: "bash", calls: 990, errors: 50, sessions: 10 },
		{ name: "rare", calls: 10, errors: 9, sessions: 1 },
	];
	assert.equal(ids({ totals: totalsFromTools(rare), tools: rare }).includes("tool-error-spike"), false);

	// Nothing stands out when every tool fails at the same rate.
	const flat = [
		{ name: "a", calls: 500, errors: 60, sessions: 5 },
		{ name: "b", calls: 500, errors: 60, sessions: 5 },
	];
	assert.equal(ids({ totals: totalsFromTools(flat), tools: flat }).includes("tool-error-spike"), false);
	console.log("signal tool-error-spike: ok");
}

// interruption-rate
{
	assert.ok(ids({ totals: totals({ assistantMessages: 500, interruptions: 60 }) }).includes("interruption-rate"));
	assert.equal(
		ids({ totals: totals({ assistantMessages: 10, interruptions: 5 }) }).includes("interruption-rate"),
		false,
		"min volume",
	);
	assert.equal(ids({ totals: totals({ assistantMessages: 500, interruptions: 5 }) }).includes("interruption-rate"), false);
	console.log("signal interruption-rate: ok");
}

// context-compaction
{
	const sessions = [
		{ project: "alpha", compactions: 20 },
		{ project: "beta", compactions: 5 },
		{ project: "alpha", compactions: 5 },
	];
	const signal = fire({ totals: totals({ sessions: 40, compactions: 30 }), sessions }).find((s) => s.id === "context-compaction");
	assert.ok(signal);
	assert.equal(signal.values.project, "alpha");
	assert.equal(signal.values.count, "30");
	assert.equal(signal.evidence.find((e) => e.labelKey === "ev.project").value, "alpha (25)");

	assert.equal(
		ids({ totals: totals({ sessions: 4, compactions: 12 }), sessions }).includes("context-compaction"),
		false,
		"min volume: four sessions cannot show a pattern",
	);
	assert.equal(ids({ totals: totals({ sessions: 40, compactions: 4 }), sessions }).includes("context-compaction"), false);
	console.log("signal context-compaction: ok");
}

// model-concentration
{
	const usage = (tokens) => ({ ...emptyUsage(), totalTokens: tokens });
	const models = [
		{ key: "acme/big", provider: "acme", model: "big", usage: usage(9_000_000), sessions: 5 },
		{ key: "acme/small", provider: "acme", model: "small", usage: usage(1_000_000), sessions: 5 },
	];
	const signal = fire({ totals: totals({ usage: { totalTokens: 10_000_000 } }), models }).find((s) => s.id === "model-concentration");
	assert.ok(signal);
	assert.equal(signal.values.model, "acme/big");
	assert.equal(signal.values.share, "90.0%");

	assert.equal(
		ids({ totals: totals({ usage: { totalTokens: 1000 } }), models }).includes("model-concentration"),
		false,
		"min volume",
	);
	assert.equal(
		ids({ totals: totals({ usage: { totalTokens: 10_000_000 } }), models: [models[0]] }).includes("model-concentration"),
		false,
		"one model cannot be concentrated against anything",
	);
	console.log("signal model-concentration: ok");
}

// concurrent-sessions
{
	assert.ok(ids({ totals: totals({ sessions: 40, peakConcurrentSessions: 5, concurrentSessions: 22 }) }).includes("concurrent-sessions"));
	assert.equal(
		ids({ totals: totals({ sessions: 3, peakConcurrentSessions: 3, concurrentSessions: 3 }) }).includes("concurrent-sessions"),
		false,
		"min volume",
	);
	assert.equal(ids({ totals: totals({ sessions: 40, peakConcurrentSessions: 2 }) }).includes("concurrent-sessions"), false);
	console.log("signal concurrent-sessions: ok");
}

// At most six rules, ordered worst first, and every key resolves in the UI.
{
	const allTools = [
		{ name: "bash", calls: 400, errors: 100, sessions: 20 },
		{ name: "read", calls: 600, errors: 20, sessions: 20 },
	];
	const everything = fire({
		totals: totalsFromTools(allTools, {
			sessions: 40,
			compactions: 30,
			assistantMessages: 500,
			interruptions: 60,
			peakConcurrentSessions: 6,
			concurrentSessions: 30,
			cacheHitRate: 0.05,
			usage: { input: 400_000, cacheRead: 20_000, totalTokens: 10_000_000 },
		}),
		models: [
			{ key: "acme/big", provider: "acme", model: "big", usage: { ...emptyUsage(), totalTokens: 9_000_000 }, sessions: 5 },
			{ key: "acme/small", provider: "acme", model: "small", usage: { ...emptyUsage(), totalTokens: 1_000_000 }, sessions: 5 },
		],
		tools: allTools,
		sessions: [{ project: "alpha", compactions: 30 }],
	});

	assert.equal(everything.length, 6);
	assert.deepEqual(
		everything.map((s) => s.severity),
		["warn", "notice", "notice", "notice", "info", "info"],
	);
	assert.equal(new Set(everything.map((s) => s.id)).size, 6, "ids are unique");

	// The frontend owns the prose; a key it cannot resolve renders as the raw key.
	const i18nPath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "js", "i18n.js");
	const i18n = existsSync(i18nPath) ? readFileSync(i18nPath, "utf8") : null;
	for (const signal of everything) {
		assert.equal(signal.titleKey, `signal.${signal.id}`);
		assert.ok(signal.evidence.length > 0);
		for (const item of signal.evidence) assert.equal(typeof item.value, "string");
		if (i18n === null) continue;
		assert.ok(i18n.includes(`"${signal.titleKey}"`), `${signal.titleKey} is missing from i18n.js`);
		for (const item of signal.evidence) {
			assert.ok(i18n.includes(`"${item.labelKey}"`), `${item.labelKey} is missing from i18n.js`);
		}
	}
	console.log("signal set: ok");
}
