/**
 * Compaction-time memory extraction. Shared handoff: pi-custom-compaction
 * supplies the summary, role-persona supplies the extraction instruction and
 * persistence. Zero extra LLM calls — the compaction call returns both the
 * summary and a <memory> JSON block.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compact as piCompact } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import { config } from "../config.ts";
import { writeKnowledge } from "../knowledge.ts";
import { log, setCurrentRole } from "../logger.ts";
import {
  addRoleEvent,
  addRolePreference,
  readRoleMemory,
  updateRoleLearning,
  updateRolePreference,
} from "../memory-md.ts";
import { queueVectorIndex, replaceVectorIndex } from "../memory-vector.ts";
import { setMemoryCheckpointResult } from "./auto-memory.ts";
import { memLogPush, type Runtime } from "./context.ts";

const COMPACTION_MEMORY_HANDOFF_SYMBOL = Symbol.for("role-persona-old.compaction-memory-handoff");

export interface CompactionMemoryHandoff {
  createInstructions(ctx: ExtensionContext): string | undefined;
  consumeSummary(summary: string, ctx: ExtensionContext): Promise<string>;
}

function createHandoff(rt: Runtime): CompactionMemoryHandoff {
  return {
    createInstructions(_ctx: ExtensionContext): string | undefined {
      const { currentRole, currentRolePath } = rt.state;
      if (!config.autoMemory.enabled || !currentRole || !currentRolePath) return;

      const memory = readRoleMemory(currentRolePath, currentRole);
      const editableMemory = [
        ...memory.learnings.map((item) => `- [learning:${item.id}] ${item.text}`),
        ...memory.preferences.map((item) => `- [preference:${item.id}] [${item.category}] ${item.text}`),
      ].join("\n") || "(none)";

      return `

IMPORTANT: Write the session summary in CHINESE (中文). The summary should capture the main discussion points and outcomes in Chinese.

In addition to the summary, extract key memories and knowledge from this conversation.
Output them in a <memory> block at the END of your response, after the Chinese summary.
The memory block content must remain in ENGLISH.

Format:

<memory>
[
  {"type": "learning", "content": "concise durable insight or pattern"},
  {"type": "preference", "content": "user preference or habit", "category": "Communication|Code|Tools|Workflow|General"},
  {"type": "edit", "target": "learning", "id": "existing-learning-id", "content": "complete replacement text"},
  {"type": "edit", "target": "preference", "id": "existing-preference-id", "content": "complete replacement text", "category": "Communication|Code|Tools|Workflow|General"},
  {"type": "event", "content": "significant event or milestone"},
  {"type": "knowledge", "title": "Knowledge Title", "description": "One-line summary", "content": "Reusable artifact: pattern, decision, rule, checklist, or architectural convention", "category": "Code|Design|Architecture|Workflow|Tools|General", "tags": ["tag1"]}
 ]
</memory>

Existing editable learning/preferences (use an exact id for edits; do not invent ids):
${editableMemory}

Rules:
- Summary: MUST be written in Chinese (中文).
- Memory block: MUST remain in English for storage consistency.
- New learning entries go to the PENDING layer for verification; new preferences are stored directly in consolidated memory.
- "edit" only targets existing consolidated learning/preferences shown above.
- "learning": durable cross-session facts, patterns, rules discovered. Suggest 1-3 relevant tags.
- "preference": user communication style, habits, tool preferences.
- "event": significant session-level events or milestones worth noting.
- "knowledge": reusable artifacts worth promoting to the knowledge base. Examples: code patterns, architectural decisions, established conventions, checklists, SOPs.
- "edit": replace an existing learning or preference only when the conversation clearly corrects or supersedes it; use the exact id above. Do not edit based on one-off task status.
- Prefer quality over quantity: extract fewer, higher-value items.
- Keep memory content under 120 characters.
- Max ${config.autoMemory.maxItems} memory items total (knowledge and event items do not count toward this limit).
- Skip the <memory> block entirely if nothing worth remembering.
- The <memory> block must contain valid JSON inside the tags.`;
    },

    async consumeSummary(summary: string, ctx: ExtensionContext): Promise<string> {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) return summary;

      const memoryMatch = summary.match(/<memory>\s*([\s\S]*?)\s*<\/memory>/);
      if (!memoryMatch) {
        log("compact-memory", "no <memory> block in compaction output");
        return summary;
      }

      const cleanedSummary = summary.replace(/<memory>[\s\S]*?<\/memory>/, "").trimEnd();
      const rolePath = currentRolePath;
      const roleName = currentRole;
      setCurrentRole(roleName);

      try {
        const items = JSON.parse(memoryMatch[1]) as Array<{
          type: string;
          content?: string;
          category?: string;
          tags?: string[];
          title?: string;
          description?: string;
          target?: "learning" | "preference";
          id?: string;
        }> ;

        let storedL = 0, storedP = 0, updatedL = 0, updatedP = 0;
        const editableMemory = readRoleMemory(rolePath, roleName);
        const editableLearningIds = new Set(editableMemory.learnings.map((item) => item.id));
        const editablePreferenceIds = new Set(editableMemory.preferences.map((item) => item.id));
        for (const item of items) {
          if (item.type === "edit") {
            const editOp = item.target === "preference" ? "update_preference" : "update_learning";
            if (!item.id || !item.content?.trim()) {
              memLogPush(rt, { source: "compaction", op: editOp, content: item.content || "", id: item.id, stored: false, detail: "invalid edit" });
              continue;
            }
            if (item.target === "learning") {
              if (!editableLearningIds.has(item.id)) {
                memLogPush(rt, { source: "compaction", op: "update_learning", content: item.content, id: item.id, stored: false, detail: "unknown id" });
                log("compact-memory", `skip learning edit (unknown id): ${item.id}`);
                continue;
              }
              const result = updateRoleLearning(rolePath, roleName, item.id, item.content);
              memLogPush(rt, { source: "compaction", op: "update_learning", content: item.content, previous: result.oldText, id: result.id, oldId: result.oldId, stored: result.updated, detail: result.reason || result.id });
              if (result.updated) {
                updatedL++;
                editableLearningIds.delete(item.id);
                if (result.id && result.newText && config.vectorMemory?.autoIndex) {
                  replaceVectorIndex(result.oldId!, result.id, result.newText, "learning");
                }
              }
            } else if (item.target === "preference") {
              if (!editablePreferenceIds.has(item.id)) {
                memLogPush(rt, { source: "compaction", op: "update_preference", content: item.content, id: item.id, stored: false, detail: "unknown id" });
                log("compact-memory", `skip preference edit (unknown id): ${item.id}`);
                continue;
              }
              const result = updateRolePreference(rolePath, roleName, item.id, item.content, item.category);
              memLogPush(rt, { source: "compaction", op: "update_preference", content: item.content, previous: result.oldText, id: result.id, oldId: result.oldId, category: result.category, stored: result.updated, detail: result.reason || result.id });
              if (result.updated) {
                updatedP++;
                editablePreferenceIds.delete(item.id);
                if (result.id && result.newText && config.vectorMemory?.autoIndex) {
                  replaceVectorIndex(result.oldId!, result.id, result.newText, "preference", result.category);
                }
              }
            }
            continue;
          }
          if (item.type === "learning") {
            if (!item.content?.trim()) continue;
            const { addRoleLearningWithTags } = await import("../memory-md.ts");
            const result = await addRoleLearningWithTags(ctx, rolePath, roleName, item.content, {
              source: "compaction",
              appendDaily: true,
            });
            memLogPush(rt, { source: "compaction", op: "learning", content: item.content, id: result.id, stored: result.stored, detail: result.reason });
            if (result.stored) storedL++;
            continue;
          }
          if (item.type === "preference") {
            if (!item.content?.trim()) continue;
            const result = addRolePreference(rolePath, roleName, item.category || "General", item.content, {
              appendDaily: true,
            });
            memLogPush(rt, { source: "compaction", op: "preference", content: item.content, id: result.id, category: result.category, stored: result.stored, detail: item.category });
            if (result.stored) storedP++;
            continue;
          }
          if (item.type === "event") {
            if (!item.content?.trim()) continue;
            const result = addRoleEvent(rolePath, roleName, item.content, { appendDaily: true });
            memLogPush(rt, { source: "compaction", op: "event", content: item.content, id: result.id, stored: result.stored, detail: result.reason });
            if (result.stored && result.id && config.vectorMemory?.autoIndex) {
              queueVectorIndex(result.id, item.content, "event");
            }
            continue;
          }
          if (item.type === "knowledge") {
            if (!item.title?.trim() || !item.content?.trim()) continue;
            const result = writeKnowledge(rolePath, {
              title: item.title,
              description: item.description || "",
              content: item.content,
              category: item.category || "General",
              tags: item.tags || [],
            });
            memLogPush(rt, {
              source: "compaction",
              op: "knowledge",
              content: `${result.category}/${basename(result.written)}`,
              stored: true,
              detail: `v${result.version}`,
            });
            log("compact-memory", `+knowledge: ${result.category}/${basename(result.written)} v${result.version}`);
          }
        }

        log("compact-memory", `extracted +${storedL}L +${storedP}P ~${updatedL}L ~${updatedP}P from compaction`);
        setMemoryCheckpointResult(ctx, "compaction", storedL + updatedL, storedP + updatedP);
      } catch (error) {
        log("compact-memory", `failed to parse or persist <memory> JSON: ${error}`);
      }

      return cleanedSummary;
    },
  };
}

export interface CompactionIntegration {
  publish(): void;
  unpublish(): void;
}

/**
 * Registers the session_before_compact handler and publishes the handoff
 * object for pi-custom-compaction. Returns publish/unpublish controls used
 * by the session lifecycle.
 */
export function registerCompaction(rt: Runtime): CompactionIntegration {
  const handoff = createHandoff(rt);

  const publish = (): void => {
    (globalThis as Record<symbol, unknown>)[COMPACTION_MEMORY_HANDOFF_SYMBOL] = handoff;
  };
  const unpublish = (): void => {
    const globals = globalThis as Record<symbol, unknown>;
    if (globals[COMPACTION_MEMORY_HANDOFF_SYMBOL] === handoff) {
      delete globals[COMPACTION_MEMORY_HANDOFF_SYMBOL];
    }
  };
  publish();

  rt.pi.on("session_before_compact", async (event, ctx) => {
    const customCompactionOwner = (globalThis as any)[Symbol.for("pi-custom-compaction.owner")];
    if (customCompactionOwner?.shouldOwn?.(ctx)) {
      log("compact-memory", "custom compaction owns the checkpoint; handing memory extraction to it");
      return;
    }

    const memoryInstructions = handoff.createInstructions(ctx);
    if (!memoryInstructions) return;

    const { preparation, signal } = event;
    const model = ctx.model;
    if (!model) return;

    const registry = ctx.modelRegistry as any;
    if (!registry || typeof registry.getApiKeyAndHeaders !== "function") {
      log("compact-memory", "modelRegistry.getApiKeyAndHeaders not available");
      return;
    }
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) {
      log("compact-memory", `no apiKey available: ${auth.error || "unknown"}`);
      return;
    }

    log("compact-memory", `intercepting compaction: ${preparation.messagesToSummarize.length} messages to summarize`);
    try {
      const result = await piCompact(
        preparation,
        model,
        auth.apiKey,
        auth.headers,
        memoryInstructions,
        signal,
      );
      return {
        compaction: {
          summary: await handoff.consumeSummary(result.summary, ctx),
          firstKeptEntryId: result.firstKeptEntryId,
          tokensBefore: result.tokensBefore,
          details: result.details,
        },
      };
    } catch (error) {
      log("compact-memory", `compaction failed, falling back to default: ${error}`);
      return;
    }
  });

  return { publish, unpublish };
}
