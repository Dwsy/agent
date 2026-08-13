import assert from "node:assert/strict";
import { countLines, extensionOf, parseSessionLines, truncateLabel } from "../src/collector/parse-session.ts";

const FILE = "/tmp/fake/session.jsonl";

/** Local wall-clock timestamp so hour-sensitive assertions hold in any timezone. */
function at(minute, second = 0) {
	return new Date(2026, 7, 10, 9, minute, second).toISOString();
}

function line(entry) {
	return JSON.stringify(entry);
}

function header(timestamp = at(0)) {
	return line({ type: "session", version: 3, id: "sess-1", timestamp, cwd: "/Users/me/proj" });
}

function assistant(timestamp, message) {
	return line({ type: "message", id: "a", parentId: null, timestamp, message: { role: "assistant", ...message } });
}

function usageBlock(over = {}) {
	return {
		input: 100,
		output: 10,
		cacheRead: 900,
		cacheWrite: 5,
		reasoning: 2,
		totalTokens: 1017,
		cost: { input: 0.1, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.12 },
		...over,
	};
}

// countLines: a trailing newline does not create a line.
assert.equal(countLines(""), 0);
assert.equal(countLines("a"), 1);
assert.equal(countLines("a\n"), 1);
assert.equal(countLines("a\nb"), 2);
assert.equal(countLines("a\nb\n"), 2);
assert.equal(countLines("\n"), 1);
assert.equal(countLines("\n\n"), 2);
console.log("countLines: ok");

assert.equal(extensionOf("/a/b/main.ts"), "ts");
assert.equal(extensionOf("/a/b/Makefile"), "other");
assert.equal(extensionOf("/a/b/.gitignore"), "other");
assert.equal(extensionOf("/a/b/App.TSX"), "tsx");
assert.equal(extensionOf("/a/b/dump.2026-08-11"), "other");
console.log("extensionOf: ok");

assert.equal(truncateLabel("  a\n\n b  "), "a b");
assert.equal(truncateLabel("x".repeat(200)).length, 120);
console.log("truncateLabel: ok");

// write adds arguments.content line count; the file counts as one write.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), {
				content: [{ type: "toolCall", id: "c1", name: "write", arguments: { path: "/p/main.ts", content: "a\nb\nc\n" } }],
			}),
		],
		FILE,
	);
	assert.equal(parsed.detail.edits.writes, 1);
	assert.equal(parsed.detail.edits.edits, 0);
	assert.equal(parsed.detail.edits.linesAdded, 3);
	assert.equal(parsed.detail.edits.linesRemoved, 0);
	assert.equal(parsed.detail.edits.filesTouched, 1);
	console.log("write line deltas: ok");
}

// edit adds newText lines and removes oldText lines, per entry in arguments.edits.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), {
				content: [
					{
						type: "toolCall",
						id: "c1",
						name: "edit",
						arguments: {
							path: "/p/main.ts",
							edits: [
								{ oldText: "x\ny\n", newText: "z\n" },
								{ oldText: "", newText: "q\nr" },
							],
						},
					},
				],
			}),
			assistant(at(2), {
				content: [{ type: "toolCall", id: "c2", name: "write", arguments: { path: "/p/notes.md", content: "one" } }],
			}),
		],
		FILE,
	);
	assert.equal(parsed.detail.edits.edits, 1, "one edit tool call is one edit");
	assert.equal(parsed.detail.edits.linesAdded, 1 + 2 + 1);
	assert.equal(parsed.detail.edits.linesRemoved, 2);
	assert.equal(parsed.detail.edits.filesTouched, 2);

	const ts = parsed.detail.languages.find((l) => l.ext === "ts");
	const md = parsed.detail.languages.find((l) => l.ext === "md");
	assert.deepEqual({ files: ts.files, added: ts.linesAdded, removed: ts.linesRemoved }, { files: 1, added: 3, removed: 2 });
	assert.deepEqual({ files: md.files, added: md.linesAdded, removed: md.linesRemoved }, { files: 1, added: 1, removed: 0 });
	assert.equal(ts.label, "TypeScript");
	console.log("edit line deltas and languages: ok");
}

// The single-edit encoding records the same fact and must not be dropped.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), {
				content: [
					{ type: "toolCall", id: "c1", name: "edit", arguments: { path: "/p/a.py", oldText: "a\nb\n", newText: "c\n" } },
				],
			}),
		],
		FILE,
	);
	assert.equal(parsed.detail.edits.linesAdded, 1);
	assert.equal(parsed.detail.edits.linesRemoved, 2);
	console.log("edit single-change encoding: ok");
}

// Gaps over IDLE_GAP_MINUTES are the user walking away, not working.
{
	const parsed = parseSessionLines(
		[
			header(at(0)),
			assistant(at(3), { content: [] }),
			assistant(at(12), { content: [] }),
			assistant(at(15), { content: [] }),
		],
		FILE,
	);
	assert.equal(parsed.detail.activeMinutes, 6, "3 + 3, the 9 minute gap is dropped");
	assert.equal(parsed.detail.wallMinutes, 15);
	console.log("idle gap active minutes: ok");
}

// Sub-threshold gaps accumulate exactly; the boundary gap itself still counts.
{
	const parsed = parseSessionLines([header(at(0)), assistant(at(5), { content: [] }), assistant(at(11), { content: [] })], FILE);
	assert.equal(parsed.detail.activeMinutes, 5);
	console.log("idle gap boundary: ok");
}

// Usage and cost come from message.usage on assistant messages only.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), { provider: "acme", model: "m1", api: "openai-responses", usage: usageBlock(), content: [] }),
			assistant(at(2), {
				provider: "acme",
				model: "m1",
				usage: usageBlock({ input: 50, totalTokens: 60, cost: { total: 0.03 } }),
				content: [],
			}),
			assistant(at(3), { provider: "acme", model: "m2", usage: usageBlock({ input: 1, totalTokens: 1 }), content: [] }),
			line({ type: "message", timestamp: at(4), message: { role: "user", content: [{ type: "text", text: "hi" }] } }),
		],
		FILE,
	);
	const usage = parsed.detail.usage;
	assert.equal(usage.requests, 3);
	assert.equal(usage.input, 151);
	assert.equal(usage.output, 30);
	assert.equal(usage.cacheRead, 2700);
	assert.equal(usage.totalTokens, 1017 + 60 + 1);
	assert.equal(Number(usage.costUsd.toFixed(4)), 0.27);
	assert.deepEqual(parsed.detail.models, ["acme/m1", "acme/m2"]);
	assert.equal(parsed.detail.modelUsage.find((m) => m.key === "acme/m1").usage.requests, 2);
	assert.equal(parsed.detail.modelUsage.find((m) => m.key === "acme/m1").api, "openai-responses");
	assert.equal(parsed.detail.userMessages, 1);
	assert.equal(parsed.detail.assistantMessages, 3);
	console.log("usage and cost summing: ok");
}

// Tool errors come from toolResult.isError and attach to the tool that ran.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), {
				content: [
					{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
					{ type: "toolCall", id: "c2", name: "read", arguments: { path: "/p/a.ts" } },
				],
			}),
			line({
				type: "message",
				timestamp: at(2),
				message: { role: "toolResult", toolCallId: "c1", toolName: "bash", isError: true, content: [] },
			}),
			line({
				type: "message",
				timestamp: at(3),
				message: { role: "toolResult", toolCallId: "c2", isError: false, content: [] },
			}),
			// No toolName recorded: the call id has to resolve it.
			line({ type: "message", timestamp: at(4), message: { role: "toolResult", toolCallId: "c2", isError: true, content: [] } }),
		],
		FILE,
	);
	assert.equal(parsed.detail.toolCalls, 2);
	assert.equal(parsed.detail.toolErrors, 2);
	const bash = parsed.detail.tools.find((t) => t.name === "bash");
	const read = parsed.detail.tools.find((t) => t.name === "read");
	assert.deepEqual({ calls: bash.calls, errors: bash.errors }, { calls: 1, errors: 1 });
	assert.deepEqual({ calls: read.calls, errors: read.errors }, { calls: 1, errors: 1 });
	console.log("tool error counting: ok");
}

// stopReason drives interruptions and errors; compaction entries are counted.
{
	const parsed = parseSessionLines(
		[
			header(),
			assistant(at(1), { stopReason: "aborted", content: [] }),
			assistant(at(2), { stopReason: "error", content: [] }),
			assistant(at(3), { stopReason: "stop", content: [] }),
			line({ type: "compaction", timestamp: at(4), summary: "## Goal\nstuff" }),
		],
		FILE,
	);
	assert.equal(parsed.detail.interruptions, 1);
	assert.equal(parsed.detail.errors, 1);
	assert.equal(parsed.detail.compactions, 1);
	assert.equal(parsed.detail.events.filter((e) => e.kind === "compaction")[0].label, "## Goal stuff");
	console.log("stop reasons and compactions: ok");
}

// The name is the last session_info; it is never synthesized from message text.
{
	const parsed = parseSessionLines(
		[header(), line({ type: "session_info", timestamp: at(1), name: "first" }), line({ type: "session_info", timestamp: at(2), name: "second" })],
		FILE,
	);
	assert.equal(parsed.detail.name, "second");
	assert.equal(parseSessionLines([header()], FILE).detail.name, undefined);
	console.log("session name: ok");
}

// A broken line is counted, not fatal.
{
	const parsed = parseSessionLines([header(), "{not json", "", assistant(at(1), { content: [] })], FILE);
	assert.equal(parsed.badLines, 1);
	assert.equal(parsed.detail.assistantMessages, 1);
	console.log("bad lines counted: ok");
}

// No session header means the file cannot be placed on a timeline.
assert.equal(parseSessionLines([assistant(at(1), { content: [] })], FILE), null);
assert.equal(parseSessionLines([], FILE), null);
console.log("missing header skipped: ok");

// The timeline carries one user event per user message so the report can bucket them.
{
	const parsed = parseSessionLines(
		[
			header(),
			line({ type: "model_change", timestamp: at(1), provider: "acme", modelId: "m1" }),
			line({ type: "message", timestamp: at(2), message: { role: "user", content: [{ type: "text", text: "do it" }] } }),
			line({ type: "branch_summary", timestamp: at(3), summary: "branched" }),
		],
		FILE,
	);
	const kinds = parsed.detail.events.map((e) => e.kind);
	assert.deepEqual(kinds, ["start", "model_change", "user", "branch", "end"]);
	assert.equal(parsed.detail.events[0].label, "/Users/me/proj");
	assert.equal(parsed.detail.events[1].label, "acme/m1");
	assert.equal(parsed.detail.events[2].label, "do it");
	assert.equal(parsed.detail.sessionId, "sess-1");
	assert.equal(parsed.detail.project, "proj");
	console.log("event timeline: ok");
}
