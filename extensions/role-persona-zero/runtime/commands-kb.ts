/** `/kb` command: knowledge base list / search / stats. */
import { config } from "../config.ts";
import { listKnowledge, searchKnowledge } from "../knowledge.ts";
import type { Runtime } from "./context.ts";
import { notify } from "./ui.ts";

export function registerKbCommand(rt: Runtime): void {
  const { pi } = rt;

  pi.registerCommand("kb", {
    description: "Knowledge base: /kb [list|search <query>|rebuild|stats]",
    handler: async (args, ctx) => {
      if (!config.knowledge?.enabled) {
        notify(rt, ctx, "Knowledge base is disabled", "warning");
        return;
      }

      const argv = (args || "").trim().split(/\s+/);
      const cmd = argv[0] || "list";
      const currentRolePath = rt.state.currentRolePath;

      switch (cmd) {
        case "list": {
          const result = listKnowledge(currentRolePath);
          const lines: string[] = [`Knowledge Base — ${result.totalEntries} entries\n`];

          for (const src of result.sources) {
            const total = src.categories.reduce((s, c) => s + c.entries.length, 0);
            if (total === 0 && !["global", "role"].includes(src.id)) continue;
            const ro = src.readonly ? " (readonly)" : "";
            lines.push(`[${src.id}${ro}]`);
            for (const cat of src.categories) {
              lines.push(`  ${cat.category}/ — ${cat.entries.length} entries`);
              for (const e of cat.entries) {
                lines.push(`    ${e.file}: ${e.title}`);
              }
            }
            if (src.categories.length === 0) lines.push("  (empty)");
            lines.push("");
          }

          pi.sendMessage({ customType: "kb-list", content: lines.join("\n"), display: true }, { triggerTurn: false });
          break;
        }

        case "search": {
          const query = argv.slice(1).join(" ");
          if (!query) {
            notify(rt, ctx, "Usage: /kb search <query>", "warning");
            return;
          }
          const results = searchKnowledge(currentRolePath, { query, limit: 10 });
          if (results.length === 0) {
            notify(rt, ctx, "No matches", "info");
            return;
          }
          const lines = results.map((r, i) => {
            const e = r.entry;
            return `${i + 1}. [${e.source}] ${e.meta.title} (${r.relevance.toFixed(2)}) — ${e.relativePath}`;
          });
          pi.sendMessage({ customType: "kb-search", content: lines.join("\n"), display: true }, { triggerTurn: false });
          break;
        }

        case "stats": {
          const result = listKnowledge(currentRolePath);
          const tagCount = Object.keys(result.tagIndex).length;
          const sourceStats = result.sources.map((s) => {
            const count = s.categories.reduce((sum, c) => sum + c.entries.length, 0);
            return `${s.id}${s.readonly ? "(ro)" : ""}: ${count}`;
          }).join(", ");
          notify(rt, ctx, `${result.totalEntries} entries | ${tagCount} tags | ${sourceStats}`, "info");
          break;
        }

        default:
          notify(rt, ctx, "Usage: /kb [list|search <query>|stats]", "info");
      }
    },
  });
}
