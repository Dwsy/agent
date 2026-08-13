/**
 * Read-only access to Pi's session index.
 *
 * Pi maintains `~/.pi/agent/sessions/sessions.db` — a SQLite database with a
 * row per session and an FTS5 table over every indexed message. Reading it
 * turns "list 7,000 sessions" and "search 600,000 messages" into millisecond
 * queries instead of a walk over gigabytes of JSONL.
 *
 * The connection is opened read-only and never written to: Pi owns this file
 * and may be writing to it while the explorer is running. When the index is
 * missing or unreadable the caller falls back to scanning the filesystem, so
 * every method here is allowed to throw at open time but not at query time.
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

import { isInjectedContext } from "./codex.ts";
import { buildMatchExpression, buildSnippet, extractHighlightTerms } from "./query.ts";
import type {
  ProjectSummary,
  RangeKey,
  SearchHit,
  SearchScope,
  SessionSummary,
  SortKey,
} from "./types.ts";

export const SESSIONS_DIR = process.env.PI_SESSIONS_DIR ?? join(homedir(), ".pi", "agent", "sessions");
export const INDEX_PATH = join(SESSIONS_DIR, "sessions.db");

const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

/** `ORDER BY` fragments, keyed by sort. Values are literals, never user input. */
const ORDER_BY: Record<SortKey, string> = {
  recent: "s.modified DESC",
  oldest: "s.modified ASC",
  messages: "s.message_count DESC",
  cost: "cost DESC",
  tokens: "tokens DESC",
};

export interface ListOptions {
  /** Matches session name, opening message or cwd. Not a full-text search. */
  q?: string;
  cwd?: string;
  model?: string;
  range?: RangeKey;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

export interface SearchOptions {
  q: string;
  scope?: SearchScope;
  cwd?: string;
  limit?: number;
  offset?: number;
}

interface SessionRow {
  id: string | null;
  path: string;
  cwd: string | null;
  name: string | null;
  created: string | null;
  modified: string | null;
  message_count: number | null;
  model: string | null;
  first_message: string | null;
  last_message: string | null;
  last_message_role: string | null;
  parent_session_path: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost: number | null;
  models_json: string | null;
}

/** Cut display text so a list response stays small. */
function clip(value: string | null | undefined, max = 240): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function parseModels(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

function toSummary(row: SessionRow): SessionSummary {
  const cwd = row.cwd ?? "";
  const hasUsage =
    row.input_tokens !== null || row.output_tokens !== null || row.cost !== null;

  // Codex sessions are titled from their injected AGENTS.md preamble, which
  // the index copies into both `name` and `first_message`. It describes the
  // project, not the session, so neither field may become a title.
  const name = row.name?.trim();
  const firstMessage = row.first_message;

  return {
    id: row.id ?? row.path,
    path: row.path,
    cwd,
    project: cwd ? basename(cwd) || cwd : "—",
    name: name && !isInjectedContext(name) ? name : undefined,
    createdAt: row.created ?? row.modified ?? "",
    modifiedAt: row.modified ?? row.created ?? "",
    messageCount: row.message_count ?? 0,
    model: row.model ?? undefined,
    firstMessage:
      firstMessage && !isInjectedContext(firstMessage) ? clip(firstMessage) : undefined,
    lastMessage: clip(row.last_message),
    lastMessageRole: row.last_message_role ?? undefined,
    parentPath: row.parent_session_path ?? undefined,
    usage: hasUsage
      ? {
          inputTokens: row.input_tokens ?? 0,
          outputTokens: row.output_tokens ?? 0,
          cacheReadTokens: row.cache_read_tokens ?? 0,
          cacheWriteTokens: row.cache_write_tokens ?? 0,
          cost: row.cost ?? 0,
          models: parseModels(row.models_json),
        }
      : undefined,
  };
}

/** Columns shared by list and lookup queries. */
const SESSION_SELECT = `
  SELECT s.id, s.path, s.cwd, s.name, s.created, s.modified, s.message_count,
         s.model, s.first_message, s.last_message, s.last_message_role,
         s.parent_session_path,
         d.input_tokens, d.output_tokens, d.cache_read_tokens, d.cache_write_tokens,
         d.models_json,
         (COALESCE(d.input_cost,0) + COALESCE(d.output_cost,0)
          + COALESCE(d.cache_read_cost,0) + COALESCE(d.cache_write_cost,0)) AS cost,
         (COALESCE(d.input_tokens,0) + COALESCE(d.output_tokens,0)) AS tokens
  FROM sessions s
  LEFT JOIN session_details_cache d ON d.path = s.path
`;

export class SessionIndex {
  #db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * Open Pi's index read-only.
   * Throws when the file is absent or SQLite refuses it; callers degrade.
   */
  static open(path: string = INDEX_PATH): SessionIndex {
    if (!existsSync(path)) {
      throw new Error(`Pi session index not found at ${path}`);
    }

    const db = new DatabaseSync(path, { readOnly: true });
    // Fail loudly here rather than on the first user query.
    db.prepare("SELECT COUNT(*) FROM sessions").get();
    return new SessionIndex(db);
  }

  close(): void {
    try {
      this.#db.close();
    } catch {
      // Closing an already-closed handle is not worth surfacing.
    }
  }

  counts(): { sessions: number; messages: number } {
    const sessions = this.#db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number };
    let messages = 0;
    try {
      const row = this.#db.prepare("SELECT COUNT(*) AS c FROM message_entries").get() as { c: number };
      messages = row.c;
    } catch {
      // An older index may predate message-level indexing; search degrades.
    }
    return { sessions: sessions.c, messages };
  }

  /** True when the full-text tables this build relies on are present. */
  hasMessageIndex(): boolean {
    try {
      this.#db.prepare("SELECT rowid FROM message_fts LIMIT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  list(options: ListOptions = {}): { sessions: SessionSummary[]; total: number } {
    const { where, params } = this.#listFilter(options);
    const sort = ORDER_BY[options.sort ?? "recent"] ?? ORDER_BY.recent;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const total = this.#db
      .prepare(`SELECT COUNT(*) AS c FROM sessions s LEFT JOIN session_details_cache d ON d.path = s.path ${where}`)
      .get(...params) as { c: number };

    const rows = this.#db
      .prepare(`${SESSION_SELECT} ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as SessionRow[];

    return { sessions: rows.map(toSummary), total: total.c };
  }

  get(path: string): SessionSummary | undefined {
    const row = this.#db.prepare(`${SESSION_SELECT} WHERE s.path = ?`).get(path) as unknown as
      | SessionRow
      | undefined;
    return row ? toSummary(row) : undefined;
  }

  /** Whether the index knows this transcript. Used as the read allow-list. */
  has(path: string): boolean {
    const row = this.#db.prepare("SELECT 1 AS ok FROM sessions WHERE path = ?").get(path) as
      | { ok: number }
      | undefined;
    return row !== undefined;
  }

  projects(): ProjectSummary[] {
    const rows = this.#db
      .prepare(
        `SELECT s.cwd AS cwd, COUNT(*) AS sessionCount,
                SUM(COALESCE(s.message_count,0)) AS messageCount,
                MAX(s.modified) AS lastActiveAt,
                SUM(COALESCE(d.input_cost,0) + COALESCE(d.output_cost,0)
                    + COALESCE(d.cache_read_cost,0) + COALESCE(d.cache_write_cost,0)) AS cost
         FROM sessions s
         LEFT JOIN session_details_cache d ON d.path = s.path
         WHERE s.cwd IS NOT NULL AND s.cwd != ''
         GROUP BY s.cwd
         ORDER BY lastActiveAt DESC`,
      )
      .all() as unknown as Array<{
      cwd: string;
      sessionCount: number;
      messageCount: number;
      lastActiveAt: string;
      cost: number;
    }>;

    return rows.map((row) => ({
      cwd: row.cwd,
      project: basename(row.cwd) || row.cwd,
      sessionCount: row.sessionCount,
      messageCount: row.messageCount ?? 0,
      lastActiveAt: row.lastActiveAt ?? "",
      cost: row.cost ?? 0,
    }));
  }

  /** Distinct models present in the index, most used first. */
  models(): Array<{ model: string; count: number }> {
    const rows = this.#db
      .prepare(
        `SELECT model, COUNT(*) AS count FROM sessions
         WHERE model IS NOT NULL AND model != ''
         GROUP BY model ORDER BY count DESC`,
      )
      .all() as unknown as Array<{ model: string; count: number }>;
    return rows;
  }

  /**
   * Full-text search over indexed messages.
   * Returns hits ordered newest first, which matches how people look for past
   * work ("what was I doing last week") better than a relevance score does on
   * a per-character CJK index.
   */
  search(options: SearchOptions): { hits: SearchHit[]; total: number } {
    const match = buildMatchExpression(options.q);
    if (!match) return { hits: [], total: 0 };

    const terms = extractHighlightTerms(options.q);
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);

    const conditions = ["message_fts MATCH ?"];
    const params: Array<string | number> = [match];

    const scope = options.scope ?? "all";
    if (scope !== "all") {
      conditions.push("m.source_type = ?");
      params.push(scope);
    }
    if (options.cwd) {
      conditions.push("s.cwd = ?");
      params.push(options.cwd);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const from = `
      FROM message_fts f
      JOIN message_entries m ON m.rowid = f.rowid
      LEFT JOIN sessions s ON s.path = m.session_path
    `;

    const total = this.#db.prepare(`SELECT COUNT(*) AS c ${from} ${where}`).get(...params) as {
      c: number;
    };

    const rows = this.#db
      .prepare(
        `SELECT m.entry_id, m.session_path, m.role, m.source_type, m.content, m.timestamp,
                s.name AS session_name, s.cwd
         ${from} ${where}
         ORDER BY m.timestamp DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Array<{
      entry_id: string;
      session_path: string;
      role: string;
      source_type: string;
      content: string;
      timestamp: string;
      session_name: string | null;
      cwd: string | null;
    }>;

    const hits: SearchHit[] = rows.map((row) => {
      const { snippet, highlights } = buildSnippet(row.content ?? "", terms);
      const cwd = row.cwd ?? "";
      return {
        sessionPath: row.session_path,
        sessionName: row.session_name?.trim() || undefined,
        project: cwd ? basename(cwd) || cwd : "—",
        cwd,
        entryId: row.entry_id,
        role: row.role,
        sourceType: row.source_type,
        timestamp: row.timestamp,
        snippet,
        highlights,
      };
    });

    return { hits, total: total.c };
  }

  /** Sessions whose title, opening message or path matches — shown above message hits. */
  searchSessions(q: string, limit = 8): SessionSummary[] {
    const like = `%${q.trim()}%`;
    if (like.length <= 2) return [];

    const rows = this.#db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.name LIKE ? OR s.first_message LIKE ? OR s.cwd LIKE ?
         ORDER BY s.modified DESC LIMIT ?`,
      )
      .all(like, like, like, limit) as unknown as SessionRow[];

    return rows.map(toSummary);
  }

  #listFilter(options: ListOptions): { where: string; params: Array<string | number> } {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (options.q?.trim()) {
      const like = `%${options.q.trim()}%`;
      conditions.push("(s.name LIKE ? OR s.first_message LIKE ? OR s.cwd LIKE ?)");
      params.push(like, like, like);
    }
    if (options.cwd) {
      conditions.push("s.cwd = ?");
      params.push(options.cwd);
    }
    if (options.model) {
      conditions.push("s.model = ?");
      params.push(options.model);
    }

    const range = options.range ?? "all";
    if (range !== "all") {
      const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
      conditions.push("s.modified >= ?");
      params.push(since);
    }

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }
}
