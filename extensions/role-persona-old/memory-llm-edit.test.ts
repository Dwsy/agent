import { mock, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let responseText = "{}";

mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({
    stopReason: "end",
    content: [{ type: "text", text: responseText }],
  }),
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  convertToLlm: (messages: unknown[]) => messages,
  serializeConversation: (messages: unknown[]) => JSON.stringify(messages),
}));

const { runAutoMemoryExtraction } = await import("./memory-llm.ts");
const { addRoleLearning, addRolePreference, ensureRoleMemoryFiles, readRoleMemory } = await import("./memory-md.ts");

test("auto extraction edits existing learning and preference by id", async () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-memory-edit-"));
  const roleName = "test-role";

  try {
    ensureRoleMemoryFiles(rolePath, roleName);
    const learning = addRoleLearning(rolePath, roleName, "Use idempotent writes for durable state", { appendDaily: false });
    const preference = addRolePreference(rolePath, roleName, "Communication", "Use concise technical replies", { appendDaily: false });
    assert.ok(learning.id);
    assert.ok(preference.id);

    responseText = JSON.stringify({
      learnings: [{ text: "Prefer stable identifiers for audit records" }],
      preferences: [],
      edits: [
        { type: "learning", id: learning.id, text: "Prefer idempotent writes for durable state" },
        { type: "preference", id: preference.id, text: "Prefer concise technical replies" },
      ],
    });

    const model = { provider: "test", id: "memory", name: "memory", contextWindow: 4096, maxTokens: 512 };
    const result = await runAutoMemoryExtraction(
      roleName,
      rolePath,
      {
        model,
        modelRegistry: {
          getAll: () => [model],
          getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key" }),
        },
      } as any,
      [{ role: "user", content: [{ type: "text", text: "The wording should be more precise." }] }],
      { model: "test/memory", maxItems: 3, maxText: 120 },
    );

    assert.deepEqual(
      {
        storedLearnings: result?.storedLearnings,
        updatedLearnings: result?.updatedLearnings,
        updatedPrefs: result?.updatedPrefs,
        operations: result?.items.map((item) => ({ op: item.op, stored: item.stored })),
      },
      {
        storedLearnings: 1,
        updatedLearnings: 1,
        updatedPrefs: 1,
        operations: [
          { op: "update_learning", stored: true },
          { op: "update_preference", stored: true },
          { op: "learning", stored: true },
        ],
      },
    );
    const data = readRoleMemory(rolePath, roleName);
    assert.equal(data.learnings[0]?.text, "Prefer idempotent writes for durable state");
    assert.equal(data.preferences[0]?.text, "Prefer concise technical replies");
    assert.equal(data.preferences[0]?.category, "Communication");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});
