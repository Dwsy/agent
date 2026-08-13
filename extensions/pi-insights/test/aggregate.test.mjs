import assert from "node:assert/strict";
import { aggregate, computeConcurrency, computeStreaks, dayKey, fillDailyGaps } from "../src/analyzer/aggregate.ts";
import { parseSessionLines } from "../src/collector/parse-session.ts";

const HOUR = 60 * 60 * 1000;

// Sessions overlap when their closed spans intersect.
{
	assert.deepEqual(computeConcurrency([]), { peak: 0, concurrent: 0 });
	assert.deepEqual(computeConcurrency([{ start: 0, end: 10 }]), { peak: 1, concurrent: 0 });
	assert.deepEqual(
		computeConcurrency([
			{ start: 0, end: 10 },
			{ start: 20, end: 30 },
		]),
		{ peak: 1, concurrent: 0 },
		"back to back is not concurrent",
	);
	assert.deepEqual(
		computeConcurrency([
			{ start: 0, end: 20 },
			{ start: 10, end: 30 },
		]),
		{ peak: 2, concurrent: 2 },
	);
	assert.deepEqual(
		computeConcurrency([
			{ start: 0, end: 10 },
			{ start: 10, end: 20 },
		]),
		{ peak: 2, concurrent: 2 },
		"touching at one instant still intersects",
	);
	assert.deepEqual(
		computeConcurrency([
			{ start: 0, end: 100 },
			{ start: 10, end: 20 },
			{ start: 15, end: 25 },
			{ start: 200, end: 300 },
		]),
		{ peak: 3, concurrent: 3 },
	);
	// A long span that bridges two disjoint pairs proves every session it touches.
	assert.deepEqual(
		computeConcurrency([
			{ start: 0, end: 5 },
			{ start: 3, end: 8 },
			{ start: 100, end: 105 },
			{ start: 104, end: 110 },
		]),
		{ peak: 2, concurrent: 4 },
	);
	console.log("concurrency sweep: ok");
}

// Dailies are gap-filled so a chart has no holes.
{
	const points = [
		{ date: "2026-08-03", sessions: 1, userMessages: 2, activeMinutes: 5, tokens: 10, costUsd: 1, linesAdded: 3, linesRemoved: 1 },
		{ date: "2026-08-06", sessions: 2, userMessages: 4, activeMinutes: 7, tokens: 20, costUsd: 2, linesAdded: 6, linesRemoved: 2 },
	];
	const filled = fillDailyGaps(points, "2026-08-01", "2026-08-07");
	assert.deepEqual(
		filled.map((p) => p.date),
		["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"],
	);
	assert.equal(filled[0].sessions, 0);
	assert.equal(filled[2].sessions, 1);
	assert.equal(filled[5].tokens, 20);
	assert.equal(filled.filter((p) => p.sessions === 0).length, 5);

	// Month and year boundaries roll over.
	assert.deepEqual(
		fillDailyGaps([{ ...points[0], date: "2025-12-31" }], "2025-12-30", "2026-01-02").map((p) => p.date),
		["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"],
	);
	assert.deepEqual(fillDailyGaps([], "2026-08-01", "2026-08-07"), [], "no data means no chart, not a flat line");
	console.log("gap-filled dailies: ok");
}

{
	assert.deepEqual(computeStreaks([], "2026-08-10"), { longest: 0, current: 0 });
	assert.deepEqual(computeStreaks(["2026-08-08", "2026-08-09", "2026-08-10"], "2026-08-10"), { longest: 3, current: 3 });
	assert.deepEqual(computeStreaks(["2026-08-08", "2026-08-09"], "2026-08-10"), { longest: 2, current: 2 }, "yesterday keeps a streak alive");
	assert.deepEqual(computeStreaks(["2026-08-01", "2026-08-02", "2026-08-08"], "2026-08-10"), { longest: 2, current: 0 });
	console.log("streaks: ok");
}

// End to end: two parsed sessions folded into a report.
function transcript({ id, cwd, start, userAt, usage, toolName }) {
	const lines = [JSON.stringify({ type: "session", version: 3, id, timestamp: start.toISOString(), cwd })];
	for (const when of userAt) {
		lines.push(JSON.stringify({ type: "message", timestamp: when.toISOString(), message: { role: "user", content: [{ type: "text", text: "go" }] } }));
	}
	lines.push(
		JSON.stringify({
			type: "message",
			timestamp: new Date(start.getTime() + 60_000).toISOString(),
			message: {
				role: "assistant",
				provider: "acme",
				model: "m1",
				usage,
				stopReason: "toolUse",
				content: [{ type: "toolCall", id: "c1", name: toolName, arguments: { path: "/p/a.ts", content: "x\ny\n" } }],
			},
		}),
	);
	return parseSessionLines(lines, `/tmp/${id}.jsonl`).detail;
}

{
	// Monday 2026-08-10, 09:00 and 14:00 local.
	const first = new Date(2026, 7, 10, 9, 0, 0);
	const second = new Date(2026, 7, 12, 14, 0, 0);
	const usage = { input: 100, output: 10, cacheRead: 300, cacheWrite: 0, reasoning: 0, totalTokens: 410, cost: { total: 0.5 } };

	const details = [
		transcript({ id: "s1", cwd: "/Users/me/alpha", start: first, userAt: [new Date(first.getTime() + 30_000)], usage, toolName: "write" }),
		transcript({ id: "s2", cwd: "/Users/me/alpha", start: second, userAt: [new Date(second.getTime() + 30_000)], usage, toolName: "write" }),
	];

	const report = aggregate({
		details,
		range: { key: "7d", start: new Date(2026, 7, 9).toISOString(), end: new Date(2026, 7, 13).toISOString() },
		scan: { files: 2, parsed: 2, skipped: 0, badLines: 0, bytes: 10, durationMs: 1, cached: false },
		now: new Date(2026, 7, 13, 12, 0, 0).getTime(),
	});

	assert.equal(report.totals.sessions, 2);
	assert.equal(report.totals.userMessages, 2);
	assert.equal(report.totals.usage.input, 200);
	assert.equal(report.totals.usage.requests, 2);
	assert.equal(report.totals.usage.costUsd, 1);
	assert.equal(report.totals.cacheHitRate, 600 / 800);
	assert.equal(report.totals.edits.linesAdded, 4);
	assert.equal(report.totals.activeDays, 2);
	assert.equal(report.totals.peakConcurrentSessions, 1);
	assert.equal(report.totals.concurrentSessions, 0);

	assert.deepEqual(
		report.daily.map((p) => p.date),
		["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"],
	);
	assert.equal(report.daily.find((p) => p.date === "2026-08-11").sessions, 0);
	assert.equal(report.daily.find((p) => p.date === dayKey(first)).sessions, 1);

	assert.equal(report.hourly.length, 24);
	assert.equal(report.hourly[9], 1);
	assert.equal(report.hourly[14], 1);
	assert.equal(report.weekday.length, 7);
	assert.equal(report.weekday[0], 1, "2026-08-10 is a Monday and Monday is index 0");
	assert.equal(report.weekday[2], 1, "2026-08-12 is a Wednesday");

	assert.equal(report.models.length, 1);
	assert.equal(report.models[0].sessions, 2);
	assert.equal(report.models[0].usage.totalTokens, 820);
	assert.equal(report.tools[0].name, "write");
	assert.equal(report.tools[0].sessions, 2);
	assert.equal(report.languages[0].ext, "ts");
	assert.equal(report.projects.length, 1);
	assert.equal(report.projects[0].name, "alpha");
	assert.equal(report.projects[0].sessions, 2);
	assert.equal(report.sessions[0].sessionId, "s2", "newest first");
	assert.equal("events" in report.sessions[0], false, "the list carries summaries, not full detail");
	assert.ok(Array.isArray(report.signals));
	console.log("aggregate report: ok");
}

// An empty range still produces a well-formed report.
{
	const report = aggregate({
		details: [],
		range: { key: "24h", start: new Date(Date.now() - 24 * HOUR).toISOString(), end: new Date().toISOString() },
		scan: { files: 0, parsed: 0, skipped: 0, badLines: 0, bytes: 0, durationMs: 0, cached: false },
	});
	assert.equal(report.totals.sessions, 0);
	assert.equal(report.totals.cacheHitRate, 0);
	assert.equal(report.totals.toolErrorRate, 0);
	assert.deepEqual(report.daily, []);
	assert.equal(report.hourly.length, 24);
	assert.deepEqual(report.signals, []);
	console.log("empty report: ok");
}
