import assert from "node:assert/strict";
import {
  buildBranchRows,
  buildTreeRows,
  clearOutlineCache,
  discardCtxPending,
  formatEntryDetail,
  formatOutline,
  formatRow,
  getOutlineRows,
  isKeyRow,
  peekCtxPending,
  peekCtxFireRequest,
  signalsOf,
  takeCtxCompaction,
  ctxTool,
  peekCtxActive,
  peekCtxLastResult,
  resetCtxState,
} from "../src/ctx.js";
import { registerCtxLifecycle } from "../src/ctx-lifecycle.js";

const userEntry = {
  type: "message", id: "a", parentId: null, timestamp: "t0",
  message: { role: "user", content: [{ type: "text", text: "hello world, please fix the bug" }] },
};
const assistantEntry = {
  type: "message", id: "b", parentId: "a", timestamp: "t1",
  message: {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "should never surface" },
      { type: "text", text: "reading the file first" },
      { type: "toolCall", id: "c1", name: "read", arguments: { path: "x.ts" } },
      { type: "toolCall", id: "c2", name: "bash", arguments: { command: "ls" } },
    ],
  },
};
const toolResultEntry = {
  type: "message", id: "r", parentId: "b", timestamp: "t2",
  message: {
    role: "toolResult", toolCallId: "c2", toolName: "bash", isError: true, timestamp: 1,
    content: [{ type: "text", text: "boom\n".repeat(5000) }],
  },
};
const compactionEntry = {
  type: "compaction", id: "c", parentId: "r", timestamp: "t3",
  summary: "x".repeat(3000), firstKeptEntryId: "b", tokensBefore: 10,
};
const usageEntry = { type: "usage", id: "u", parentId: "c", timestamp: "t4" };

// ── signals: attention without bodies ──

const assistantSignals = signalsOf(assistantEntry as never);
assert.deepEqual(assistantSignals.tools, ["read", "bash"]);
assert.ok(!assistantSignals.preview.includes("should never surface"), "thinking stays out");
assert.ok(assistantSignals.preview.includes("reading the file"));

const resultSignals = signalsOf(toolResultEntry as never);
assert.deepEqual(resultSignals.tools, ["bash"]);
assert.equal(resultSignals.isError, true);
assert.equal(resultSignals.preview, "", "tool bodies never preview");
assert.ok(resultSignals.sizeChars > 10000, "size signal kept");

const compactionSignals = signalsOf(compactionEntry as never);
assert.equal(compactionSignals.summaryChars, 3000);
assert.equal(compactionSignals.keptFrom, "b");

// ── key filter: user intent, activity, errors, checkpoints, labels ──

assert.equal(isKeyRow("message", signalsOf(userEntry as never), undefined), true);
assert.equal(isKeyRow("message", assistantSignals, undefined), true);
assert.equal(isKeyRow("message", resultSignals, undefined), true);
assert.equal(isKeyRow("usage", signalsOf(usageEntry as never), undefined), false);
assert.equal(isKeyRow("usage", signalsOf(usageEntry as never), "v1"), true, "label promotes");

// ── branch rows + row format ──

const branch = [userEntry, assistantEntry, toolResultEntry, compactionEntry];
const rows = buildBranchRows(branch as never);
assert.equal(rows.length, 4);
assert.ok(formatRow(rows[2]).includes("err!"), "error flagged");
assert.ok(formatRow(rows[2]).includes("KB"), "bulk sized");
assert.ok(formatRow(rows[3]).includes("keptFrom=b"), "keep-point visible");
assert.ok(formatRow(rows[0], "v1").includes('label="v1"'), "label at display time");
assert.equal(
  rows.filter((row) => isKeyRow(row.type, row.signals, undefined)).length,
  4,
  "all four are key rows",
);

// ── tree rows: straight line unless real fork ──
// Pi session is a parentId chain: 1 child = normal dialogue (same depth),
// >1 children = fork/navigate (abandoned branch, indent once).

const tree = [
  { entry: userEntry, children: [{ entry: assistantEntry, children: [] }] },
  { entry: { type: "message", id: "z", parentId: null, timestamp: "t9", message: { role: "user", content: "dead branch" } }, children: [] },
];
const treeRows = buildTreeRows(tree as never);
assert.equal(treeRows.length, 3);
assert.equal(treeRows[1].depth, 0, "single-child chain stays straight");
assert.equal(treeRows[2].depth, 0, "second root stays at base depth");

const forkTree = [
  { entry: userEntry, children: [{ entry: assistantEntry, children: [] }, { entry: toolResultEntry, children: [] }] },
];
const forkRows = buildTreeRows(forkTree as never);
assert.equal(forkRows.length, 3);
assert.equal(forkRows[0].depth, 0);
assert.equal(forkRows[1].depth, 1, "forked children indent");
assert.equal(forkRows[2].depth, 1, "forked children indent");

// ── outline cache: same leaf = same content ──

clearOutlineCache();
let builds = 0;
const first = getOutlineRows("branch", "leaf1", () => { builds++; return buildBranchRows(branch as never); });
assert.equal(builds, 1);
assert.equal(first.cached, false);
const second = getOutlineRows("branch", "leaf1", () => { builds++; return buildBranchRows(branch as never); });
assert.equal(builds, 1, "pagination reuses the build");
assert.equal(second.cached, true);
getOutlineRows("branch", "leaf2", () => { builds++; return buildBranchRows(branch as never); });
assert.equal(builds, 2, "new turn rebuilds");
getOutlineRows("tree", "leaf2", () => { builds++; return buildTreeRows(tree as never); });
assert.equal(builds, 3, "scope is part of the key");
clearOutlineCache();

// ── outline format takes display lines ──

const text = formatOutline([formatRow(rows[0]), formatRow(rows[2])], 4, 0, "branch", "c");
assert.match(text, /total=4/);
assert.match(text, /shown=2/);

// ── detail: clipped by default, full on demand ──

const clipped = JSON.parse(formatEntryDetail(toolResultEntry as never, { branchIndex: 2, branchTotal: 4, childrenIds: [], full: false }));
assert.equal(clipped.id, "r");
assert.ok(clipped.text.length <= 4000, "tool body clipped");
assert.ok(clipped.textClipped.includes("pass full=true"));
const full = JSON.parse(formatEntryDetail(toolResultEntry as never, { branchIndex: 2, branchTotal: 4, childrenIds: ["c"], full: true }));
assert.ok(full.text.length > 10000, "full drill-down");
assert.deepEqual(full.childrenIds, ["c"]);

// ── Stage/fire lifecycle, matching pi-context's stop-then-transition flow ──
const handlers = new Map<string, Function[]>();
const sent: string[] = [];
let entries: any[] = [...branch];
let compactCalls = 0;
let abortCalls = 0;
let options: any;
let throwCompact = false;
const context = {
  hasUI: false,
  sessionManager: {
    getBranch: () => entries,
    getTree: () => tree,
    getEntries: () => entries,
    getEntry: (id: string) => entries.find((e) => e.id === id),
    getLabel: () => undefined,
    getLeafId: () => entries.at(-1)?.id ?? null,
  },
  abort: () => { abortCalls++; },
  compact: (opts: unknown) => {
    compactCalls++;
    if (throwCompact) throw new Error("runtime unavailable");
    options = opts;
  },
};
const stubCtx = (_ids: string[]) => context as never;
registerCtxLifecycle({
  on: (event: string, handler: Function) => { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
  appendEntry: (customType: string, data: unknown) => {
    entries.push({ type: "custom", id: "boundary-" + entries.length, parentId: entries.at(-1)?.id, timestamp: "now", customType, data });
  },
  sendUserMessage: (text: string) => { sent.push(text); },
} as never, () => {});
const emit = async (event: string) => {
  for (const fn of handlers.get(event) ?? []) await fn({ type: event }, context);
};
const call = (action: string, obj: Record<string, unknown> = {}) =>
  ctxTool.execute("test", { action, obj }, undefined, undefined, context as never);
const textOf = (result: Awaited<ReturnType<typeof ctxTool.execute>>) =>
  result.content.map((block) => block.type === "text" ? block.text : "").join("\n");
const status = async () => JSON.parse(textOf(await call("compact_status")));
const eventFor = (reason = "manual", instructions = options?.customInstructions, branchEntries = entries) =>
  ({ reason, customInstructions: instructions, branchEntries, preparation: { tokensBefore: 123 } }) as never;

await emit("session_start");
assert.equal((await call("compact_fire")).isError, true);
assert.equal((await call("compact_stage", { summary: "checkpoint", firstKeptEntryId: "a" })).isError, true,
  "ambiguous legacy keep-point cannot accidentally retain all tool dialogue");
assert.equal((await call("compact_stage", { summary: "checkpoint", retention: "keep-tail" })).isError, true);
assert.equal((await call("compact_stage", { summary: "checkpoint", retention: "keep-tail", firstKeptEntryId: "off-branch" })).isError, true);
assert.equal((await call("compact_stage", { summary: 42 })).isError, true);
assert.equal((await call("compact_stage", { summary: "ok", resume: true })).isError, true);
assert.equal((await call("compact_stage", { summary: "x".repeat(20001) })).isError, true);
assert.equal((await call("compact_stage", { summary: "ok", resume: "x".repeat(2001) })).isError, true);

assert.equal((await call("compact_stage", { summary: "checkpoint", resume: " continue " })).isError, undefined);
assert.equal(peekCtxPending()?.retention, "summary-only");
assert.equal(peekCtxPending()?.resume, "continue");
assert.equal(takeCtxCompaction(eventFor("manual", "unrelated /compact")), undefined, "stage alone never affects /compact");
assert.equal(takeCtxCompaction(eventFor("threshold")), undefined, "automatic compaction cannot steal the stage");
assert.equal(peekCtxPending()?.summary, "checkpoint");

await call("compact_fire");
assert.equal(peekCtxFireRequest(), true);
assert.equal(compactCalls, 0, "tool never invokes compact");
await emit("turn_end");
assert.equal(abortCalls, 1, "no further model turn is needed to stop the run");
assert.equal(compactCalls, 0, "turn_end only stops; transition waits until agent_end");
await emit("agent_end");
assert.equal(compactCalls, 1);
assert.equal(peekCtxPending(), null);
assert.equal((await status()).inProgress, true);
assert.equal((await status()).retention, "summary-only");
assert.equal(sent.length, 0, "resume waits for the verified commit");
assert.equal(takeCtxCompaction(eventFor("threshold")), undefined, "even during fire, automatic compaction cannot consume ctx");
assert.equal(takeCtxCompaction(eventFor("manual", "foreign")), undefined);
const injected = takeCtxCompaction(eventFor());
if (!injected || !("compaction" in injected)) assert.fail("expected staged compaction to be injected");
assert.equal(injected.compaction.firstKeptEntryId, entries.at(-1)?.id, "summary-only starts AFTER all old dialogue");
// The staged text is kept verbatim and the file tags are appended to it.
assert.ok(injected.compaction.summary.startsWith("checkpoint"), "the staged summary is preserved");
assert.ok(injected.compaction.summary.includes("<read-files>\nx.ts\n</read-files>"), "the dropped file operations are reported");
assert.equal(injected.compaction.tokensBefore, 123);
assert.equal(takeCtxCompaction(eventFor()), undefined, "injection is single-use");
assert.equal((await call("compact_stage", { summary: "busy" })).isError, true);
assert.equal((await call("compact_discard")).isError, true);
options.onComplete(injected.compaction);
assert.equal(peekCtxLastResult(), "committed; resume sent");
assert.deepEqual(sent, ["continue"]);
assert.equal((await status()).inProgress, false);
await emit("agent_end");
assert.equal(compactCalls, 1, "duplicate end cannot fire twice");

// Explicit keep-tail preserves its exact point and truthfully describes the retained range.
const kept = await call("compact_stage", { summary: "tail checkpoint", retention: "keep-tail", firstKeptEntryId: "b" });
assert.equal(kept.isError, undefined);
assert.match(textOf(kept), /ALL entries added through the firing turn/);
assert.equal(peekCtxLastResult(), null, "new stage clears stale success");
await call("compact_fire");
const beforeKeep = entries.length;
await emit("agent_end");
assert.equal(entries.length, beforeKeep, "keep-tail needs no extra boundary");
const tail = takeCtxCompaction(eventFor());
if (!tail || !("compaction" in tail)) assert.fail("expected staged compaction to be injected");
assert.equal(tail.compaction.firstKeptEntryId, "b");
options.onComplete(tail.compaction);
assert.equal(peekCtxLastResult(), "committed");
assert.equal(sent.length, 1, "no resume when omitted");

// Unrelated handler output must not be reported as success or send resume.
await call("compact_stage", { summary: "ours", resume: "must not send" });
await call("compact_fire");
await emit("agent_end");
options.onComplete({ summary: "another extension", firstKeptEntryId: "a", tokensBefore: 1 });
assert.match(peekCtxLastResult()!, /^failed:.*not committed/);
assert.equal(sent.length, 1);

// Failures before session_before_compact (e.g. session too small) clear all state.
await call("compact_stage", { summary: "retry", resume: "must not send" });
await call("compact_fire");
await emit("agent_end");
options.onError(new Error("Nothing to compact (session too small)"));
assert.equal(peekCtxPending(), null);
assert.equal(peekCtxActive(), null);
assert.match(peekCtxLastResult()!, /session too small/);
assert.equal(sent.length, 1);

// Stale points cancel instead of falling back to a misleading normal compaction.
await call("compact_stage", { summary: "tail", retention: "keep-tail", firstKeptEntryId: "b" });
await call("compact_fire");
await emit("agent_end");
const stale = takeCtxCompaction(eventFor("manual", options.customInstructions, []));
if (!stale || !("invalidPoint" in stale)) assert.fail("expected stale keep-point to be cancelled");
assert.equal(stale.cancel, true);
options.onError(new Error("Compaction cancelled"));

// Re-stage/discard disarm pending fire.
await call("compact_stage", { summary: "one" });
await call("compact_fire");
await call("compact_stage", { summary: "two" });
assert.equal(peekCtxFireRequest(), false);
await call("compact_fire");
await call("compact_discard");
assert.equal(peekCtxFireRequest(), false);
assert.equal(peekCtxPending(), null);

// A session switch/reload invalidates late callbacks, including their resume.
await call("compact_stage", { summary: "old session", resume: "must not leak" });
await call("compact_fire");
await emit("agent_end");
const oldOptions = options;
const oldResult = takeCtxCompaction(eventFor());
if (!oldResult || !("compaction" in oldResult)) assert.fail("expected staged compaction to be injected");
await emit("session_shutdown");
await emit("session_start");
oldOptions.onComplete(oldResult.compaction);
oldOptions.onError(new Error("old error"));
assert.equal(peekCtxLastResult(), null);
assert.equal(sent.length, 1);
assert.equal(peekCtxActive(), null);

await call("compact_stage", { summary: "throw" });
await call("compact_fire");
throwCompact = true;
await emit("agent_end");
throwCompact = false;
assert.match(peekCtxLastResult()!, /runtime unavailable/);
assert.equal(peekCtxActive(), null);

await call("compact_stage", { summary: "branch" });
await call("compact_fire");
await emit("session_tree");
assert.equal(peekCtxPending(), null);
assert.equal(peekCtxFireRequest(), false);
assert.equal((await call("nope")).isError, true);
clearOutlineCache();
assert.equal((await call("tree_outline", { focus: "key", limit: 2 })).isError, undefined);

// ── progressive help: discoverable, unambiguous, executable ──
const help = await ctxTool.execute("h1", { action: "action-list", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(help.isError, undefined);
const helpText = textOf(help);
assert.match(helpText, /action=<name>.*obj=/, "calling contract is in action-list itself");
assert.match(helpText, /belong inside obj/, "obj placement is spelled out");
for (const name of ["tree_outline", "tree_show", "compact_stage", "compact_fire", "compact_status", "compact_discard"]) {
  assert.ok(helpText.includes(name), `action-list advertises ${name}`);
}
assert.match(helpText, /required obj: summary/, "required fields summarized");

const schema = await ctxTool.execute("h2", { action: "action-schema", obj: { action: "tree_outline" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(schema.isError, undefined);
const parsed = JSON.parse(textOf(schema));
assert.equal(parsed.call.action, "tree_outline");
assert.ok("obj" in parsed.call, "copyable call shows where arguments go");
assert.deepEqual(parsed.objSchema.properties.scope.enum, ["branch", "tree"]);
assert.deepEqual(parsed.objSchema.properties.focus.enum, ["all", "key"]);
assert.ok(parsed.notes.length > 0, "usage notes included");

const statusSchema = await ctxTool.execute("h3", { action: "action-schema", obj: { action: "compact_status" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(statusSchema.isError, undefined, "compact_status is discoverable via action-schema");

const badSchemaName = await ctxTool.execute("h4", { action: "action-schema", obj: { action: "nope" } }, undefined, undefined, stubCtx([]));
assert.equal(badSchemaName.isError, true);
assert.match(textOf(badSchemaName), /compact_status/, "unknown-action error lists valid names");

const badScope = await ctxTool.execute("h5", { action: "tree_outline", obj: { scope: "everywhere" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(badScope.isError, true, "invalid enum rejected instead of silently degrading");
const badFocus = await ctxTool.execute("h6", { action: "tree_outline", obj: { focus: "important" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(badFocus.isError, true);

assert.match(String(ctxTool.description), /goes inside obj/, "tool description states the contract");
assert.match(String(ctxTool.parameters.properties.obj.description), /top level/, "obj parameter states the contract");

console.log("ctx.test.ts: ok");
