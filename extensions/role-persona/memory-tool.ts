/**
 * Memory tool registration — the `memory` tool that AI can call.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { log } from "./logger.ts";
import type { RoleContext } from "./role-context.ts";
import {
  addRolePreference,
  consolidateRoleMemory,
  listRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
} from "./memory-md.ts";
import { runLlmMemoryTidy } from "./memory-llm.ts";

export function registerMemoryTool(pi: ExtensionAPI, rc: RoleContext): void {
  pi.registerTool({
    name: "memory",
    label: "Role Memory",
    description:
      "Manage role memory in MEMORY.md (markdown sections). Actions: add_learning, add_preference, reinforce, search, list, consolidate, repair, llm_tidy.",
    parameters: Type.Object({
      action: StringEnum(["add_learning", "add_preference", "reinforce", "search", "list", "consolidate", "repair", "llm_tidy"] as const),
      content: Type.Optional(Type.String({ description: "Memory text" })),
      category: Type.Optional(Type.String({ description: "Preference category" })),
      query: Type.Optional(Type.String({ description: "Search query" })),
      id: Type.Optional(Type.String({ description: "Memory id" })),
      model: Type.Optional(Type.String({ description: "Optional model override, e.g. openai/gpt-4.1-mini" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!rc.currentRole || !rc.currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      const { currentRole, currentRolePath } = rc;

      log("memory-tool", `action=${params.action} role=${currentRole}`, {
        content: params.content?.slice(0, 80),
        category: params.category,
        query: params.query,
        id: params.id,
      });

      switch (params.action) {
        case "add_learning": {
          if (!params.content) {
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const { addRoleLearningWithTags } = await import("./memory-md.ts");
          const result = await addRoleLearningWithTags(ctx, currentRolePath, currentRole, params.content, { appendDaily: true });
          rc.memLogPush({ source: "tool", op: "learning", content: params.content, stored: result.stored, detail: result.reason });
          log("memory-tool", `add_learning: ${result.stored ? "stored" : result.reason} id=${result.id || "-"} tags=${result.tags?.join(",") || "-"}`, params.content);
          if (!result.stored) {
            return { content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }], details: result };
          }
          return {
            content: [{ type: "text", text: `Stored learning: ${params.content}${result.tags?.length ? ` [tags: ${result.tags.join(", ")}]` : ""}` }],
            details: result,
          };
        }

        case "add_preference": {
          if (!params.content) {
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const result = addRolePreference(currentRolePath, currentRole, params.category || "General", params.content, { appendDaily: true });
          rc.memLogPush({ source: "tool", op: "preference", content: params.content, stored: result.stored, detail: params.category || "General" });
          log("memory-tool", `add_preference: ${result.stored ? "stored" : result.reason} [${result.category}] id=${result.id || "-"}`, params.content);
          if (!result.stored) {
            return { content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }], details: result };
          }
          return {
            content: [{ type: "text", text: `Stored preference [${result.category}]: ${params.content}` }],
            details: result,
          };
        }

        case "reinforce": {
          const needle = params.id || params.query || params.content;
          if (!needle) {
            return { content: [{ type: "text", text: "Error: id/query/content required" }], details: { error: true } };
          }
          const result = reinforceRoleLearning(currentRolePath, currentRole, needle);
          rc.memLogPush({ source: "tool", op: "reinforce", content: needle, stored: result.updated, detail: result.id });
          log("memory-tool", `reinforce: ${result.updated ? `ok [${result.id}] ${result.used}x` : "not found"}`, needle);
          if (!result.updated) {
            return { content: [{ type: "text", text: "Learning not found" }], details: { error: true } };
          }
          return { content: [{ type: "text", text: `Reinforced [${result.id}] -> ${result.used}x` }], details: result };
        }

        case "search": {
          const query = params.query || params.content || "";
          if (!query.trim()) {
            return { content: [{ type: "text", text: "Error: query required" }], details: { error: true } };
          }
          const matches = searchRoleMemory(currentRolePath, currentRole, query);
          log("memory-tool", `search: "${query}" -> ${matches.length} matches`);
          const text = matches.length
            ? matches.map((m) => {
                if (m.kind === "learning") return `[${m.id}] [${m.used}x] ${m.text}`;
                if (m.kind === "preference") return `[${m.id}] [${m.category}] ${m.text}`;
                return `[event] ${m.text}`;
              }).join("\n")
            : "No matches";
          return { content: [{ type: "text", text }], details: { count: matches.length } };
        }

        case "list": {
          const result = listRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `list: ${result.learnings}L ${result.preferences}P ${result.issues} issues`);
          return {
            content: [{ type: "text", text: result.text }],
            details: { learnings: result.learnings, preferences: result.preferences, issues: result.issues },
          };
        }

        case "consolidate": {
          const result = consolidateRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `consolidate: L ${result.beforeLearnings}->${result.afterLearnings} P ${result.beforePreferences}->${result.afterPreferences}`);
          return {
            content: [{ type: "text", text: `Consolidated learnings ${result.beforeLearnings}->${result.afterLearnings}, preferences ${result.beforePreferences}->${result.afterPreferences}` }],
            details: result,
          };
        }

        case "repair": {
          const result = repairRoleMemory(currentRolePath, currentRole, { force: true });
          log("memory-tool", `repair: ${result.repaired ? `repaired (${result.issues} issues)` : "healthy"}`);
          return {
            content: [{ type: "text", text: result.repaired ? `MEMORY.md repaired (${result.issues} issues).` : "MEMORY.md is healthy." }],
            details: result,
          };
        }

        case "llm_tidy": {
          log("memory-tool", `llm_tidy start model=${params.model || "(session)"}`);
          const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, params.model);
          if ("error" in llm) {
            log("memory-tool", `llm_tidy failed: ${llm.error}`);
            return { content: [{ type: "text", text: `LLM tidy failed: ${llm.error}` }], details: { error: true } };
          }
          log("memory-tool", `llm_tidy done via ${llm.model}: L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings} P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}`);
          return {
            content: [{ type: "text", text: `LLM tidy applied via ${llm.model}: L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings}, P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}` }],
            details: llm,
          };
        }

        default:
          return { content: [{ type: "text", text: "Unknown action" }], details: { error: true } };
      }
    },
  });
}
