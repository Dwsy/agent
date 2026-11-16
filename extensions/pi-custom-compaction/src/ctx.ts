/**
 * ctx — progressive context tool: read the session tree, then stage and fire
 * an agent-written compaction.
 *
 * Flow: action-list → action-schema → tree_outline/tree_show (pick a point)
 * → compact_stage (validate + stage summary + keep-point)
 * → compact_fire (stop at turn_end, compact after agent_end).
 *
 * The staged summary is injected through session_before_compact. By default,
 * a boundary after the firing turn keeps only the summary; keep-tail is explicit.
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
import { appendFileDetails, computeCtxFileDetails } from "./structured.js";

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
  retention: "summary-only" | "keep-tail";
  firstKeptEntryId?: string;
  stagedAt: string;
  stageId: string;
  resume?: string;
  /** Summary actually committed, i.e. the staged text plus appended file tags. */
  committedSummary?: string;
}

export const CTX_BOUNDARY_TYPE = "ctx-compaction-boundary";
let pending: CtxPending | null = null;
let fireRequested = false;
let active: CtxPending | null = null;
let injected = false;
let lastResult: string | null = null;

export function peekCtxPending(): CtxPending | null { return pending; }
export function peekCtxFireRequest(): boolean { return fireRequested; }
export function peekCtxActive(): CtxPending | null { return active; }
export function peekCtxLastResult(): string | null { return lastResult; }

export function discardCtxPending(): boolean {
  const had = pending !== null;
  pending = null;
  fireRequested = false;
  return had;
}

/** Lifecycle events must not carry staged text or callbacks into another session. */
export function resetCtxState(): void {
  discardCtxPending();
  active = null;
  injected = false;
  lastResult = null;
  clearOutlineCache();
}

export function ctxFireInstructions(stage: CtxPending): string {
  return `ctx-compaction:${stage.stageId}`;
}

/** Called after the firing turn has stopped and its tool results are persisted. */
export function beginCtxFire(boundaryId: string): CtxPending | undefined {
  if (!fireRequested || !pending || active) return undefined;
  active = { ...pending, firstKeptEntryId: pending.retention === "summary-only" ? boundaryId : pending.firstKeptEntryId };
  pending = null;
  fireRequested = false;
  injected = false;
  return active;
}

/** Returns false for callbacks belonging to a reset/replaced operation. */
export function settleCtxFire(stage: CtxPending, result: string): boolean {
  if (active !== stage) return false;
  active = null;
  injected = false;
  lastResult = result;
  return true;
}

export function isCtxFireCurrent(stage: CtxPending): boolean { return active === stage; }

/**
 * Only our matching manual operation may consume the staged summary.
 * Automatic compaction or /compact between stage and fire must leave it alone.
 */
export function takeCtxCompaction(event: SessionBeforeCompactEvent):
  | { compaction: CompactionResult }
  | { invalidPoint: string; cancel: true }
  | undefined {
  if (!active || injected || event.reason !== "manual" || event.customInstructions !== ctxFireInstructions(active)) return undefined;
  const point = active.firstKeptEntryId;
  if (!point || !event.branchEntries.some((entry) => entry.id === point)) {
    return { invalidPoint: point ?? "<missing boundary>", cancel: true };
  }
  injected = true;
  // Pi's own compact() appends <read-files>/<modified-files> to the summary it
  // generates. ctx supplies the summary itself, so it has to append the same
  // tags, otherwise the next agent loses track of which files were touched.
  const fileDetails = computeCtxFileDetails(event.branchEntries, point);
  const summary = appendFileDetails(active.summary, fileDetails);
  active.committedSummary = summary;
  return {
    compaction: {
      summary,
      firstKeptEntryId: point,
      tokensBefore: event.preparation.tokensBefore,
      details: {
        ctx: true,
        stageId: active.stageId,
        stagedAt: active.stagedAt,
        retention: active.retention,
        readFiles: fileDetails.readFiles,
        modifiedFiles: fileDetails.modifiedFiles,
      },
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
  /** Copyable obj payload for the full call shown by action-schema. */
  example: Record<string, unknown>;
  notes?: string[];
}

const ACTIONS: CtxActionDef[] = [
  {
    action: "tree_outline",
    description:
      "Paginated outline of session entries as attention-signal rows (tool names, err!, KB sizes, labels, keptFrom). Default scope=branch lists exactly the legal keep-points. Use focus=key first to converge on decision points.",
    schema: {
      type: "object",
      properties: {
        offset: { type: "number", description: "Start row, default 0." },
        limit: { type: "number", description: `Rows to show, default ${OUTLINE_DEFAULT_LIMIT}, max ${OUTLINE_MAX_LIMIT}.` },
        scope: { type: "string", enum: ["branch", "tree"], description: `"branch" (default, current path, cheap) or "tree" (all branches, DFS with depth).` },
        focus: { type: "string", enum: ["all", "key"], description: `"all" (default) or "key" (user intent, tool activity, errors, checkpoints, labels only).` },
      },
      additionalProperties: false,
    },
    example: { focus: "key", limit: 20 },
    notes: [
      "Rows are attention signals only — never paste them into a compaction summary.",
      "Use the id= field, not #index, when choosing a keep-point; ids stay stable as the session grows.",
    ],
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
    example: { entryId: "<id from tree_outline>" },
    notes: ["Write the compaction summary from tree_show reads, not from outline rows."],
  },
  {
    action: "compact_stage",
    description: "Stage an agent-written summary. Default summary-only drops prior dialogue from model context. Explicit keep-tail preserves raw history from firstKeptEntryId. Does not compact yet.",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: `Markdown summary replacing history (max ${SUMMARY_MAX_CHARS} chars).` },
        retention: { type: "string", enum: ["summary-only", "keep-tail"], description: "Default summary-only removes all prior dialogue from model context. keep-tail explicitly retains raw history from firstKeptEntryId through the firing turn." },
        firstKeptEntryId: { type: "string", description: "Required only for retention=keep-tail. This keeps ALL raw messages from this entry through compact_fire; it does not squash that range." },
        resume: { type: "string", description: `Optional user message sent after the compaction commits, triggering a new turn so the agent keeps working instead of stopping. Omit for the default stop-after-compact behavior (max ${RESUME_MAX_CHARS} chars).` },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    example: { summary: "## Goal\n...", retention: "summary-only" },
    notes: [
      "Default summary-only retains only the summary, not the dialogue used to write it.",
      "To retain raw history, explicitly set retention=keep-tail and firstKeptEntryId from branch tree_outline. Every message from that id through the firing turn stays in context.",
      "A fresh stage clears any previously armed fire — always call compact_fire after staging.",
    ],
  },
  {
    action: "compact_fire",
    description: "Arm a real compaction using the staged summary. It fires on agent_end when idle, never from inside this tool.",
    schema: { type: "object", properties: {}, additionalProperties: false },
    example: {},
    notes: [
      "The extension stops the agent at turn_end, then compacts after agent_end. Do not call more tools.",
      "Verify with compact_status next turn; if it failed, re-stage with compact_stage.",
    ],
  },
  {
    action: "compact_status",
    description: "Report staged/armed state and the last deferred-fire outcome. Use it next turn to verify compact_fire worked.",
    schema: { type: "object", properties: {}, additionalProperties: false },
    example: {},
    notes: ["lastResult is 'committed', 'committed; resume sent', 'failed: …', or null."],
  },
  {
    action: "compact_discard",
    description: "Drop the staged summary without compacting. Also disarms a pending fire.",
    schema: { type: "object", properties: {}, additionalProperties: false },
    example: {},
  },
];

const ACTION_NAMES = ACTIONS.map((item) => item.action).join(", ");

/** action-list is the only help surface an agent sees before its first call. */
function formatActionList(): string {
  const lines = [
    "ctx calling contract: exactly two top-level fields — action=<name>, obj={...arguments for that action}.",
    "All action arguments belong inside obj. Never put focus, entryId, summary, etc. at the top level.",
    "Progressive order: action-list -> action-schema -> action + obj.",
    "",
    "Meta actions:",
    `  ${ACTION_LIST}    obj={}                     list actions and this contract`,
    `  ${ACTION_SCHEMA}  obj={"action":"<name>"}   exact obj schema plus a copyable call example`,
    "",
    "Actions:",
  ];
  for (const item of ACTIONS) {
    const required = (item.schema.required as string[] | undefined) ?? [];
    const req = required.length > 0 ? `required obj: ${required.join(", ")}` : "no required obj fields";
    lines.push(`  ${item.action} — ${req}`);
    lines.push(`      ${item.description}`);
  }
  lines.push("", `Call ${ACTION_SCHEMA} with obj.action=<name> before using any action for the first time.`);
  return lines.join("\n");
}

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
    "Progressive session-context tool for reading the session tree and committing an agent-written checkpoint. Default summary-only excludes prior raw dialogue; explicit retention=keep-tail preserves raw history from firstKeptEntryId. Use it when you need earlier session entries or need to checkpoint context. Calling contract: {action: <name>, obj: {...arguments}} — every action argument goes inside obj. Start with action-list, then action-schema with obj.action=<name> for the exact obj schema and a copyable example, then call the action. Flow: tree_outline focus=key -> tree_show -> compact_stage -> compact_fire (the extension stops the turn).",
  promptSnippet: "ctx reads session history and compacts to summary-only by default. Discover with action-list -> action-schema; all arguments go inside obj.",
  promptGuidelines: [
    "Call action-list first, then action-schema with obj.action=<name>. Pass every argument inside obj, never at the top level.",
    "Use ctx when you need earlier session entries or a context checkpoint: tree_outline with focus=key, tree_show, compact_stage, compact_fire.",
    "compact_stage defaults to summary-only. To retain raw history, explicitly choose retention=keep-tail and firstKeptEntryId; everything from that id through the firing turn stays in context.",
    "Outline rows are signals only (tool names, err!, sizes) — never paste them as summary content; write the summary from tree_show reads.",
    "compact_fire only arms the compaction (fires on agent_end from idle); end your turn right after it with no further tool calls, then verify with compact_status next turn.",
  ],
  parameters: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: `${ACTION_LIST} (list actions and the calling contract), ${ACTION_SCHEMA} (with obj.action=<name>), or an action name returned by ${ACTION_LIST}.`,
      },
      obj: {
        type: "object",
        description: `Arguments for the selected action, always as an object. For ${ACTION_SCHEMA}, pass {"action":"<name>"}. Never put action arguments at the top level.`,
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
    void onUpdate;
    if (signal?.aborted) return errorResult("ctx call aborted.");
    const action = String(params.action ?? "").trim();
    if (params.obj !== undefined && (params.obj === null || typeof params.obj !== "object" || Array.isArray(params.obj))) {
      return errorResult("obj must be an object. Pass {action: <name>, obj: {...arguments}}.");
    }
    const obj = asObject(params.obj);

    if (action === ACTION_LIST) {
      return textResult(formatActionList(), { mode: "ctx", metaAction: ACTION_LIST });
    }

    if (action === ACTION_SCHEMA) {
      const requested = String(obj.action ?? "").trim();
      const found = ACTIONS.find((item) => item.action === requested);
      if (!found) {
        return errorResult(`Unknown action: ${requested || "<empty>"}. Valid actions: ${ACTION_NAMES}. Call ${ACTION_LIST} first, then ${ACTION_SCHEMA} with obj.action=<name>.`);
      }
      return textResult(
        JSON.stringify(
          {
            action: found.action,
            description: found.description,
            call: { action: found.action, obj: found.example },
            objSchema: found.schema,
            notes: found.notes ?? [],
          },
          null,
          2,
        ),
        { mode: "ctx", metaAction: ACTION_SCHEMA, action: found.action },
      );
    }

    if (action === "tree_outline") {
      const scopeRaw = obj.scope ?? "branch";
      const focusRaw = obj.focus ?? "all";
      if (scopeRaw !== "branch" && scopeRaw !== "tree") {
        return errorResult(`scope must be "branch" or "tree", got ${JSON.stringify(String(scopeRaw))}. Call ${ACTION_SCHEMA} with obj.action=tree_outline.`);
      }
      if (focusRaw !== "all" && focusRaw !== "key") {
        return errorResult(`focus must be "all" or "key", got ${JSON.stringify(String(focusRaw))}. Call ${ACTION_SCHEMA} with obj.action=tree_outline.`);
      }
      const offset = Math.max(0, Math.floor(Number(obj.offset ?? 0)) || 0);
      const limit = Math.min(OUTLINE_MAX_LIMIT, Math.max(1, Math.floor(Number(obj.limit ?? OUTLINE_DEFAULT_LIMIT)) || OUTLINE_DEFAULT_LIMIT));
      const scope = scopeRaw;
      const focus = focusRaw;
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
      if (active) return errorResult("ctx compaction is in progress. Check compact_status after it finishes.");
      if (typeof obj.summary !== "string" || !obj.summary.trim()) return errorResult("summary is required and must be a non-empty string.");
      const summary = obj.summary;
      if (summary.length > SUMMARY_MAX_CHARS) return errorResult(`summary is ${summary.length} chars, max is ${SUMMARY_MAX_CHARS}.`);
      const retention = obj.retention ?? "summary-only";
      if (retention !== "summary-only" && retention !== "keep-tail") return errorResult('retention must be "summary-only" or "keep-tail".');
      if (retention === "summary-only" && obj.firstKeptEntryId !== undefined) {
        return errorResult("summary-only does not accept firstKeptEntryId. Omit it to remove prior dialogue, or explicitly set retention=keep-tail to keep ALL raw messages from that id through compact_fire.");
      }
      if (obj.resume !== undefined && typeof obj.resume !== "string") return errorResult("resume must be a string.");
      const resume = (obj.resume as string | undefined)?.trim() || undefined;
      if (resume && resume.length > RESUME_MAX_CHARS) return errorResult(`resume is ${resume.length} chars, max is ${RESUME_MAX_CHARS}.`);
      let firstKeptEntryId: string | undefined;
      let retained = "only the summary; no prior raw dialogue will be retained";
      if (retention === "keep-tail") {
        if (typeof obj.firstKeptEntryId !== "string" || !obj.firstKeptEntryId.trim()) return errorResult("firstKeptEntryId is required for retention=keep-tail.");
        firstKeptEntryId = obj.firstKeptEntryId.trim();
        const branch = ctx.sessionManager.getBranch();
        const keepIndex = branch.findIndex((entry) => entry.id === firstKeptEntryId);
        if (keepIndex < 0) return errorResult(`Entry ${firstKeptEntryId} is not on the current branch. Re-run tree_outline.`);
        retained = `${branch.length - keepIndex} current raw branch entries from id=${firstKeptEntryId}, plus ALL entries added through the firing turn`;
      }
      pending = { summary, retention, firstKeptEntryId, stagedAt: new Date().toISOString(), stageId: crypto.randomUUID(), ...(resume ? { resume } : {}) };
      fireRequested = false;
      lastResult = null;
      return textResult(
        `staged (${retention}): keep ${retained}. summary=${summary.length} chars${resume ? `, resume=${resume.length} chars (sent as user message after commit)` : ""}. Call compact_fire to commit or compact_discard to drop.`,
        { mode: "ctx", action, retention, firstKeptEntryId: firstKeptEntryId ?? null, resumeArmed: resume !== undefined },
      );
    }

    if (action === "compact_fire") {
      if (active) return errorResult("ctx compaction is already in progress.");
      if (!pending) return errorResult("Nothing staged. Call compact_stage first.");
      if (pending.retention === "keep-tail" && !ctx.sessionManager.getBranch().some((entry) => entry.id === pending!.firstKeptEntryId)) {
        discardCtxPending();
        return errorResult("Staged keep-point is no longer on the current branch. Re-stage with compact_stage.");
      }
      fireRequested = true;
      return textResult(
        `compaction armed (${pending.retention}, ${pending.summary.length} chars). The extension stops this run at turn_end and compacts after agent_end. Do not call more tools; check compact_status next turn.`,
        { mode: "ctx", action, retention: pending.retention, firstKeptEntryId: pending.firstKeptEntryId ?? null },
      );
    }

    if (action === "compact_status") {
      return textResult(
        JSON.stringify({
          staged: pending !== null,
          firstKeptEntryId: (active ?? pending)?.firstKeptEntryId ?? null,
          retention: (active ?? pending)?.retention ?? null,
          inProgress: active !== null,
          armed: fireRequested,
          resumeArmed: ((active ?? pending)?.resume?.length ?? 0) > 0,
          lastResult,
          hasUI: ctx.hasUI,
        }),
        { mode: "ctx", action },
      );
    }

    if (action === "compact_discard") {
      if (active) return errorResult("ctx compaction is already in progress; it cannot be discarded.");
      return textResult(discardCtxPending() ? "staged ctx compaction discarded." : "nothing was staged.", {
        mode: "ctx",
        action,
      });
    }

    return errorResult(`Unknown action: ${action || "<empty>"}. Valid actions: ${ACTION_NAMES}; meta: ${ACTION_LIST}, ${ACTION_SCHEMA}. Call ${ACTION_LIST} first.`);
  },
};
