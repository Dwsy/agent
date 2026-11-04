/**
 * ctx — progressive context tool: read the session tree, then stage and fire
 * an agent-written compaction.
 *
 * Flow: action-list → action-schema → tree_outline/tree_show (pick a point)
 * → compact_stage (validate + stage summary + keep-point)
 * → compact_fire (real compaction now, consumes the staged summary).
 *
 * The staged summary is injected through session_before_compact, so the
 * agent freely chooses the keep-point instead of the token-based cut.
 *
 * Context budget design:
 * - tree_outline defaults to the current branch (getBranch: cheap, linear,
 *   and exactly the set of legal keep-points). Full-tree DFS (getTree: O(n)
 *   rebuild) is opt-in via scope="tree".
 * - Outline rows carry attention signals only (tool names, err!, KB sizes,
 *   labels, keptFrom) — never tool-result bodies, never thinking blocks.
 * - tree_show is the drill-down level; full bodies stay clipped unless
 *   full=true is passed explicitly.
 */
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  CompactionResult,
  ExtensionToolContext,
  SessionBeforeCompactEvent,
  SessionEntry,
  SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

export const CTX_TOOL_NAME = "ctx";
const ACTION_LIST = "action-list";
const ACTION_SCHEMA = "action-schema";

const PREVIEW_LIMIT = 80;
const SHOW_TEXT_LIMIT = 4000;
const SHOW_ARGS_LIMIT = 500;
const SUMMARY_MAX_CHARS = 20000;
const RESUME_MAX_CHARS = 2000;
const OUTLINE_DEFAULT_LIMIT = 40;
const OUTLINE_MAX_LIMIT = 100;
const CHILDREN_CAP = 20;

// ── Staged (pending) injection ─────────────────────────────────────────────

export interface CtxPending {
  summary: string;
  firstKeptEntryId: string;
  stagedAt: string;
  /** Optional user message sent after a committed compaction to keep the agent working. */
  resume?: string;
}

let pending: CtxPending | null = null;

// Deferred-fire flag: compact_fire (tool) must not trigger compact itself —
// manual compact aborts the calling turn, so in-tool triggering either
// deadlocks (if awaited) or aborts its own turn (if fire-and-forget).
// Instead fire sets this flag and the agent_end listener (idle) triggers.
let fireRequested = false;

export function peekCtxPending(): CtxPending | null {
  return pending;
}

export function requestCtxFire(): void {
  fireRequested = true;
}

export function takeCtxFireRequest(): boolean {
  if (!fireRequested) return false;
  fireRequested = false;
  return true;
}

export function peekCtxFireRequest(): boolean {
  return fireRequested;
}

// Tracks a compaction we triggered from agent_end, so the
// session_compact / session_compact_failed listeners can report
// the outcome (otherwise failures are silent: stage consumed, no entry).
let expectCtxResult = false;

export function markCtxFireTriggered(): void {
  expectCtxResult = true;
}

export function takeCtxFireTriggered(): boolean {
  if (!expectCtxResult) return false;
  expectCtxResult = false;
  return true;
}

export function discardCtxPending(): boolean {
  const had = pending !== null;
  pending = null;
  fireRequested = false;
  return had;
}

// Last deferred-fire outcome, kept for compact_status (works even where
// notifications have no UI to reach).
let lastResult: string | null = null;

export function peekCtxLastResult(): string | null {
  return lastResult;
}

export function setCtxLastResult(text: string): void {
  lastResult = text;
}

/**
 * Consume the staged summary for a session_before_compact event.
 * Returns the compaction result, an invalid-point notice, or undefined
 * when nothing is staged. Always clears the stage on consume.
 */
export function takeCtxCompaction(event: SessionBeforeCompactEvent):
  | { compaction: CompactionResult }
  | { invalidPoint: string }
  | undefined {
  if (!pending) return undefined;
  const staged = pending;
  pending = null;
  const onBranch = event.branchEntries.some((entry) => entry.id === staged.firstKeptEntryId);
  if (!onBranch) return { invalidPoint: staged.firstKeptEntryId };
  return {
    compaction: {
      summary: staged.summary,
      firstKeptEntryId: staged.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      details: { ctx: true, stagedAt: staged.stagedAt },
    },
  };
}

// ── Entry signals (pure, testable) ─────────────────────────────────────────

export interface CtxSignals {
  role?: string;
  /** Tool names called (assistant) or producing this result (toolResult). */
  tools: string[];
  /** True when a tool result failed. */
  isError: boolean;
  /** Total text chars behind this entry (never the text itself). */
  sizeChars: number;
  /** One-line preview: user/assistant prose only, never tool bodies. */
  preview: string;
  /** Compaction summary length, when applicable. */
  summaryChars?: number;
  /** Keep-point of a previous compaction, when applicable. */
  keptFrom?: string;
}

interface ContentBlock {
  type?: unknown;
  text?: unknown;
  name?: unknown;
  toolName?: unknown;
}

function blocksOf(entry: SessionEntry): ContentBlock[] {
  const content = (entry as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) return content as ContentBlock[];
  return [];
}

function roleOf(entry: SessionEntry): string | undefined {
  if (entry.type !== "message") return undefined;
  const role = (entry as { message?: { role?: unknown } }).message?.role;
  return typeof role === "string" ? role : undefined;
}

export function signalsOf(entry: SessionEntry): CtxSignals {
  const role = roleOf(entry);
  const tools: string[] = [];
  let isError = false;
  let sizeChars = 0;
  const prose: string[] = [];

  if (entry.type === "message" && role === "toolResult") {
    const msg = (entry as { message?: { toolName?: unknown; isError?: unknown } }).message;
    if (typeof msg?.toolName === "string" && msg.toolName) tools.push(msg.toolName);
    isError = msg?.isError === true;
  }
  for (const block of blocksOf(entry)) {
    if (block.type === "text" && typeof block.text === "string") {
      sizeChars += block.text.length;
      if (role === "user" || role === "assistant") prose.push(block.text);
    } else if (block.type === "toolCall") {
      if (typeof block.name === "string" && block.name) tools.push(block.name);
    }
    // thinking / image blocks: counted nowhere, shown nowhere (matches Pi serialization)
  }

  const flat = prose.join("\n").replace(/\s+/g, " ").trim();
  const preview = flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT)}…` : flat;

  const signals: CtxSignals = { role, tools, isError, sizeChars, preview };
  if (entry.type === "compaction" || entry.type === "branch_summary") {
    const summary = (entry as { summary?: unknown }).summary;
    signals.summaryChars = typeof summary === "string" ? summary.length : 0;
    const keptFrom = (entry as { firstKeptEntryId?: unknown }).firstKeptEntryId;
    if (typeof keptFrom === "string") signals.keptFrom = keptFrom;
  }
  return signals;
}

/** Decision-point rows: user intent, tool activity, errors, checkpoints, labels. */
export function isKeyRow(type: string, signals: CtxSignals, label?: string): boolean {
  if (label) return true;
  if (type === "compaction" || type === "branch_summary") return true;
  if (signals.role === "user") return true;
  if (signals.tools.length > 0 || signals.isError) return true;
  return false;
}

export interface CtxOutlineRow {
  index: number;
  id: string;
  depth: number;
  type: string;
  signals: CtxSignals;
}

function formatSize(chars: number): string {
  if (chars < 1024) return `${chars}B`;
  return `${(chars / 1024).toFixed(1)}KB`;
}

export function formatRow(row: CtxOutlineRow, label?: string): string {
  const parts: string[] = [`#${row.index}`];
  if (row.depth > 0) parts.push(`${"  ".repeat(row.depth)}`);
  const kind = row.signals.role ?? row.type;
  parts.push(`[${kind}]`, `id=${row.id}`);
  if (row.signals.tools.length > 0) parts.push(`tools=${row.signals.tools.join(",")}`);
  if (row.signals.isError) parts.push("err!");
  if (row.type === "message" && (row.signals.role === undefined || row.signals.role === "toolResult")) {
    parts.push(formatSize(row.signals.sizeChars));
  }
  if (row.signals.summaryChars !== undefined) parts.push(`${formatSize(row.signals.summaryChars)}`);
  if (row.signals.keptFrom) parts.push(`keptFrom=${row.signals.keptFrom}`);
  if (label) parts.push(`label="${label}"`);
  if (row.signals.preview) parts.push(`"${row.signals.preview}"`);
  return parts.join(" ");
}

export function buildBranchRows(branch: SessionEntry[]): CtxOutlineRow[] {
  return branch.map((entry, index) => ({
    index,
    id: entry.id,
    depth: 0,
    type: entry.type,
    signals: signalsOf(entry),
  }));
}

// Pi session is an append-only parentId chain: getBranch walks leaf->root,
// getTree rebuilds parent->children. A node with 1 child is normal dialogue
// (straight line, same depth); >1 children is a real fork from fork/navigate
// (abandoned branch vs current path, indent one level).
export function buildTreeRows(nodes: SessionTreeNode[]): CtxOutlineRow[] {
  const rows: CtxOutlineRow[] = [];
  const walk = (list: SessionTreeNode[], depth: number): void => {
    for (const node of list) {
      rows.push({ index: rows.length, id: node.entry.id, depth, type: node.entry.type, signals: signalsOf(node.entry) });
      if (node.children.length === 1) walk(node.children, depth);
      else if (node.children.length > 1) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return rows;
}

/**
 * Leaf-keyed outline cache. Session files are append-only and every append
 * moves the leaf, so an unchanged leafId guarantees unchanged content.
 * Labels live outside entries (setLabel moves no leaf) and are therefore
 * resolved at display time, never cached. Single-entry: pagination hits it,
 * new turns miss it. Bounded by construction.
 */
let outlineCache: { scope: "branch" | "tree"; leafId: string; rows: CtxOutlineRow[] } | null = null;

export function getOutlineRows(
  scope: "branch" | "tree",
  leafId: string,
  build: () => CtxOutlineRow[],
): { rows: CtxOutlineRow[]; cached: boolean } {
  if (outlineCache && outlineCache.scope === scope && outlineCache.leafId === leafId) {
    return { rows: outlineCache.rows, cached: true };
  }
  const rows = build();
  outlineCache = { scope, leafId, rows };
  return { rows, cached: false };
}

export function clearOutlineCache(): void {
  outlineCache = null;
}

export function formatOutline(lines: string[], total: number, offset: number, scope: string, leafId: string | null): string {
  return [`outline scope=${scope} total=${total} offset=${offset} shown=${lines.length} leaf=${leafId ?? "?"}`, ...lines].join("\n");
}

export function formatEntryDetail(
  entry: SessionEntry,
  opts: { label?: string; branchIndex: number; branchTotal: number; childrenIds: string[]; full: boolean },
): string {
  const signals = signalsOf(entry);
  const detail: Record<string, unknown> = {
    id: entry.id,
    parentId: entry.parentId,
    type: entry.type,
    timestamp: entry.timestamp,
    branch: `${opts.branchIndex}/${opts.branchTotal}`,
  };
  if (opts.label) detail.label = opts.label;
  if (opts.childrenIds.length > 0) detail.childrenIds = opts.childrenIds;
  if (signals.role) detail.role = signals.role;
  if (signals.tools.length > 0) detail.tools = signals.tools;
  if (signals.isError) detail.isError = true;
  detail.sizeChars = signals.sizeChars;

  if (entry.type === "compaction" || entry.type === "branch_summary") {
    const summary = (entry as { summary?: unknown }).summary;
    const text = typeof summary === "string" ? summary : "";
    detail.summary = opts.full ? text : text.slice(0, SHOW_TEXT_LIMIT);
    if (!opts.full && text.length > SHOW_TEXT_LIMIT) detail.summaryClipped = `${text.length} chars total, pass full=true`;
    detail.firstKeptEntryId = signals.keptFrom;
    return JSON.stringify(detail, null, 2);
  }

  if (entry.type === "message") {
    const calls = blocksOf(entry)
      .filter((block) => block.type === "toolCall")
      .map((block) => {
        const args = typeof block === "object" && block !== null && "arguments" in block ? (block as { arguments?: unknown }).arguments : undefined;
        const json = args === undefined ? "" : JSON.stringify(args);
        return {
          name: typeof block.name === "string" ? block.name : "?",
          args: opts.full ? json : json.slice(0, SHOW_ARGS_LIMIT),
        };
      });
    if (calls.length > 0) detail.toolCalls = calls;
    const prose = blocksOf(entry)
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
    // toolResult bodies are the heavy bulk: default clipped, never inlined elsewhere.
    detail.text = opts.full ? prose : prose.slice(0, SHOW_TEXT_LIMIT);
    if (!opts.full && prose.length > SHOW_TEXT_LIMIT) detail.textClipped = `${prose.length} chars total, pass full=true`;
    return JSON.stringify(detail, null, 2);
  }

  detail.entry = JSON.parse(JSON.stringify(entry));
  return JSON.stringify(detail, null, 2);
}

// ── Action catalogue ───────────────────────────────────────────────────────

interface CtxActionDef {
  action: string;
  description: string;
  schema: Record<string, unknown>;
}

const ACTIONS: CtxActionDef[] = [
  {
    action: "tree_outline",
    description:
      "Paginated outline of session entries as attention-signal rows (tool names, err!, KB sizes, labels, keptFrom). Defaults to the current branch — the only legal keep-points. Use focus=key first to converge on decision points, then tree_show to drill down.",
    schema: {
      type: "object",
      properties: {
        offset: { type: "number", description: "Start row, default 0." },
        limit: { type: "number", description: `Rows to show, default ${OUTLINE_DEFAULT_LIMIT}, max ${OUTLINE_MAX_LIMIT}.` },
        scope: { type: "string", description: `"branch" (default, current path, cheap) or "tree" (all branches, DFS with depth).` },
        focus: { type: "string", description: `"all" (default) or "key" (user intent, tool activity, errors, checkpoints, labels only).` },
      },
      additionalProperties: false,
    },
  },
  {
    action: "tree_show",
    description: "Full detail of one entry by id (bodies clipped; tool args clipped harder). Pass full=true for the complete text.",
    schema: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "Entry id from tree_outline." },
        full: { type: "boolean", description: "Return unclipped text. Default false." },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
  },
  {
    action: "compact_stage",
    description: "Validate and stage an agent-written summary with a keep-point entry id from the current branch. Does not compact yet. Re-run tree_outline before staging: branch indices shift as the session grows.",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: `Markdown summary replacing dropped history (max ${SUMMARY_MAX_CHARS} chars).` },
        firstKeptEntryId: { type: "string", description: "Entry id where kept history starts; everything before it on the branch is dropped." },
        resume: { type: "string", description: `Optional user message sent after the compaction commits, triggering a new turn so the agent keeps working instead of stopping. Omit for the default stop-after-compact behavior (max ${RESUME_MAX_CHARS} chars).` },
      },
      required: ["summary", "firstKeptEntryId"],
      additionalProperties: false,
    },
  },
  {
    action: "compact_fire",
    description: "Arm a real compaction using the staged summary (deferred: fires on agent_end when idle, never from inside the tool). End your turn after this call. Re-stage after any failure.",
    schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    action: "compact_discard",
    description: "Drop the staged summary without compacting.",
    schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {}, isError: true };
}

// ── Tool ───────────────────────────────────────────────────────────────────

export const ctxTool = {
  name: CTX_TOOL_NAME,
  label: "Ctx",
  description:
    "Progressive session-context tool. Read session entries as cheap attention-signal rows (tree_outline, focus=key first), drill into one entry (tree_show), then stage an agent-written summary at a freely chosen keep-point (compact_stage) and commit it as a real compaction (compact_fire). Start with action-list, inspect an action with action-schema, then execute it with action + obj.",
  promptSnippet: "Use ctx for session-tree reading and agent-driven compaction: action-list, action-schema, then action + obj.",
  promptGuidelines: [
    "Work progressively: tree_outline with focus=key to find a keep-point, tree_show to verify it, compact_stage to stage, compact_fire to commit.",
    "Outline rows are signals only (tool names, err!, sizes) — never paste them as summary content; write the summary from tree_show reads.",
    "compact_fire only arms the compaction (fires on agent_end from idle); end your turn right after it with no further tool calls.",
  ],
  parameters: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: `Use ${ACTION_LIST}, ${ACTION_SCHEMA}, or an action name returned by ${ACTION_LIST}.`,
      },
      obj: {
        type: "object",
        description: `Arguments for the selected action. For ${ACTION_SCHEMA}, pass {"action":"<name>"}.`,
        additionalProperties: true,
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  async execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
    ctx: ExtensionToolContext,
  ): Promise<AgentToolResult<Record<string, unknown>>> {
    void toolCallId;
    void signal;
    void onUpdate;
    const action = String(params.action ?? "").trim();
    const obj = asObject(params.obj);

    if (action === ACTION_LIST) {
      return textResult(
        ACTIONS.map((item) => `${item.action}: ${item.description}`).join("\n"),
        { mode: "ctx", metaAction: ACTION_LIST },
      );
    }

    if (action === ACTION_SCHEMA) {
      const requested = String(obj.action ?? "").trim();
      const found = ACTIONS.find((item) => item.action === requested);
      if (!found) return errorResult(`Unknown action: ${requested || "<empty>"}. Call ${ACTION_LIST} first.`);
      return textResult(JSON.stringify({ action: found.action, description: found.description, obj: found.schema }, null, 2), {
        mode: "ctx",
        metaAction: ACTION_SCHEMA,
        action: found.action,
      });
    }

    if (action === "tree_outline") {
      const offset = Math.max(0, Math.floor(Number(obj.offset ?? 0)) || 0);
      const limit = Math.min(OUTLINE_MAX_LIMIT, Math.max(1, Math.floor(Number(obj.limit ?? OUTLINE_DEFAULT_LIMIT)) || OUTLINE_DEFAULT_LIMIT));
      const scope = obj.scope === "tree" ? "tree" : "branch";
      const focus = obj.focus === "key" ? "key" : "all";
      const leafId = ctx.sessionManager.getLeafId();
      // Cache hit skips the full rebuild; labels/focus resolve per page (cheap map gets).
      const { rows } = getOutlineRows(scope, leafId ?? "", () =>
        scope === "tree"
          ? buildTreeRows(ctx.sessionManager.getTree())
          : buildBranchRows(ctx.sessionManager.getBranch()),
      );
      const safeLabel = (id: string): string | undefined => {
        try {
          return ctx.sessionManager.getLabel(id) ?? undefined;
        } catch {
          return undefined;
        }
      };
      const filtered = focus === "key" ? rows.filter((row) => isKeyRow(row.type, row.signals, safeLabel(row.id))) : rows;
      const page = filtered.slice(offset, offset + limit);
      const lines = page.map((row) => formatRow(row, safeLabel(row.id)));
      return textResult(formatOutline(lines, filtered.length, offset, scope, leafId), {
        mode: "ctx",
        action,
        scope,
        focus,
        offset,
        limit,
        total: filtered.length,
      });
    }

    if (action === "tree_show") {
      const entryId = String(obj.entryId ?? "").trim();
      if (!entryId) return errorResult("entryId is required. Pick one from tree_outline.");
      const entry = ctx.sessionManager.getEntry(entryId);
      if (!entry) return errorResult(`Unknown entry id: ${entryId}. Pick one from tree_outline.`);
      const branch = ctx.sessionManager.getBranch();
      const branchIndex = branch.findIndex((item) => item.id === entryId);
      let label: string | undefined;
      try {
        label = ctx.sessionManager.getLabel(entryId) ?? undefined;
      } catch {
        label = undefined;
      }
      const childrenIds: string[] = [];
      for (const item of ctx.sessionManager.getEntries()) {
        if (item.parentId === entryId) {
          childrenIds.push(item.id);
          if (childrenIds.length >= CHILDREN_CAP) break;
        }
      }
      return textResult(
        formatEntryDetail(entry, { label, branchIndex, branchTotal: branch.length, childrenIds, full: obj.full === true }),
        { mode: "ctx", action, entryId },
      );
    }

    if (action === "compact_stage") {
      const summary = String(obj.summary ?? "");
      const firstKeptEntryId = String(obj.firstKeptEntryId ?? "").trim();
      if (!summary.trim()) return errorResult("summary is required and must not be empty.");
      if (summary.length > SUMMARY_MAX_CHARS) {
        return errorResult(`summary is ${summary.length} chars, max is ${SUMMARY_MAX_CHARS}. Shorten it and stage again.`);
      }
      const resumeRaw = String(obj.resume ?? "").trim();
      if (resumeRaw.length > RESUME_MAX_CHARS) {
        return errorResult(`resume is ${resumeRaw.length} chars, max is ${RESUME_MAX_CHARS}. Shorten it and stage again.`);
      }
      const resume = resumeRaw ? resumeRaw : undefined;
      if (!firstKeptEntryId) return errorResult("firstKeptEntryId is required. Pick one from tree_outline (branch scope).");
      // Validate against the current branch: only these points are legal keep-points.
      const branch = ctx.sessionManager.getBranch();
      const keepIndex = branch.findIndex((entry) => entry.id === firstKeptEntryId);
      if (keepIndex < 0) {
        return errorResult(`Entry ${firstKeptEntryId} is not on the current branch. Re-run tree_outline (default branch scope) and pick a listed id.`);
      }
      pending = { summary, firstKeptEntryId, stagedAt: new Date().toISOString(), ...(resume ? { resume } : {}) };
      fireRequested = false; // fresh stage needs a fresh fire; stale flags must not leak in
      return textResult(
        `staged: keep ${branch.length - keepIndex}/${branch.length} branch entries from id=${firstKeptEntryId}, drop ${keepIndex}. summary=${summary.length} chars${resume ? `, resume=${resume.length} chars (sent as user message after commit)` : ""}. Call compact_fire to commit or compact_discard to drop.`,
        { mode: "ctx", action, firstKeptEntryId, kept: branch.length - keepIndex, dropped: keepIndex, resumeArmed: resume !== undefined },
      );
    }

    if (action === "compact_fire") {
      if (!pending) return errorResult("Nothing staged. Call compact_stage first.");
      const point = pending.firstKeptEntryId;
      const chars = pending.summary.length;
      // Deferred: never call ctx.compact() here. Manual compact aborts the
      // calling turn, so triggering from inside the tool either deadlocks
      // (awaited) or kills its own turn (fire-and-forget). Flag it; the
      // agent_end listener triggers from idle, and session_before_compact
      // consumes the stage via takeCtxCompaction.
      requestCtxFire();
      return textResult(
        `compaction armed from id=${point} (${chars} chars staged). End your turn now with no further tool calls; it fires on agent_end. If it fails or the point goes stale, re-stage.`,
        {
          mode: "ctx",
          action,
          firstKeptEntryId: point,
        },
      );
    }

    if (action === "compact_status") {
      return textResult(
        JSON.stringify({
          staged: pending !== null,
          firstKeptEntryId: pending?.firstKeptEntryId ?? null,
          armed: fireRequested,
          resumeArmed: (pending?.resume?.length ?? 0) > 0,
          lastResult,
          hasUI: ctx.hasUI,
        }),
        { mode: "ctx", action },
      );
    }

    if (action === "compact_discard") {
      return textResult(discardCtxPending() ? "staged ctx compaction discarded." : "nothing was staged.", {
        mode: "ctx",
        action,
      });
    }

    return errorResult(`Unknown action: ${action || "<empty>"}. Call ${ACTION_LIST} first.`);
  },
};
