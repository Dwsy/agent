/**
 * `role_search` tool: the single retrieval entry point across role memory
 * (learnings/preferences/events/pending/daily, hybrid when vector is active)
 * and the knowledge base. Mutations go through `role_exec`.
 */
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "@sinclair/typebox";
import { config } from "../config.ts";
import { searchKnowledge } from "../knowledge.ts";
import { log } from "../logger.ts";
import { formatSearchMatchLine, searchRoleMemory } from "../memory-md.ts";
import { hybridSearch, isVectorActive } from "../memory-vector.ts";
import { roleSearchToolRenderers } from "../tui-renderers.ts";
import type { Runtime } from "./context.ts";

export function registerRoleSearchTool(rt: Runtime): void {
  rt.pi.registerTool({
    name: "role_search",
    label: "Role Search",
    description:
      "Search the active role's memory (all layers; may auto-reinforce or promote strong matches) and knowledge base. Use when prior cross-session context or stored knowledge could affect the answer. Results carry [id:...] for role_exec update/delete ops.",
    parameters: Type.Object({
      query: Type.String({ description: "Search text" }),
      scope: Type.Optional(StringEnum(["all", "memory", "knowledge"] as const)),
      limit: Type.Optional(Type.Number({ description: "Max results per scope" })),
    }),
    async execute(_toolCallId: string, params: Record<string, any>) {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      const query: string = (params.query || "").trim();
      if (!query) {
        return { content: [{ type: "text", text: "Error: query required" }], details: { error: true } };
      }
      const scope: string = params.scope || "all";
      const sections: string[] = [];
      const allMatches: unknown[] = [];

      let searchMode = "keyword";
      if (scope !== "knowledge") {
        const hybrid = isVectorActive() && config.vectorMemory?.hybridSearch;
        const matches = hybrid
          ? await hybridSearch(currentRolePath, currentRole, query)
          : searchRoleMemory(currentRolePath, currentRole, query, params.limit ? { maxResults: params.limit } : undefined);
        searchMode = hybrid ? "hybrid" : "keyword";
        if (matches.length > 0) {
          sections.push(
            `Memory (${matches.length}):\n` +
            matches.map((m) => `${formatSearchMatchLine(m)}${m.id ? ` [id:${m.id}]` : ""}`).join("\n"),
          );
          allMatches.push(...matches);
        }
      }

      if (scope !== "memory" && config.knowledge?.enabled) {
        const results = searchKnowledge(currentRolePath, {
          query,
          limit: params.limit || config.knowledge.search.maxResults,
          roleBoost: config.knowledge.search.roleBoost,
        });
        if (results.length > 0) {
          sections.push(
            `Knowledge (${results.length}):\n` +
            results.map((r) => {
              const e = r.entry;
              return `knowledge [${e.source}] ${e.meta.title} — ${e.source}:${e.relativePath} (${r.relevance.toFixed(2)})`;
            }).join("\n"),
          );
          allMatches.push(...results.map((r) => ({
            kind: "knowledge",
            text: `${r.entry.meta.title} — ${r.entry.source}:${r.entry.relativePath}`,
            score: r.relevance,
          })));
        }
      }

      log("role-search", `(${searchMode}, scope=${scope}) "${query}" -> ${allMatches.length} matches`);
      return {
        content: [{ type: "text", text: sections.length ? sections.join("\n\n") : "No matches" }],
        details: { count: allMatches.length, mode: searchMode, scope, query, matches: allMatches },
      };
    },
    ...roleSearchToolRenderers,
  });
}
