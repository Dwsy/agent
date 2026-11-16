/**
 * ctx must carry file-operation tracking across the compaction boundary.
 *
 * Pi's own compact() appends <read-files>/<modified-files> to the summary it
 * generates. ctx supplies the summary itself, so it has to append the same
 * tags: without them the next agent loses track of which files were touched.
 *
 * These tests drive the real SDK session so the assertions are about what
 * actually reaches the model context.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ctxTool, resetCtxState, takeCtxCompaction } from "../src/ctx.js";
import { registerCtxLifecycle } from "../src/ctx-lifecycle.js";
import { computeCtxFileDetails } from "../src/structured.js";

// Prefer the project's SDK dependency; managed Pi installs keep it below agentDir.
let sdk: any;
try {
  sdk = await import("@earendil-works/pi-coding-agent");
} catch (error: any) {
  if (error.code !== "ERR_MODULE_NOT_FOUND" && error.code !== "MODULE_NOT_FOUND") throw error;
  const install = join(homedir(), ".pi", "agent", "install");
  const version = readFileSync(join(install, "current-version"), "utf8").trim();
  const root = join(install, "releases", version, "node_modules", "@earendil-works", "pi-coding-agent");
  sdk = await import(pathToFileURL(join(root, "dist", "core", "session-manager.js")).href);
}
const { SessionManager } = sdk;

const SUMMARY = "Checkpoint: implement the user's fix.";
const handlers = new Map<string, Function[]>();
let options: any;
const sm = SessionManager.inMemory(process.cwd());
const ctx = { hasUI: false, sessionManager: sm, abort() {}, compact(opts: any) { options = opts; } };
registerCtxLifecycle({
  on(event: string, fn: Function) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
  appendEntry(type: string, data: unknown) { sm.appendCustomEntry(type, data); },
  sendUserMessage(text: string) { sm.appendMessage({ role: "user", content: text, timestamp: Date.now() }); },
} as never, () => {});

const call = (action: string, obj: Record<string, unknown> = {}) =>
  ctxTool.execute("sdk", { action, obj }, undefined, undefined, ctx as never);

/** Stage, fire, and let the extension commit through the real hook path. */
const fire = async (summary: string, extra: Record<string, unknown> = {}) => {
  assert.equal((await call("compact_stage", { summary, ...extra })).isError, undefined);
  assert.equal((await call("compact_fire")).isError, undefined);
  for (const fn of handlers.get("agent_end") ?? []) await fn({}, ctx);
  const result = takeCtxCompaction({
    reason: "manual", customInstructions: options.customInstructions,
    branchEntries: sm.getBranch(), preparation: { tokensBefore: 321 },
  } as never);
  if (!result || !("compaction" in result)) assert.fail("expected staged compaction to be injected");
  sm.appendCompaction(result.compaction.summary, result.compaction.firstKeptEntryId, result.compaction.tokensBefore, result.compaction.details, true);
  options.onComplete(result.compaction);
  return result.compaction;
};

const projected = () => JSON.stringify(sm.buildSessionProjection().messages);

const userMsg = (text: string) => sm.appendMessage({ role: "user", content: text, timestamp: Date.now() });
const assistantTool = (name: string, args: Record<string, unknown>) =>
  sm.appendMessage({
    role: "assistant",
    content: [{ type: "toolCall", id: `call-${name}-${Math.random().toString(36).slice(2)}`, name, arguments: args }],
    timestamp: Date.now(),
  });

// ── summary-only: every dropped file operation is reported ─────────────────

resetCtxState();
userMsg("please fix the bug");
assistantTool("read", { path: "/tmp/ctx-read-only.ts" });
assistantTool("edit", { path: "/tmp/ctx-modified.ts" });
// A file that was both read and modified belongs in modified-files only.
assistantTool("read", { path: "/tmp/ctx-modified.ts" });
assistantTool("write", { path: "/tmp/ctx-written.ts" });
// Tools without a path argument are not file operations.
assistantTool("bash", { command: "ls" });

const committed = await fire(SUMMARY);
assert.ok(committed.summary.includes(SUMMARY), "the agent-written summary is preserved");
assert.ok(committed.summary.includes("<read-files>"), "read-files tag is appended");
assert.ok(committed.summary.includes("<modified-files>"), "modified-files tag is appended");
assert.ok(committed.summary.includes("/tmp/ctx-read-only.ts"), "read-only file is reported");
assert.ok(committed.summary.includes("/tmp/ctx-modified.ts"), "modified file is reported");
assert.ok(committed.summary.includes("/tmp/ctx-written.ts"), "written file is reported");

const readBlock = committed.summary.slice(committed.summary.indexOf("<read-files>"));
const readFiles = readBlock.slice(0, readBlock.indexOf("</read-files>")).split("\n").map((l: string) => l.trim()).filter(Boolean);
const modifiedBlock = committed.summary.slice(committed.summary.indexOf("<modified-files>"));
const modifiedFiles = modifiedBlock.slice(0, modifiedBlock.indexOf("</modified-files>")).split("\n").map((l: string) => l.trim()).filter(Boolean);
assert.ok(readFiles.includes("/tmp/ctx-read-only.ts"), "read-only file is listed as read");
assert.ok(!readFiles.includes("/tmp/ctx-modified.ts"), "a modified file is not also listed as read");
assert.ok(modifiedFiles.includes("/tmp/ctx-modified.ts"), "edited file is listed as modified");
assert.ok(modifiedFiles.includes("/tmp/ctx-written.ts"), "written file is listed as modified");
assert.ok(!modifiedFiles.includes("/tmp/ctx-read-only.ts"), "read-only file is not listed as modified");

// The tags must be visible to the next agent, not just to the caller.
assert.ok(projected().includes("<read-files>"), "the next turn sees the file tags");
assert.ok(projected().includes("/tmp/ctx-read-only.ts"), "the next turn sees which file was read");

// ── keep-tail: only the entries before the keep point are reported ─────────

resetCtxState();
userMsg("start of the task");
assistantTool("read", { path: "/tmp/ctx-before-keep.ts" });
userMsg("middle of the task");
const tailStart = sm.getLeafId();
assistantTool("read", { path: "/tmp/ctx-after-keep.ts" });

const tailed = await fire(SUMMARY, { retention: "keep-tail", firstKeptEntryId: tailStart });
assert.ok(tailed.summary.includes("/tmp/ctx-before-keep.ts"), "dropped file operation is reported");
assert.ok(!tailed.summary.includes("/tmp/ctx-after-keep.ts"), "retained file operation is not reported");
assert.ok(projected().includes("/tmp/ctx-after-keep.ts"), "retained tool call stays in context");

// ── a previous compaction's file list carries forward ──────────────────────

resetCtxState();
userMsg("first round");
assistantTool("read", { path: "/tmp/ctx-round-one.ts" });
const first = await fire("FIRST");
assert.ok(first.summary.includes("/tmp/ctx-round-one.ts"), "round one reports its file");

userMsg("second round");
assistantTool("edit", { path: "/tmp/ctx-round-two.ts" });
const second = await fire("SECOND");
assert.ok(second.summary.includes("/tmp/ctx-round-two.ts"), "round two reports its new file");
assert.ok(
  second.summary.includes("/tmp/ctx-round-one.ts"),
  "round two keeps round one's file list, since that history is now only a summary",
);

// ── a previous keep-tail's retained tail is dropped by the next compaction ──
//
// The raw branch still holds the tail entries the previous keep-tail kept,
// even though the model only saw a summary. The next compaction drops them
// too, so their file operations must be reported.
resetCtxState();
userMsg("round one");
const tailKeep = sm.getLeafId();
assistantTool("read", { path: "/tmp/ctx-tail-discarded-earlier.ts" });
assistantTool("read", { path: "/tmp/ctx-tail-retained.ts" });
const tailedRound = await fire("ROUND_ONE", { retention: "keep-tail", firstKeptEntryId: tailKeep });
assert.ok(!tailedRound.summary.includes("/tmp/ctx-tail-discarded-earlier.ts"), "everything from the keep point on is retained");
assert.ok(!tailedRound.summary.includes("/tmp/ctx-tail-retained.ts"), "the retained tail stays out of the tags");

// The next round drops the retained tail as well.
userMsg("round two");
const afterTail = await fire("ROUND_TWO");
assert.ok(
  afterTail.summary.includes("/tmp/ctx-tail-retained.ts"),
  "the previous keep-tail's retained tail is dropped by this compaction, so it is reported",
);
assert.ok(
  afterTail.summary.includes("/tmp/ctx-tail-discarded-earlier.ts"),
  "the file list stays cumulative across compactions",
);

// ── unit level: the discarded range drives the result ──────────────────────

const entries = [
  { type: "message", id: "u", parentId: null, timestamp: "t", message: { role: "user", content: "go" } },
  { type: "message", id: "a", parentId: "u", timestamp: "t", message: {
      role: "assistant",
      content: [
        { type: "toolCall", id: "c1", name: "read", arguments: { path: "/tmp/unit-read.ts" } },
        { type: "toolCall", id: "c2", name: "write", arguments: { path: "/tmp/unit-write.ts" } },
      ],
  } },
  { type: "custom", id: "keep", parentId: "a", timestamp: "t", customType: "ctx-compaction-boundary", data: {} },
] as never[];

const summaryOnly = computeCtxFileDetails(entries, "keep");
assert.deepEqual(summaryOnly.readFiles, ["/tmp/unit-read.ts"]);
assert.deepEqual(summaryOnly.modifiedFiles, ["/tmp/unit-write.ts"]);

const keepTail = computeCtxFileDetails(entries, "u");
assert.deepEqual(keepTail.readFiles, [], "nothing is dropped before the keep point");
assert.deepEqual(keepTail.modifiedFiles, []);

// A compaction entry inside the range owns the history before it.
const withPrevCompaction = [
  { type: "compaction", id: "p", parentId: null, timestamp: "t", summary: "earlier\n\n<read-files>\n/tmp/prev.ts\n</read-files>", firstKeptEntryId: "x", tokensBefore: 1 },
  { type: "message", id: "a2", parentId: "p", timestamp: "t", message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "c3", name: "read", arguments: { path: "/tmp/after-prev.ts" } }],
  } },
  { type: "custom", id: "keep2", parentId: "a2", timestamp: "t", customType: "ctx-compaction-boundary", data: {} },
] as never[];
const carried = computeCtxFileDetails(withPrevCompaction, "keep2");
assert.deepEqual(carried.readFiles, ["/tmp/after-prev.ts", "/tmp/prev.ts"], "the previous summary's file list is carried forward");
assert.deepEqual(carried.modifiedFiles, []);

// The previous compaction's retained tail sits before the compaction entry in
// raw order, and ctx drops it too, so its file operations must be reported.
const withRetainedTail = [
  { type: "message", id: "old", parentId: null, timestamp: "t", message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "c0", name: "read", arguments: { path: "/tmp/already-summarized.ts" } }],
  } },
  { type: "message", id: "tail", parentId: "old", timestamp: "t", message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "c1", name: "read", arguments: { path: "/tmp/retained-tail.ts" } }],
  } },
  { type: "compaction", id: "p2", parentId: "tail", timestamp: "t", summary: "earlier", firstKeptEntryId: "tail", tokensBefore: 1 },
  { type: "message", id: "new", parentId: "p2", timestamp: "t", message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "c2", name: "read", arguments: { path: "/tmp/after-prev.ts" } }],
  } },
  { type: "custom", id: "keep3", parentId: "new", timestamp: "t", customType: "ctx-compaction-boundary", data: {} },
] as never[];
const withTail = computeCtxFileDetails(withRetainedTail, "keep3");
assert.deepEqual(
  withTail.readFiles,
  ["/tmp/after-prev.ts", "/tmp/retained-tail.ts"],
  "the previous compaction's retained tail is still dropped by ctx, so it is reported",
);
assert.ok(
  !withTail.readFiles.includes("/tmp/already-summarized.ts"),
  "entries the previous compaction already summarised are not re-reported",
);

resetCtxState();
console.log("ctx-file-details.test.ts: ok (summary-only tags, keep-tail range, cumulative carry-forward)");
