/** `knowledge` tool: list / search / read / write over the multi-source knowledge base. */
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "@sinclair/typebox";
import { basename } from "node:path";
import { config } from "../config.ts";
import { listKnowledge, readKnowledge, searchKnowledge, writeKnowledge } from "../knowledge.ts";
import { log } from "../logger.ts";
import { knowledgeToolRenderers } from "../tui-renderers.ts";
import type { Runtime } from "./context.ts";

export function registerKnowledgeTool(rt: Runtime): void {
  rt.pi.registerTool({
    name: "knowledge",
    label: "Knowledge Base",
    description:
      "Searchable knowledge base (design patterns, scaffolds, architecture, troubleshooting). " +
      "Sources (priority↓): role (rw, per-role) > global (rw, shared) > project (ro, docs/knowledge/) > external (ro, config). " +
      "list/search/read are retrieval actions. write adds or updates an rw source and should be used only when the user asks to persist knowledge or the active task explicitly requires that write.",
    parameters: Type.Object({
      action: StringEnum(["list", "search", "read", "write"] as const),
      query: Type.Optional(Type.String({ description: "Search text" })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tag filter (search) or entry tags (write)" })),
      category: Type.Optional(Type.String({ description: "Category dir name" })),
      scope: Type.Optional(Type.String({ description: "frontend/backend/devops/fullstack" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
      path: Type.Optional(Type.String({ description: "Entry path, e.g. 'design-systems/glassmorphism.md' or 'source:path'" })),
      title: Type.Optional(Type.String({ description: "Entry title (write)" })),
      description: Type.Optional(Type.String({ description: "One-line summary (write)" })),
      content: Type.Optional(Type.String({ description: "Markdown body (write)" })),
      global: Type.Optional(Type.Boolean({ description: "true=global, false=role (write, default true)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, any>) {
      if (!config.knowledge?.enabled) {
        return { content: [{ type: "text", text: "Knowledge base is disabled in config." }], details: { error: true } };
      }

      const rolePath = rt.state.currentRolePath;

      switch (params.action) {
        case "list": {
          const result = listKnowledge(rolePath);

          if (params.category) {
            // Filter to specific category
            for (const src of result.sources) {
              src.categories = src.categories.filter((c) => c.category === params.category);
            }
          }

          const lines: string[] = [];
          for (const src of result.sources) {
            const totalInSource = src.categories.reduce((sum, c) => sum + c.entries.length, 0);
            if (totalInSource === 0 && !["global", "role"].includes(src.id)) continue;

            const label = src.readonly ? `${src.id} (readonly)` : src.id;
            const desc = src.description ? ` — ${src.description}` : "";
            lines.push(`## ${label}${desc}`);

            if (src.categories.length === 0) {
              lines.push("  (empty)");
            }
            for (const cat of src.categories) {
              lines.push(`  ${cat.category}/ (${cat.entries.length})`);
              for (const e of cat.entries) {
                const tagStr = e.tags.length > 0 ? ` [${e.tags.join(", ")}]` : "";
                lines.push(`    - ${e.file}: ${e.title}${tagStr}`);
              }
            }
            lines.push("");
          }

          // Tag summary
          const tagCount = Object.keys(result.tagIndex).length;
          lines.push(`Tags: ${tagCount} unique tags across ${result.totalEntries} entries`);

          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: { totalEntries: result.totalEntries, sources: result.sources.map((s) => s.id), tagCount },
          };
        }

        case "search": {
          if (!params.query && !params.tags?.length) {
            return { content: [{ type: "text", text: "Error: query or tags required for search" }], details: { error: true } };
          }

          const knowledgeConfig = config.knowledge;
          const results = searchKnowledge(rolePath, {
            query: params.query,
            tags: params.tags,
            category: params.category,
            scope: params.scope,
            limit: params.limit || knowledgeConfig.search.maxResults,
            roleBoost: knowledgeConfig.search.roleBoost,
          });

          if (results.length === 0) {
            return { content: [{ type: "text", text: "No matching knowledge entries found." }], details: { count: 0 } };
          }

          const lines = results.map((r, i) => {
            const e = r.entry;
            const ro = e.readonly ? " (readonly)" : "";
            return [
              `${i + 1}. [${e.source}${ro}] ${e.meta.title}`,
              `   path: ${e.source}:${e.relativePath}`,
              `   description: ${e.meta.description || "(none)"}`,
              `   tags: [${e.meta.tags.join(", ")}]`,
              e.meta.scope ? `   scope: ${e.meta.scope}` : null,
              `   updated: ${e.meta.updated || "unknown"} | version: ${e.meta.version}`,
              `   relevance: ${r.relevance.toFixed(2)} | matched: ${r.matchedOn.join(", ")}`,
            ].filter(Boolean).join("\n");
          });

          return {
            content: [{ type: "text", text: lines.join("\n\n") }],
            details: { count: results.length, query: params.query },
          };
        }

        case "read": {
          if (!params.path) {
            return { content: [{ type: "text", text: "Error: path required for read" }], details: { error: true } };
          }

          const result = readKnowledge(params.path, rolePath);
          if (!result) {
            return { content: [{ type: "text", text: `Not found: ${params.path}` }], details: { error: true } };
          }

          const header = [
            `# ${result.frontmatter.title}`,
            `source: ${result.source}${result.readonly ? " (readonly)" : ""}`,
            `tags: [${result.frontmatter.tags.join(", ")}]`,
            result.frontmatter.scope ? `scope: ${result.frontmatter.scope}` : null,
            `version: ${result.frontmatter.version} | updated: ${result.frontmatter.updated || "unknown"}`,
            `chars: ${result.charCount} | lines: ${result.lineCount}`,
            `path: ${result.absolutePath}`,
            "---",
          ].filter(Boolean).join("\n");

          return {
            content: [{ type: "text", text: `${header}\n\n${result.body}` }],
            details: {
              frontmatter: result.frontmatter,
              source: result.source,
              readonly: result.readonly,
              charCount: result.charCount,
              lineCount: result.lineCount,
            },
          };
        }

        case "write": {
          if (!params.title || !params.content) {
            return { content: [{ type: "text", text: "Error: title and content required for write" }], details: { error: true } };
          }

          const result = writeKnowledge(rolePath, {
            title: params.title,
            description: params.description,
            content: params.content,
            category: params.category,
            tags: params.tags,
            scope: params.scope,
            global: params.global,
          });

          const msg = [
            result.isNew ? "Created" : "Updated",
            `[${result.source}] ${result.category}/${basename(result.written)}`,
            `v${result.version}`,
            result.suggestion ? `(${result.suggestion})` : "",
          ].filter(Boolean).join(" ");

          log("knowledge", msg);

          return {
            content: [{ type: "text", text: msg }],
            details: result,
          };
        }

        default:
          return { content: [{ type: "text", text: "Unknown action" }], details: { error: true } };
      }
    },
    ...knowledgeToolRenderers,
  });
}
