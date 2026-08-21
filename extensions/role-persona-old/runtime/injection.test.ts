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
const { buildMemoryPrompt } = await import("./injection.ts");

const ROLE = "injection-test";

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
