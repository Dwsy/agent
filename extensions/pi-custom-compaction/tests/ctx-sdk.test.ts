import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ctxTool, resetCtxState, takeCtxCompaction } from "../src/ctx.js";
import { registerCtxLifecycle } from "../src/ctx-lifecycle.js";

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
const sm = SessionManager.inMemory(process.cwd());
const OLD = "OLD_DIALOGUE_MUST_NOT_BE_REINJECTED";
const TOOL = "OLD_TOOL_BODY_MUST_NOT_BE_REINJECTED";
const SUMMARY = "Checkpoint: implement the user's fix.";
const handlers = new Map<string, Function[]>();
let options: any;
const ctx = { hasUI: false, sessionManager: sm, abort() {}, compact(opts: any) { options = opts; } };
registerCtxLifecycle({
  on(event: string, fn: Function) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
  appendEntry(type: string, data: unknown) { sm.appendCustomEntry(type, data); },
  sendUserMessage(text: string) { sm.appendMessage({ role: "user", content: text, timestamp: Date.now() }); },
} as never, () => {});
const call = (action: string, obj: Record<string, unknown> = {}) =>
  ctxTool.execute("sdk", { action, obj }, undefined, undefined, ctx as never);
const fire = async () => {
  assert.equal((await call("compact_fire")).isError, undefined);
  for (const fn of handlers.get("agent_end") ?? []) await fn({}, ctx);
  const result = takeCtxCompaction({
    reason: "manual", customInstructions: options.customInstructions,
    branchEntries: sm.getBranch(), preparation: { tokensBefore: 321 },
  } as never);
  if (!result || !("compaction" in result)) assert.fail("expected staged compaction to be injected");
  const c = result.compaction;
  sm.appendCompaction(c.summary, c.firstKeptEntryId, c.tokensBefore, c.details, true);
  options.onComplete(c);
};
const appendHistory = () => {
  sm.appendMessage({ role: "user", content: OLD, timestamp: Date.now() });
  sm.appendMessage({ role: "assistant", content: [
    { type: "toolCall", id: "call-old", name: "read", arguments: { path: "old.ts" } },
  ], timestamp: Date.now() });
  sm.appendMessage({ role: "toolResult", toolCallId: "call-old", toolName: "read",
    content: [{ type: "text", text: TOOL }], isError: false, timestamp: Date.now() });
};
const projected = () => JSON.stringify(sm.buildSessionProjection().messages);

resetCtxState();
appendHistory();
assert.equal((await call("compact_stage", { summary: SUMMARY })).isError, undefined);
// Emulate tool protocol entries written after stage, which must also disappear.
sm.appendMessage({ role: "user", content: "OLD_STAGE_FIRE_PROTOCOL", timestamp: Date.now() });
await fire();
assert.ok(projected().includes(SUMMARY));
assert.ok(!projected().includes(OLD), "old user message excluded from the model projection");
assert.ok(!projected().includes(TOOL), "old tool result excluded from the model projection");
assert.ok(!projected().includes("OLD_STAGE_FIRE_PROTOCOL"), "stage/fire dialogue excluded too");
assert.ok(sm.getEntries().some((e: any) => e.message?.content === OLD), "raw history is still available for inspection");
sm.appendMessage({ role: "user", content: "NEW_USER_MESSAGE", timestamp: Date.now() });
assert.ok(projected().includes("NEW_USER_MESSAGE"));
assert.ok(!projected().includes(TOOL), "next turn cannot reintroduce old tool output");

// Repeat after a previous compaction; none of the old summaries/tails may leak.
assert.equal((await call("compact_stage", { summary: "SECOND_CHECKPOINT", resume: "RESUME_MESSAGE" })).isError, undefined);
await fire();
assert.ok(projected().includes("SECOND_CHECKPOINT"));
assert.ok(projected().includes("RESUME_MESSAGE"));
assert.ok(!projected().includes(SUMMARY));
assert.ok(!projected().includes("NEW_USER_MESSAGE"));
assert.ok(!projected().includes(TOOL));

// keep-tail intentionally retains raw history, with a distinct explicit contract.
resetCtxState();
appendHistory();
const keep = sm.getLeafId();
assert.equal((await call("compact_stage", { summary: "KEEP_CHECKPOINT", retention: "keep-tail", firstKeptEntryId: keep })).isError, undefined);
await fire();
assert.ok(projected().includes("KEEP_CHECKPOINT"));
assert.ok(projected().includes(TOOL), "explicit keep-tail retains its selected raw tool body");
resetCtxState();
console.log("ctx-sdk.test.ts: real SDK projection ok (summary-only, next turn, repeated compaction, keep-tail)");
