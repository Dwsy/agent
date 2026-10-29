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
}));

mock.module("@earendil-works/pi-tui", () => ({
  Container: class {},
  SelectList: class {},
  Text: class {},
}));

const { addRoleEvent, ensureRoleMemoryFiles } = await import("../memory-md.ts");
const { reloadConfig } = await import("../config.ts");
const { buildMemoryPrompt } = await import("./injection.ts");

const ROLE = "injection-test";

function createRuntime(rolePath: string) {
  return {
    state: {
      currentRole: ROLE,
      currentRolePath: rolePath,
      memoryPromptSnapshot: null,
      memoryPromptConfigKey: null,
    },
  } as any;
}

test("session memory snapshot does not change after role memory is written", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-injection-"));
  try {
    ensureRoleMemoryFiles(rolePath, ROLE);
    addRoleEvent(rolePath, ROLE, "initial event", { title: "Initial", appendDaily: false });

    const rt = {
      state: {
        currentRole: ROLE,
        currentRolePath: rolePath,
        memoryPromptSnapshot: null,
      },
    } as any;
    const first = buildMemoryPrompt(rt);

    addRoleEvent(rolePath, ROLE, "background event added after snapshot", { title: "Background", appendDaily: false });
    const second = buildMemoryPrompt(rt);

    assert.equal(second, first);
    assert.ok(!second.includes("Background"));
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("master switch off injects no memory at all", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-injection-off-"));
  process.env.ROLE_MEMORY_INJECTION = "0";
  try {
    ensureRoleMemoryFiles(rolePath, ROLE);
    addRoleEvent(rolePath, ROLE, "must not reach the prompt", { title: "Hidden", appendDaily: true });
    reloadConfig();

    assert.equal(buildMemoryPrompt(createRuntime(rolePath)), "");
  } finally {
    delete process.env.ROLE_MEMORY_INJECTION;
    reloadConfig();
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("longTerm switch off drops consolidated memory while daily injection stays independent", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-injection-longterm-"));
  process.env.ROLE_LONGTERM_INJECTION = "0";
  process.env.ROLE_DAILY_INJECTION = "1";
  try {
    ensureRoleMemoryFiles(rolePath, ROLE);
    addRoleEvent(rolePath, ROLE, "consolidated entry", { title: "ConsolidatedOnly", appendDaily: true });
    reloadConfig();

    const prompt = buildMemoryPrompt(createRuntime(rolePath));

    assert.ok(!prompt.includes("Long-Term Memory"));
    assert.ok(!prompt.includes("[id:"));
    assert.ok(prompt.includes("Daily"));
  } finally {
    delete process.env.ROLE_LONGTERM_INJECTION;
    delete process.env.ROLE_DAILY_INJECTION;
    reloadConfig();
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("turning injection off mid-session drops the frozen snapshot", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-injection-toggle-"));
  try {
    ensureRoleMemoryFiles(rolePath, ROLE);
    addRoleEvent(rolePath, ROLE, "visible while enabled", { title: "Visible", appendDaily: false });
    reloadConfig();

    const rt = createRuntime(rolePath);
    assert.ok(buildMemoryPrompt(rt).includes("## Your Memory"));

    process.env.ROLE_MEMORY_INJECTION = "0";
    reloadConfig();

    assert.equal(buildMemoryPrompt(rt), "");
  } finally {
    delete process.env.ROLE_MEMORY_INJECTION;
    reloadConfig();
    rmSync(rolePath, { recursive: true, force: true });
  }
});
