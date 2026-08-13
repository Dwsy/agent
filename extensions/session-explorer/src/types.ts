/**
 * Contract between the reader core, the HTTP server and the web UI.
 *
 * Everything here describes data that exists in a Pi session transcript or in
 * Pi's own session index. Nothing is inferred by a model and nothing is
 * estimated: a fact that is not present in the source is absent from the
 * payload, and the UI renders a dash rather than a plausible substitute.
 */

/** Time windows the session list can be narrowed to. */
export type RangeKey = "24h" | "7d" | "30d" | "90d" | "all";

export const RANGE_KEYS: readonly RangeKey[] = ["24h", "7d", "30d", "90d", "all"];

/** Orderings offered by the session list. */
export type SortKey = "recent" | "oldest" | "messages" | "cost" | "tokens";

export const SORT_KEYS: readonly SortKey[] = ["recent", "oldest", "messages", "cost", "tokens"];

/** Which side of the conversation a search is restricted to. */
export type SearchScope = "all" | "user" | "assistant" | "thinking";

export const SEARCH_SCOPES: readonly SearchScope[] = ["all", "user", "assistant", "thinking"];

/** Token counts and spend, summed from assistant messages by Pi's indexer. */
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Total spend in USD. Providers that report no pricing yield 0. */
  cost: number;
  /** Distinct model ids seen in the session, in index order. */
  models: string[];
}

/** One row of the session list. */
export interface SessionSummary {
  /** Session uuid as recorded in the transcript header. */
  id: string;
  /** Absolute path of the `.jsonl` transcript. Also the stable key for detail requests. */
  path: string;
  /** Working directory the session ran in. */
  cwd: string;
  /** Last path segment of `cwd`, for display. */
  project: string;
  /** Session title, when one was assigned. Never synthesized from message text. */
  name?: string;
  createdAt: string;
  modifiedAt: string;
  messageCount: number;
  /** Primary model recorded for the session. */
  model?: string;
  /** Opening user message, truncated for display. */
  firstMessage?: string;
  /** Closing message, truncated for display. */
  lastMessage?: string;
  lastMessageRole?: string;
  /** Transcript this session was forked from, when it was a fork. */
  parentPath?: string;
  usage?: SessionUsage;
  /** True when the transcript file is missing from disk but still indexed. */
  missing?: boolean;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
  /** Total matching the filter, ignoring pagination. */
  total: number;
  offset: number;
  limit: number;
}

/** A cwd with sessions in it. */
export interface ProjectSummary {
  cwd: string;
  project: string;
  sessionCount: number;
  messageCount: number;
  lastActiveAt: string;
  cost: number;
}

/** A highlighted region inside a snippet, as `[start, length]` in UTF-16 units. */
export type Highlight = [number, number];

export interface SearchHit {
  sessionPath: string;
  sessionName?: string;
  project: string;
  cwd: string;
  /** Transcript entry id, so the reader can scroll straight to it. */
  entryId: string;
  role: string;
  sourceType: string;
  timestamp: string;
  /** Excerpt of the original message text, centred on the first match. */
  snippet: string;
  /** Match positions within `snippet`. The UI marks these; it never parses HTML. */
  highlights: Highlight[];
}

export interface SearchResponse {
  /** Sessions whose title or path matches, surfaced above the message hits. */
  sessions: SessionSummary[];
  hits: SearchHit[];
  /** Total matching entries, ignoring pagination. */
  total: number;
  offset: number;
  limit: number;
  /** Milliseconds spent in the index. */
  tookMs: number;
}

/** Result of a tool call, paired onto the call that produced it. */
export interface ToolResultView {
  text: string;
  isError: boolean;
  /** True when `text` was cut to the transport limit. */
  truncated: boolean;
  /** Length of the untruncated text, in characters. */
  fullLength: number;
}

/** One piece of an assistant turn. */
export interface AssistantBlock {
  type: "text" | "thinking" | "toolCall" | "image";
  text?: string;
  truncated?: boolean;
  fullLength?: number;
  /** toolCall only. */
  toolCallId?: string;
  toolName?: string;
  /** Arguments as recorded, with long string values clipped. */
  arguments?: unknown;
  /** The matching tool result, when one appears later in the transcript. */
  result?: ToolResultView;
}

/**
 * A normalized transcript row. Tool results are folded into the assistant
 * block that called them, so the reader shows call and outcome as one unit
 * instead of two thirds of the transcript being loose result blobs.
 */
export type TranscriptItem =
  | { kind: "user"; id: string; timestamp: string; text: string; truncated?: boolean; fullLength?: number; images: number }
  | {
      kind: "assistant";
      id: string;
      timestamp: string;
      blocks: AssistantBlock[];
      model?: string;
      provider?: string;
      stopReason?: string;
      usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: number };
    }
  | { kind: "compaction"; id: string; timestamp: string; summary: string }
  | { kind: "branchSummary"; id: string; timestamp: string; summary: string; fromId?: string }
  | { kind: "label"; id: string; timestamp: string; label: string; targetId?: string }
  | { kind: "modelChange"; id: string; timestamp: string; provider?: string; modelId?: string }
  | { kind: "sessionInfo"; id: string; timestamp: string; name: string }
  | { kind: "custom"; id: string; timestamp: string; customType: string; text: string };

/** A user turn, used to build the jump-to navigation rail. */
export interface OutlineEntry {
  id: string;
  timestamp: string;
  /** First line of the user message, clipped. */
  title: string;
  /** Index into the transcript item array. */
  index: number;
}

export interface SessionTranscript {
  summary: SessionSummary;
  /** Which agent wrote the transcript. Codex sessions appear in Pi's index too. */
  format: "pi" | "codex";
  items: TranscriptItem[];
  /** Every user turn in the session, regardless of the returned page. */
  outline: OutlineEntry[];
  /** Total transcript items in the file, ignoring pagination. */
  total: number;
  offset: number;
  limit: number;
  /** Counts across the whole file, not just this page. */
  stats: {
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolErrors: number;
    thinkingBlocks: number;
    compactions: number;
    /** Tool call counts keyed by tool name, most used first. */
    toolCounts: Array<{ name: string; count: number }>;
  };
}

export interface StatusResponse {
  ok: true;
  version: string;
  sessionsDir: string;
  /** Absolute path of Pi's index, when it was usable. */
  indexPath?: string;
  /** False when the index was missing or unreadable and the server fell back to scanning files. */
  indexAvailable: boolean;
  /** Why the index could not be used, when it could not. */
  indexError?: string;
  sessionCount: number;
  /** Indexed message rows available to full-text search. */
  messageCount: number;
}

export interface ErrorResponse {
  error: string;
}
