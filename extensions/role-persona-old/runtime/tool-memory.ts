/** `memory` tool: retrieval, mutation, and maintenance actions over role memory. */
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "@sinclair/typebox";
import { config } from "../config.ts";
import { log } from "../logger.ts";
import { runLlmMemoryTidy } from "../memory-llm.ts";
import {
  addRoleEvent,
  addRolePreference,
  consolidateRoleMemory,
  formatSearchMatchLine,
  listRoleMemory,
  readRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
} from "../memory-md.ts";
import {
  getVectorStats,
  hybridSearch,
  isVectorActive,
  queueVectorIndex,
  rebuildVectorIndex,
  removeVectorIndex,
  replaceVectorIndex,
} from "../memory-vector.ts";
import { memoryToolRenderers } from "../tui-renderers.ts";
import { memLogPush, type Runtime } from "./context.ts";

export function registerMemoryTool(rt: Runtime): void {
  rt.pi.registerTool({
    name: "memory",
    label: "Role Memory",
    description:
      "Role memory retrieval and maintenance. list/vector_stats inspect state; search covers learnings, preferences, events, pending, and recent daily, and may reinforce matches or promote pending entries. Add/update/reinforce/consolidate/repair/llm_tidy/vector_rebuild mutate memory; use them only when the user asks or the active task explicitly requires persistence or maintenance. Delete only clearly identified entries, and never delete preferences without user confirmation.",
    parameters: Type.Object({
      action: StringEnum(["add_learning", "add_preference", "add_event", "update_learning", "update_preference", "delete_learning", "delete_preference", "reinforce", "search", "list", "consolidate", "repair", "llm_tidy", "vector_rebuild", "vector_stats"] as const),
      content: Type.Optional(Type.String({ description: "Memory text" })),
      category: Type.Optional(Type.String({ description: "Preference category" })),
      query: Type.Optional(Type.String({ description: "Search query" })),
      id: Type.Optional(Type.String({ description: "Memory id" })),
      model: Type.Optional(Type.String({ description: "Optional model override, e.g. openai/gpt-4.1-mini" })),
    }),
    async execute(_toolCallId: string, params: Record<string, any>, _signal?: any, _onUpdate?: any, ctx?: any) {
      const currentRole = rt.state.currentRole;
      const currentRolePath = rt.state.currentRolePath;
      if (!currentRole || !currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      log("memory-tool", `action=${params.action} role=${currentRole}`, {
        content: params.content?.slice(0, 80),
        category: params.category,
        query: params.query,
        id: params.id,
      });

      switch (params.action) {
        case "add_learning": {
          if (!params.content) {
            memLogPush(rt, { source: "tool", op: "learning", content: "", stored: false, detail: "content required" });
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          // Use async version with LLM tag extraction
          const { addRoleLearningWithTags } = await import("../memory-md.ts");
          const result = await addRoleLearningWithTags(ctx, currentRolePath, currentRole, params.content, { appendDaily: true });
          memLogPush(rt, { source: "tool", op: "learning", content: params.content, id: result.id, stored: result.stored, detail: result.reason });
          log("memory-tool", `add_learning: ${result.stored ? "stored" : result.reason} id=${result.id || "-"} tags=${result.tags?.join(",") || "-"}`, params.content);
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          // Auto-index to vector DB
          if (result.id && config.vectorMemory?.autoIndex) {
            queueVectorIndex(result.id, params.content, "learning");
          }
          return {
            content: [{ type: "text", text: `Stored learning: ${params.content}${result.tags?.length ? ` [tags: ${result.tags.join(", ")}]` : ""}` }],
            details: result,
          };
        }

        case "add_preference": {
          if (!params.content) {
            memLogPush(rt, { source: "tool", op: "preference", content: "", category: params.category || "General", stored: false, detail: "content required" });
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const result = addRolePreference(
            currentRolePath,
            currentRole,
            params.category || "General",
            params.content,
            { appendDaily: true }
          );
          memLogPush(rt, { source: "tool", op: "preference", content: params.content, id: result.id, category: result.category, stored: result.stored, detail: params.category || "General" });
          log("memory-tool", `add_preference: ${result.stored ? "stored" : result.reason} [${result.category}] id=${result.id || "-"}`, params.content);
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          // Auto-index to vector DB
          if (result.id && config.vectorMemory?.autoIndex) {
            queueVectorIndex(result.id, params.content, "preference", result.category);
          }
          return {
            content: [{ type: "text", text: `Stored preference [${result.category}]: ${params.content}` }],
            details: result,
          };
        }

        case "add_event": {
          if (!params.content) {
            memLogPush(rt, { source: "tool", op: "event", content: "", stored: false, detail: "content required" });
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const result = addRoleEvent(currentRolePath, currentRole, params.content, {
            title: params.category || undefined, // optional title via category field
            appendDaily: true,
          });
          memLogPush(rt, { source: "tool", op: "event", content: params.content, id: result.id, stored: result.stored, detail: result.reason });
          log("memory-tool", `add_event: ${result.stored ? "stored" : result.reason} id=${result.id || "-"}`, params.content);
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          if (result.id && config.vectorMemory?.autoIndex) {
            queueVectorIndex(result.id, params.content, "event");
          }
          return {
            content: [{ type: "text", text: `Stored event: ${params.content}` }],
            details: result,
          };
        }

        case "reinforce": {
          const needle = params.id || params.query || params.content;
          if (!needle) {
            memLogPush(rt, { source: "tool", op: "reinforce", content: "", stored: false, detail: "id/query/content required" });
            return { content: [{ type: "text", text: "Error: id/query/content required" }], details: { error: true } };
          }
          const result = reinforceRoleLearning(currentRolePath, currentRole, needle);
          memLogPush(rt, { source: "tool", op: "reinforce", content: needle, id: result.id, stored: result.updated, detail: result.id });
          log("memory-tool", `reinforce: ${result.updated ? `ok [${result.id}] ${result.used}x` : "not found"}`, needle);
          if (!result.updated) {
            return { content: [{ type: "text", text: "Learning not found" }], details: { error: true } };
          }
          return {
            content: [{ type: "text", text: `Reinforced [${result.id}] -> ${result.used}x` }],
            details: result,
          };
        }

        case "update_learning": {
          const needle = params.id || params.query;
          const newText = params.content;
          if (!needle) {
            memLogPush(rt, { source: "tool", op: "update_learning", content: "", stored: false, detail: "id/query required" });
            return { content: [{ type: "text", text: "Error: id/query required" }], details: { error: true } };
          }
          if (!newText) {
            memLogPush(rt, { source: "tool", op: "update_learning", content: "", id: needle, stored: false, detail: "new content required" });
            return { content: [{ type: "text", text: "Error: content (new text) required" }], details: { error: true } };
          }
          const { updateRoleLearning } = await import("../memory-md.ts");
          const result = updateRoleLearning(currentRolePath, currentRole, needle, newText);
          memLogPush(rt, { source: "tool", op: "update_learning", content: newText, previous: result.oldText, id: result.id, oldId: result.oldId, stored: result.updated, detail: result.reason });
          log("memory-tool", `update_learning: ${result.updated ? `ok [${result.id}]` : result.reason}`, needle);
          if (!result.updated) {
            return { content: [{ type: "text", text: `Update failed: ${result.reason}` }], details: { error: true, reason: result.reason } };
          }
          if (result.id && result.oldId && result.newText && config.vectorMemory?.autoIndex) {
            replaceVectorIndex(result.oldId, result.id, result.newText, "learning");
          }
          return {
            content: [{ type: "text", text: `Updated learning [${result.id}]: "${result.oldText}" -> "${result.newText}"` }],
            details: result,
          };
        }

        case "update_preference": {
          const needle = params.id || params.query;
          const newText = params.content;
          if (!needle) {
            memLogPush(rt, { source: "tool", op: "update_preference", content: "", stored: false, detail: "id/query required" });
            return { content: [{ type: "text", text: "Error: id/query required" }], details: { error: true } };
          }
          if (!newText) {
            memLogPush(rt, { source: "tool", op: "update_preference", content: "", id: needle, stored: false, detail: "new content required" });
            return { content: [{ type: "text", text: "Error: content (new text) required" }], details: { error: true } };
          }
          const { updateRolePreference } = await import("../memory-md.ts");
          const result = updateRolePreference(currentRolePath, currentRole, needle, newText, params.category);
          memLogPush(rt, { source: "tool", op: "update_preference", content: newText, previous: result.oldText, id: result.id, oldId: result.oldId, category: result.category, stored: result.updated, detail: result.reason });
          log("memory-tool", `update_preference: ${result.updated ? `ok [${result.id}]` : result.reason}`, needle);
          if (!result.updated) {
            return { content: [{ type: "text", text: `Update failed: ${result.reason}` }], details: { error: true, reason: result.reason } };
          }
          if (result.id && result.oldId && result.newText && config.vectorMemory?.autoIndex) {
            replaceVectorIndex(result.oldId, result.id, result.newText, "preference", result.category);
          }
          return {
            content: [{ type: "text", text: `Updated preference [${result.id}] [${result.category}]: "${result.oldText}" -> "${result.newText}"` }],
            details: result,
          };
        }

        case "delete_learning": {
          const needle = params.id || params.query || params.content;
          if (!needle) {
            memLogPush(rt, { source: "tool", op: "delete_learning", content: "", stored: false, detail: "id/query/content required" });
            return { content: [{ type: "text", text: "Error: id/query/content required" }], details: { error: true } };
          }
          const { deleteRoleLearning } = await import("../memory-md.ts");
          const result = deleteRoleLearning(currentRolePath, currentRole, needle);
          memLogPush(rt, { source: "tool", op: "delete_learning", content: needle, id: result.id, stored: result.deleted, detail: result.reason });
          log("memory-tool", `delete_learning: ${result.deleted ? `ok [${result.id}]` : result.reason}`, needle);
          if (!result.deleted) {
            return { content: [{ type: "text", text: `Delete failed: ${result.reason}` }], details: { error: true, reason: result.reason } };
          }
          if (result.id && config.vectorMemory?.autoIndex) removeVectorIndex(result.id);
          return {
            content: [{ type: "text", text: `Deleted learning [${result.id}]: "${result.text}"` }],
            details: result,
          };
        }

        case "delete_preference": {
          const needle = params.id || params.query || params.content;
          if (!needle) {
            memLogPush(rt, { source: "tool", op: "delete_preference", content: "", stored: false, detail: "id/query/content required" });
            return { content: [{ type: "text", text: "Error: id/query/content required" }], details: { error: true } };
          }
          const { deleteRolePreference } = await import("../memory-md.ts");
          const result = deleteRolePreference(currentRolePath, currentRole, needle);
          memLogPush(rt, { source: "tool", op: "delete_preference", content: needle, id: result.id, category: result.category, stored: result.deleted, detail: result.reason });
          log("memory-tool", `delete_preference: ${result.deleted ? `ok [${result.id}]` : result.reason}`, needle);
          if (!result.deleted) {
            return { content: [{ type: "text", text: `Delete failed: ${result.reason}` }], details: { error: true, reason: result.reason } };
          }
          if (result.id && config.vectorMemory?.autoIndex) removeVectorIndex(result.id);
          return {
            content: [{ type: "text", text: `Deleted preference [${result.id}] [${result.category}]: "${result.text}"` }],
            details: result,
          };
        }

        case "search": {
          const query = params.query || params.content || "";
          if (!query.trim()) {
            return { content: [{ type: "text", text: "Error: query required" }], details: { error: true } };
          }
          // Use hybrid search if vector memory is active, otherwise keyword-only
          const matches = (isVectorActive() && config.vectorMemory?.hybridSearch)
            ? await hybridSearch(currentRolePath, currentRole, query)
            : searchRoleMemory(currentRolePath, currentRole, query);
          const searchMode = (isVectorActive() && config.vectorMemory?.hybridSearch) ? "hybrid" : "keyword";
          log("memory-tool", `search(${searchMode}): "${query}" -> ${matches.length} matches`);
          const text = matches.length
            ? matches.map((m) => formatSearchMatchLine(m)).join("\n")
            : "No matches";
          return {
            content: [{ type: "text", text }],
            details: { count: matches.length, mode: searchMode, query, matches },
          };
        }

        case "list": {
          const result = listRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `list: ${result.learnings}L ${result.preferences}P ${result.events}E ${result.pending}Pend ${result.issues} issues`);
          return {
            content: [{ type: "text", text: result.text }],
            details: {
              learnings: result.learnings,
              preferences: result.preferences,
              events: result.events,
              pending: result.pending,
              issues: result.issues,
            },
          };
        }

        case "consolidate": {
          const result = consolidateRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `consolidate: L ${result.beforeLearnings}->${result.afterLearnings} P ${result.beforePreferences}->${result.afterPreferences}`);
          return {
            content: [
              {
                type: "text",
                text: `Consolidated learnings ${result.beforeLearnings}->${result.afterLearnings}, preferences ${result.beforePreferences}->${result.afterPreferences}`,
              },
            ],
            details: result,
          };
        }

        case "repair": {
          const result = repairRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `repair: ${result.repaired ? `repaired (${result.issues} issues)` : "healthy"}`);
          return {
            content: [
              {
                type: "text",
                text: result.repaired
                  ? `memory/consolidated.md repaired (${result.issues} issues).`
                  : "memory/consolidated.md is healthy.",
              },
            ],
            details: result,
          };
        }

        case "llm_tidy": {
          log("memory-tool", `llm_tidy start model=${params.model || "(session)"}`);
          const beforeTidy = readRoleMemory(currentRolePath, currentRole);
          const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, params.model);
          if ("error" in llm) {
            log("memory-tool", `llm_tidy failed: ${llm.error}`);
            return { content: [{ type: "text", text: `LLM tidy failed: ${llm.error}` }], details: { error: true } };
          }
          const afterTidy = readRoleMemory(currentRolePath, currentRole);
          for (const id of llm.plan.removeLearningIds || []) {
            const before = beforeTidy.learnings.find((item) => item.id === id);
            const stored = !!before && !afterTidy.learnings.some((item) => item.id === id);
            if (stored && config.vectorMemory?.autoIndex) removeVectorIndex(id);
            memLogPush(rt, { source: "tool", op: "delete_learning", content: before?.text || id, id, stored, detail: stored ? "llm_tidy" : "llm_tidy: not found" });
          }
          for (const id of llm.plan.removePreferenceIds || []) {
            const before = beforeTidy.preferences.find((item) => item.id === id);
            const stored = !!before && !afterTidy.preferences.some((item) => item.id === id);
            if (stored && config.vectorMemory?.autoIndex) removeVectorIndex(id);
            memLogPush(rt, { source: "tool", op: "delete_preference", content: before?.text || id, id, category: before?.category, stored, detail: stored ? "llm_tidy" : "llm_tidy: not found" });
          }
          for (const item of llm.plan.rewriteLearnings || []) {
            const after = afterTidy.learnings.find((entry) => entry.id === item.id);
            const stored = !!after && after.text === item.text;
            if (stored && config.vectorMemory?.autoIndex) replaceVectorIndex(item.id, after.id, after.text, "learning");
            memLogPush(rt, { source: "tool", op: "update_learning", content: item.text, previous: beforeTidy.learnings.find((entry) => entry.id === item.id)?.text, id: after?.id || item.id, stored, detail: stored ? "llm_tidy" : "llm_tidy: not found or unchanged" });
          }
          for (const item of llm.plan.rewritePreferences || []) {
            const after = afterTidy.preferences.find((entry) => entry.id === item.id);
            const expectedCategory = item.category || beforeTidy.preferences.find((entry) => entry.id === item.id)?.category || "General";
            const stored = !!after && after.text === item.text && after.category === expectedCategory;
            if (stored && config.vectorMemory?.autoIndex) replaceVectorIndex(item.id, after.id, after.text, "preference", after.category);
            memLogPush(rt, { source: "tool", op: "update_preference", content: item.text, previous: beforeTidy.preferences.find((entry) => entry.id === item.id)?.text, id: after?.id || item.id, category: after?.category || expectedCategory, stored, detail: stored ? "llm_tidy" : "llm_tidy: not found or unchanged" });
          }
          for (const text of llm.plan.addLearnings || []) {
            const after = afterTidy.learnings.find((entry) => entry.text === text);
            if (after?.id && config.vectorMemory?.autoIndex) queueVectorIndex(after.id, after.text, "learning");
            memLogPush(rt, { source: "tool", op: "learning", content: text, id: after?.id, stored: !!after, detail: "llm_tidy" });
          }
          for (const item of llm.plan.addPreferences || []) {
            const category = item.category || "General";
            const after = afterTidy.preferences.find((entry) => entry.text === item.text && entry.category === category);
            if (after?.id && config.vectorMemory?.autoIndex) queueVectorIndex(after.id, after.text, "preference", after.category);
            memLogPush(rt, { source: "tool", op: "preference", content: item.text, id: after?.id, category, stored: !!after, detail: "llm_tidy" });
          }
          log("memory-tool", `llm_tidy done via ${llm.model}: L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings} P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}`);
          return {
            content: [
              {
                type: "text",
                text:
                  `LLM tidy applied via ${llm.model}: ` +
                  `L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings}, ` +
                  `P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}`,
              },
            ],
            details: llm,
          };
        }

        case "vector_rebuild": {
          if (!isVectorActive()) {
            return {
              content: [{ type: "text", text: "Vector memory is not active. Enable it in pi-role-persona.jsonc and ensure OpenAI API key is available." }],
              details: { error: true },
            };
          }
          log("memory-tool", "vector_rebuild start");
          const result = await rebuildVectorIndex(currentRolePath, currentRole);
          log("memory-tool", `vector_rebuild done: ${result.indexed}/${result.total} indexed, ${result.errors} errors`);
          return {
            content: [{
              type: "text",
              text: `Vector index rebuilt: ${result.indexed}/${result.total} entries indexed${result.errors > 0 ? `, ${result.errors} errors` : ""}`,
            }],
            details: result,
          };
        }

        case "vector_stats": {
          const stats = await getVectorStats();
          if (!stats) {
            return { content: [{ type: "text", text: "Vector memory not initialized" }], details: { error: true } };
          }
          const lines = [
            `Vector Memory Status:`,
            `  Enabled: ${stats.enabled}`,
            `  Active: ${stats.active}`,
            `  Model: ${stats.model || "n/a"}`,
            `  Dimensions: ${stats.dim || "n/a"}`,
            `  Indexed entries: ${stats.count}`,
            `  DB path: ${stats.dbPath || "n/a"}`,
          ];
          return { content: [{ type: "text", text: lines.join("\n") }], details: stats };
        }

        default:
          return { content: [{ type: "text", text: "Unknown action" }], details: { error: true } };
      }
    },
    ...memoryToolRenderers,
  });
}
