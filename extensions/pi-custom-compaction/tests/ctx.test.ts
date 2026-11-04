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
  markCtxFireTriggered,
  peekCtxPending,
  peekCtxFireRequest,
  setCtxLastResult,
  signalsOf,
  takeCtxCompaction,
  takeCtxFireRequest,
  takeCtxFireTriggered,
  ctxTool,
} from "../src/ctx.js";

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

// ── stage validates against the branch, not the file ──

const fakeEvent = (ids: string[]) =>
  ({ branchEntries: ids.map((id) => ({ id })), preparation: { tokensBefore: 7 } }) as never;

// Counts ctx.compact() calls: the deferred design forbids triggering from the tool.
let compactCalls = 0;
const stubCtx = (branchIds: string[]) => {
  const byId = new Map(branch.map((e) => [(e as { id: string }).id, e]));
  return {
    sessionManager: {
      getTree: () => tree,
      getBranch: () => branch.filter((e) => branchIds.includes((e as { id: string }).id)),
      getEntries: () => branch,
      getEntry: (id: string) => byId.get(id),
      getLabel: () => undefined,
      getLeafId: () => "c",
    },
    compact: () => { compactCalls++; },
  } as never;
};

const offBranch = await ctxTool.execute("t1", { action: "compact_stage", obj: { summary: "s", firstKeptEntryId: "z" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(offBranch.isError, true, "dead-branch point rejected at stage");
assert.equal(peekCtxPending(), null);

const staged = await ctxTool.execute("t2", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(staged.isError, undefined);
const consumed = takeCtxCompaction(fakeEvent(["a", "b", "r", "c"]));
assert.ok(consumed);
assert.ok("compaction" in consumed);
assert.equal(consumed.compaction.tokensBefore, 7);
assert.equal(peekCtxPending(), null);

// compact_fire is fire-and-forget: must not await compact inside the tool
// (manual compact waits for idle -> deadlock). Stage stays for the handler.
const staged2 = await ctxTool.execute("t5", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(staged2.isError, undefined);
const fired = await ctxTool.execute("t6", { action: "compact_fire", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(fired.isError, undefined);
assert.match(String(fired.content[0].text), /armed/);
assert.ok(peekCtxPending(), "fire leaves stage for session_before_compact");
assert.equal(peekCtxFireRequest(), true, "fire arms deferred trigger");
assert.equal(takeCtxFireRequest(), true, "agent_end consumes the flag");
assert.equal(peekCtxFireRequest(), false);
assert.equal(takeCtxFireRequest(), false, "flag single-consume");
assert.equal(compactCalls, 0, "fire never triggers compact from the tool");
const consumed2 = takeCtxCompaction(fakeEvent(["a", "b", "r", "c"]));
assert.ok(consumed2 && "compaction" in consumed2);
assert.equal(peekCtxPending(), null);
const emptyFire = await ctxTool.execute("t7", { action: "compact_fire", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(emptyFire.isError, true, "fire without stage rejected");

// ── outcome flags: silent until the agent_end trigger marks them ──
assert.equal(takeCtxFireTriggered(), false, "no outcome before trigger");
markCtxFireTriggered();
assert.equal(takeCtxFireTriggered(), true, "outcome consumed once");
assert.equal(takeCtxFireTriggered(), false, "outcome single-consume");

// ── stale keep-point: handler reports invalidPoint, stage cleared ──
const staged3 = await ctxTool.execute("t8", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(staged3.isError, undefined);
assert.equal(peekCtxFireRequest(), false, "fresh stage disarms stale flag");
const fired3 = await ctxTool.execute("t9", { action: "compact_fire", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(fired3.isError, undefined);
assert.equal(compactCalls, 0, "re-fire still defers");
assert.equal(takeCtxFireRequest(), true);
const stale = takeCtxCompaction(fakeEvent(["a", "r", "c"]));
assert.ok(stale && "invalidPoint" in stale, "stale point reported");
assert.equal(stale.invalidPoint, "b");
assert.equal(peekCtxPending(), null);

// ── discard disarms: armed flag must not leak into a later stage ──
const staged4 = await ctxTool.execute("t10", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(staged4.isError, undefined);
await ctxTool.execute("t11", { action: "compact_fire", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(peekCtxFireRequest(), true);
assert.equal(discardCtxPending(), true);
assert.equal(peekCtxFireRequest(), false, "discard disarms");
assert.equal(peekCtxPending(), null);
assert.equal(compactCalls, 0);

// outline through the tool: key focus + cache path
clearOutlineCache();
const outline1 = await ctxTool.execute("t4", { action: "tree_outline", obj: { focus: "key", limit: 2 } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(outline1.isError, undefined);
assert.match(String(outline1.content[0].text), /scope=branch/);

// unknown action still rejected
const unknown = await ctxTool.execute("t3", { action: "nope", obj: {} }, undefined, undefined, stubCtx([]));
assert.equal(unknown.isError, true);

// ── compact_status: state queryable in any host mode (no UI needed) ──
const idleStatus = await ctxTool.execute("t12", { action: "compact_status", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(idleStatus.isError, undefined);
const idle = JSON.parse(String(idleStatus.content[0].text));
assert.equal(idle.staged, false);
assert.equal(idle.armed, false);
assert.equal(idle.lastResult, null);
const staged5 = await ctxTool.execute("t13", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b" } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(staged5.isError, undefined);
const busyStatus = await ctxTool.execute("t14", { action: "compact_status", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(busyStatus.isError, undefined);
const busy = JSON.parse(String(busyStatus.content[0].text));
assert.equal(busy.staged, true);
assert.equal(busy.firstKeptEntryId, "b");
assert.equal(busy.armed, false);
setCtxLastResult("committed");
const withResult = JSON.parse(String((await ctxTool.execute("t15", { action: "compact_status", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]))).content[0].text));
assert.equal(withResult.lastResult, "committed");
assert.equal(discardCtxPending(), true);

assert.equal(discardCtxPending(), false);

// ── resume: optional user message after a committed compaction ──
const withResume = await ctxTool.execute("t16", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b", resume: "  continue verifying  " } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(withResume.isError, undefined);
assert.match(String(withResume.content[0].text), /resume=\d+ chars/);
assert.equal(peekCtxPending()?.resume, "continue verifying", "resume trimmed");
const resumeStatus = JSON.parse(String((await ctxTool.execute("t17", { action: "compact_status", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]))).content[0].text));
assert.equal(resumeStatus.resumeArmed, true);
assert.equal(resumeStatus.staged, true);
// consume path: session_before_compact takes the whole stage (handler copies resume first)
const consumedResume = takeCtxCompaction(fakeEvent(["a", "b", "r", "c"]));
assert.ok(consumedResume && "compaction" in consumedResume);
assert.equal(peekCtxPending(), null);

const tooLong = await ctxTool.execute("t18", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b", resume: "x".repeat(2001) } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(tooLong.isError, true, "oversize resume rejected");
assert.equal(peekCtxPending(), null);

const emptyResume = await ctxTool.execute("t19", { action: "compact_stage", obj: { summary: "## Goal\nx", firstKeptEntryId: "b", resume: "   " } }, undefined, undefined, stubCtx(["a", "b", "r", "c"]));
assert.equal(emptyResume.isError, undefined);
assert.equal(peekCtxPending()?.resume, undefined, "blank resume means no resume");
const noResumeStatus = JSON.parse(String((await ctxTool.execute("t20", { action: "compact_status", obj: {} }, undefined, undefined, stubCtx(["a", "b", "r", "c"]))).content[0].text));
assert.equal(noResumeStatus.resumeArmed, false);
assert.equal(discardCtxPending(), true);

console.log("ctx.test.ts: ok");
