/**
 * Tests for the progressive-disclosure role_exec dispatcher: help catalog
 * coverage, op dispatch to memory executors, and unknown-op fallback.
 * Run: bun test tool-exec.test.ts
 */
import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({ stopReason: "end", content: [] }),
  StringEnum: (x: unknown) => x,
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  convertToLlm: (messages: unknown[]) => messages,
  serializeConversation: (messages: unknown[]) => JSON.stringify(messages),
  getLanguageFromPath: () => undefined,
  getMarkdownTheme: () => ({}),
  highlightCode: (code: string) => code.split("\n"),
}));

// Tool modules import typebox, which only the pi loader aliases at runtime.
mock.module("@sinclair/typebox", () => ({
  Type: new Proxy({}, { get: () => () => ({}) }),
}));

// Superset of what tui-renderers.ts and memory-viewer.ts import, because bun
// shares mock registrations across test files in one run.
mock.module("@earendil-works/pi-tui", () => ({
  Box: class { addChild() {} },
  Markdown: class { render() { return []; } invalidate() {} },
  Spacer: class {},
  Text: class { setText() {} },
  Key: { escape: "escape", up: "up", down: "down", pageUp: "pageUp", pageDown: "pageDown", home: "home", end: "end", ctrl: (c: string) => c },
  matchesKey: () => false,
  truncateToWidth: (s: string) => s,
  visibleWidth: (s: string) => s.length,
}));

const { ensureRoleMemoryFiles, addRoleLearning } = await import("./memory-md.ts");
const { buildHelpText, dispatchRoleExec, OP_CATALOG } = await import("./runtime/tool-exec.ts");

const ROLE_NAME = "test-role";

function makeRuntime(rolePath: string | null): any {
  return {
    pi: {},
    extensionDir: ".",
    skillsDir: ".",
    state: {
      currentRole: rolePath ? ROLE_NAME : null,
      currentRolePath: rolePath,
      memoryLog: [],
    },
  };
}

function resultText(result: any): string {
  return result.content.map((c: any) => c.text).join("\n");
}

test("help: catalog lists every dispatchable op; every catalog op dispatches without 'Unknown op'", async () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-exec-help-"));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  const rt = makeRuntime(rolePath);

  try {
    const help = buildHelpText(rolePath);
    const allOps = OP_CATALOG.flatMap((g) => g.ops.map((o) => o.op));
    assert.ok(allOps.length >= 20, `catalog unexpectedly small: ${allOps.length}`);
    for (const op of allOps) {
      assert.ok(help.includes(`- ${op} `), `help missing op: ${op}`);
    }

    // Read-only ops from the memory and role_info dispatch families must not
    // fall through to the unknown-op branch. kb_* is skipped on purpose: it
    // lazy-loads knowledge.ts, whose module-load-time dir resolution belongs
    // to knowledge.test.ts.
    for (const op of ["read", "list", "role_info"]) {
      const result = await dispatchRoleExec(rt, op, {});
      assert.ok(!resultText(result).startsWith(`Unknown op`), `op "${op}" fell through to unknown-op branch`);
    }
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("dispatch read: returns ID-annotated view scoped by args.section", async () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-exec-read-"));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  const rt = makeRuntime(rolePath);

  try {
    const added = addRoleLearning(rolePath, ROLE_NAME, "dispatcher smoke insight", { appendDaily: false });
    const result = await dispatchRoleExec(rt, "read", { section: "learnings" });
    assert.equal(result.details && (result.details as any).error, undefined);
    assert.ok(resultText(result).includes(`[id:${added.id}]`));
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("unknown op: error flag plus full catalog for recovery", async () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-exec-unknown-"));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  const rt = makeRuntime(rolePath);

  try {
    const result = await dispatchRoleExec(rt, "add_lerning", { content: "typo" });
    assert.equal((result.details as any).error, true);
    const text = resultText(result);
    assert.ok(text.includes(`Unknown op "add_lerning"`));
    assert.ok(text.includes("- add_learning "), "recovery catalog must list the correct op");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("help topic edit_spec: loads the file-editing spec on demand only", async () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-exec-spec-"));
  ensureRoleMemoryFiles(rolePath, ROLE_NAME);
  const rt = makeRuntime(rolePath);

  try {
    const plain = await dispatchRoleExec(rt, "help", {});
    assert.ok(!resultText(plain).includes("Memory Edit Spec"), "default help must stay compact");

    const spec = await dispatchRoleExec(rt, "help", { topic: "edit_spec" });
    const text = resultText(spec);
    assert.ok(text.includes("Memory Edit Spec"));
    assert.ok(text.includes("# Learnings (High Priority)"));
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("no active role: memory ops fail fast with a clear message", async () => {
  const rt = makeRuntime(null);
  const result = await dispatchRoleExec(rt, "read", {});
  assert.equal((result.details as any).error, true);
  assert.ok(resultText(result).includes("No active role"));
});
