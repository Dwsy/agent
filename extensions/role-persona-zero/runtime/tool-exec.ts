/**
 * `role_exec` tool: single progressive-disclosure entry point for all role
 * operations (memory CRUD, pending review, knowledge read/write, maintenance).
 *
 * Token design: the tool schema is just { op, args } with a two-sentence
 * description. Detailed per-op usage lives in the `help` op and is loaded
 * only when the model asks for it.
 */
import { Type } from "@sinclair/typebox";
import { buildMemoryEditInstruction } from "../memory-md.ts";
import { roleExecToolRenderers } from "../tui-renderers.ts";
import type { Runtime } from "./context.ts";
import { executeMemoryOp } from "./tool-memory.ts";
import { executeRoleInfo } from "./tool-role-info.ts";

interface OpSpec {
  op: string;
  usage: string;
}

interface OpGroup {
  group: string;
  ops: OpSpec[];
}

/** Single source of truth for the op catalog; help text and dispatch both derive from it. */
export const OP_CATALOG: OpGroup[] = [
  {
    group: "Memory · read",
    ops: [
      { op: "read", usage: `{ section?: "all|learnings|preferences|events|pending" } — full ID-annotated memory view` },
      { op: "list", usage: `{} — counts + top entries per kind` },
    ],
  },
  {
    group: "Memory · write (write durable insights the moment they occur)",
    ops: [
      { op: "add_learning", usage: `{ content } — durable lesson/insight; auto-tagged, deduped` },
      { op: "add_preference", usage: `{ content, category?: "Communication|Code|Tools|Workflow|General" }` },
      { op: "add_event", usage: `{ content, category?: title } — milestone/decision episode` },
      { op: "update_learning", usage: `{ id|query, content } — rewrite entry (id from [id:...] in context)` },
      { op: "update_preference", usage: `{ id|query, content, category? }` },
      { op: "update_event", usage: `{ id, content?: body, category?: title, date?: "YYYY-MM-DD" } — exact id only` },
      { op: "delete_learning", usage: `{ id|query|content }` },
      { op: "delete_preference", usage: `{ id|query|content } — requires prior user confirmation` },
      { op: "delete_event", usage: `{ id } — exact id only` },
      { op: "reinforce", usage: `{ id|query|content } — +1 usage count for a learning that proved useful` },
    ],
  },
  {
    group: "Pending review (background-extracted candidates; curate instead of letting them expire)",
    ops: [
      { op: "promote_pending", usage: `{ id } or { ids: [...] } — accept into consolidated memory` },
      { op: "discard_pending", usage: `{ id } or { ids: [...] } — reject candidate` },
    ],
  },
  {
    group: "Knowledge base (reusable system/project/domain knowledge, not role memory)",
    ops: [
      { op: "kb_list", usage: `{ category? } — sources, categories, entries` },
      { op: "kb_read", usage: `{ path: "category/entry.md" or "source:path" }` },
      { op: "kb_write", usage: `{ title, content, description?, category?, tags?, scope?, global?: boolean } — only when persistence is asked or clearly required` },
    ],
  },
  {
    group: "Maintenance",
    ops: [
      { op: "consolidate", usage: `{} — rule-based dedupe (safe)` },
      { op: "repair", usage: `{} — normalize consolidated.md structure` },
      { op: "llm_tidy", usage: `{ model? } — LLM-guided rewrite/dedupe plan` },
      { op: "vector_rebuild", usage: `{} — rebuild vector index` },
      { op: "vector_stats", usage: `{} — vector index status` },
    ],
  },
  {
    group: "Role",
    ops: [
      { op: "role_info", usage: `{ path?, recursive?, maxEntries? } — list role directory structure (no file contents)` },
    ],
  },
];

const MEMORY_OPS = new Set(
  OP_CATALOG.filter((g) => !g.group.startsWith("Knowledge") && g.group !== "Role")
    .flatMap((g) => g.ops.map((o) => o.op)),
);

const KB_OPS = new Set(["kb_list", "kb_read", "kb_write"]);

export function buildHelpText(rolePath: string | null, topic?: string): string {
  if (topic === "edit_spec") {
    return rolePath
      ? buildMemoryEditInstruction(rolePath)
      : "No active role; edit spec unavailable.";
  }

  const lines: string[] = [
    `role_exec operation catalog — call as role_exec({ op, args }).`,
    "",
  ];
  for (const group of OP_CATALOG) {
    lines.push(`## ${group.group}`);
    for (const spec of group.ops) {
      lines.push(`- ${spec.op} ${spec.usage}`);
    }
    lines.push("");
  }
  lines.push(
    `Rules: never delete preferences without user confirmation; skip trivial task-local noise; ids come from [id:...] in injected memory, role_search results, or read output.`,
    `Direct file editing format spec: role_exec({ op: "help", args: { topic: "edit_spec" } }).`,
  );
  return lines.join("\n");
}

/** Dispatches one op. Exported for tests; the registered tool is a thin wrapper. */
export async function dispatchRoleExec(rt: Runtime, op: string, args: Record<string, any>, ctx?: any) {
  if (op === "help") {
    return {
      content: [{ type: "text", text: buildHelpText(rt.state.currentRolePath, args.topic) }],
      details: { op },
    };
  }
  if (MEMORY_OPS.has(op)) {
    return executeMemoryOp(rt, { ...args, action: op }, ctx);
  }
  if (KB_OPS.has(op)) {
    // Lazy: keeps knowledge.ts (and its module-load-time dir resolution) out
    // of sessions and tests that never touch the knowledge base.
    const { executeKnowledgeOp } = await import("./tool-knowledge.ts");
    return executeKnowledgeOp(rt, { ...args, action: op.slice(3) });
  }
  if (op === "role_info") {
    return executeRoleInfo(rt, args);
  }
  return {
    content: [{ type: "text", text: `Unknown op "${op}".\n\n${buildHelpText(rt.state.currentRolePath)}` }],
    details: { error: true, op },
  };
}

export function registerRoleExecTool(rt: Runtime): void {
  rt.pi.registerTool({
    name: "role_exec",
    label: "Role Exec",
    description:
      "Execute a role memory/knowledge operation. You own this role's memory: write durable insights immediately (add_learning/add_preference/add_event), fix wrong entries on sight by [id:...] (update_*/delete_*), review pending candidates (promote_pending/discard_pending). Call { op: \"help\" } for the full op catalog and argument specs.",
    parameters: Type.Object({
      op: Type.String({ description: "Operation name; \"help\" lists all operations" }),
      args: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Operation arguments (see help)" })),
    }),
    async execute(_toolCallId: string, params: Record<string, any>, _signal?: any, _onUpdate?: any, ctx?: any): Promise<any> {
      return dispatchRoleExec(rt, params.op, params.args || {}, ctx);
    },
    ...roleExecToolRenderers,
  });
}
