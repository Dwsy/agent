import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as http from "node:http";
import { exec } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join as pathJoin, isAbsolute, resolve as resolvePath, sep } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { log, logMemory } from "./logger.ts";
import {
  addRoleEvent,
  addRoleLearning,
  addRolePreference,
  buildMemoryExportData,
  CORE_FILE_DIRS,
  deleteDailyEntry,
  deleteRoleEvent,
  deleteRoleLearning,
  deleteRolePreference,
  discardPendingLearning,
  getPendingMemories,
  listRoleMemory,
  promotePendingLearning,
  readMemoryPromptBlocks,
  readRoleMemory,
  reinforceRoleLearning,
  renderMemoryViewerHtml,
  updateDailyEntry,
  updateRoleEvent,
  updateRoleLearning,
  updateRolePreference,
} from "./memory-md.ts";

export type MemoryViewFilter = "all" | "learnings" | "preferences" | "events";

export function buildRoleMemoryViewerMarkdown(
  rolePath: string,
  roleName: string,
  filter: MemoryViewFilter = "all"
): string {
  const summary = listRoleMemory(rolePath, roleName).text;
  const blocks = readMemoryPromptBlocks(rolePath, roleName);

  if (filter === "all") {
    return [summary, ...blocks].join("\n\n---\n\n");
  }

  const data = readRoleMemory(rolePath, roleName);

  if (filter === "learnings") {
    const learnings = [...data.learnings].sort((a, b) => {
      if (b.used !== a.used) return b.used - a.used;
      return a.text.localeCompare(b.text);
    });
    const lines = [
      `# Learnings (${learnings.length})`,
      "",
      ...(learnings.length > 0 ? learnings.map((l) => `- [${l.id}] [${l.used}x] ${l.text}`) : ["- (none)"]),
    ];
    return lines.join("\n");
  }

  if (filter === "preferences") {
    const byCategory = new Map<string, string[]>();
    for (const pref of data.preferences) {
      const list = byCategory.get(pref.category) || [];
      list.push(pref.text);
      byCategory.set(pref.category, list);
    }

    const categories = Array.from(byCategory.keys()).sort();
    const lines: string[] = [`# Preferences (${data.preferences.length})`, ""];
    if (categories.length === 0) {
      lines.push("- (none)");
    } else {
      for (const cat of categories) {
        lines.push(`## ${cat}`);
        for (const text of (byCategory.get(cat) || []).sort()) {
          lines.push(`- ${text}`);
        }
        lines.push("");
      }
    }
    return lines.join("\n").replace(/\n+$/, "");
  }

  const dailyBlocks = blocks.filter((b) => b.startsWith("### Daily Memory:"));
  const eventLines = data.events.length > 0
    ? data.events.flatMap((e) => [`## [${e.date}] ${e.title}`, ...(e.body ? [e.body] : []), ""])
    : ["- (none)"];
  const lines: string[] = ["# Events", "", ...eventLines];

  if (dailyBlocks.length > 0) {
    lines.push("", "---", "", "# Daily Memory Logs", "", ...dailyBlocks);
  }

  return lines.join("\n");
}

export class RoleMemoryViewerComponent {
  private filter: MemoryViewFilter = "all";
  private scrollOffset = 0;
  private allLines: string[] = [];
  private lastWidth = 0;
  private md!: Markdown;
  private disposed = false;

  constructor(
    private rolePath: string,
    private roleName: string,
    private tui: any,
    private theme: any,
    private done: () => void,
  ) {
    this.rebuildMarkdown();
  }

  private rebuildMarkdown(): void {
    const content = buildRoleMemoryViewerMarkdown(this.rolePath, this.roleName, this.filter);
    this.md = new Markdown(content, 1, 0, getMarkdownTheme());
    this.lastWidth = 0;
    this.allLines = [];
  }

  private setFilter(next: MemoryViewFilter): void {
    if (this.filter === next) return;
    this.filter = next;
    this.scrollOffset = 0;
    this.rebuildMarkdown();
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (this.disposed) return;

    const pageSize = Math.max(1, this.visibleLines() - 2);
    const maxScroll = Math.max(0, this.allLines.length - this.visibleLines());

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.disposed = true;
      this.done();
    } else if (data === "0" || data === "a" || data === "A") {
      this.setFilter("all");
    } else if (data === "1" || data === "l" || data === "L") {
      this.setFilter("learnings");
    } else if (data === "2" || data === "p" || data === "P") {
      this.setFilter("preferences");
    } else if (data === "3" || data === "e" || data === "E") {
      this.setFilter("events");
    } else if (matchesKey(data, "shift+up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, "shift+down")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + pageSize);
      this.tui.requestRender();
    } else if (matchesKey(data, Key.home) || matchesKey(data, "g")) {
      this.scrollOffset = 0;
      this.tui.requestRender();
    } else if (matchesKey(data, Key.end) || data === "G") {
      this.scrollOffset = maxScroll;
      this.tui.requestRender();
    }
  }

  private visibleLines(): number {
    return Math.max(1, process.stdout.rows - 9);
  }

  render(width: number): string[] {
    const th = this.theme;
    const innerW = Math.max(1, width - 2);

    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.allLines = this.md.render(innerW);
    }

    const visible = this.visibleLines();
    const maxScroll = Math.max(0, this.allLines.length - visible);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

    const border = (c: string) => th.fg("border", c);
    const accent = (c: string) => th.fg("accent", c);
    const dim = (c: string) => th.fg("dim", c);
    const result: string[] = [];

    const title = ` Role Memories `;
    const titleW = visibleWidth(title);
    const leftPad = Math.floor((innerW - titleW) / 2);
    const rightPad = innerW - titleW - leftPad;

    result.push(border("╭") + border("─".repeat(leftPad)) + accent(title) + border("─".repeat(rightPad)) + border("╮"));

    const total = this.allLines.length;
    const pos = total > 0 ? Math.floor(((this.scrollOffset + visible / 2) / Math.max(1, total)) * 100) : 0;
    const scrollInfo = `${Math.min(pos, 100)}% (${this.scrollOffset + 1}-${Math.min(this.scrollOffset + visible, total)}/${total})`;
    result.push(border("│") + truncateToWidth(dim(` ${scrollInfo}`), innerW, "", true) + border("│"));

    const tab = (label: string, key: string, active: boolean) =>
      active ? accent(th.bold(`[${key}] ${label}`)) : dim(`[${key}] ${label}`);

    const tabs = [
      tab("All", "0", this.filter === "all"),
      tab("Learnings", "1", this.filter === "learnings"),
      tab("Preferences", "2", this.filter === "preferences"),
      tab("Events", "3", this.filter === "events"),
    ].join("  ");

    result.push(border("│") + truncateToWidth(` ${tabs}`, innerW, "", true) + border("│"));
    result.push(border("├") + border("─".repeat(innerW)) + border("┤"));

    const visibleSlice = this.allLines.slice(this.scrollOffset, this.scrollOffset + visible);
    for (const line of visibleSlice) {
      result.push(border("│") + truncateToWidth(line, innerW, "…", true) + border("│"));
    }

    for (let i = visibleSlice.length; i < visible; i++) {
      result.push(border("│") + " ".repeat(innerW) + border("│"));
    }

    result.push(border("├") + border("─".repeat(innerW)) + border("┤"));
    const help = ` Role: ${this.roleName}  ·  0/1/2/3 filter  ↑↓/jk scroll  Shift+↑↓/PgUpDn page  Home/End jump  Esc close`;
    result.push(border("│") + truncateToWidth(dim(help), innerW, "", true) + border("│"));
    result.push(border("╰") + border("─".repeat(innerW)) + border("╯"));

    return result;
  }

  invalidate(): void {
    this.lastWidth = 0;
    this.md.invalidate();
  }
}

// ─── Memory server ───────────────────────────────────────────────────────────
//
// Serves the same viewer document as the static export, plus three read/write
// endpoints the static file cannot have: fresh data, role logs, core markdown.

export interface MemoryServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

interface LogEntry {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
  role?: string;
  duration_ms?: number;
}

interface LogAggregate {
  total: number;
  errors: number;
  warns: number;
  tags: Record<string, number>;
  hourly: Record<string, number>;
  roles: Record<string, number>;
}

const LOG_FILE_WINDOW = 7;
const LOG_ENTRY_LIMIT = 1000;
const ACTIVITY_WINDOW_MS = 48 * 3600_000;

function readRoleLogs(logDir: string, limit = LOG_ENTRY_LIMIT): LogEntry[] {
  let files: string[];
  try {
    files = readdirSync(logDir).filter((f) => f.endsWith(".jsonl")).sort().reverse().slice(0, LOG_FILE_WINDOW);
  } catch {
    return [];
  }

  const entries: LogEntry[] = [];
  for (const file of files) {
    let lines: string[];
    try {
      lines = readFileSync(pathJoin(logDir, file), "utf-8").split("\n");
    } catch {
      continue;
    }
    for (const line of lines) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        entries.push({
          timestamp: obj.timestamp,
          level: obj.level || "info",
          tag: obj.tag || "",
          message: obj.message || "",
          role: obj.context?.role,
          duration_ms: obj.timing?.duration_ms,
        });
      } catch {
        // a partially flushed line: skip it
      }
    }
  }
  return entries.slice(-limit);
}

function aggregateLogs(entries: LogEntry[]): LogAggregate {
  const tags: Record<string, number> = {};
  const hourly: Record<string, number> = {};
  const roles: Record<string, number> = {};
  const now = Date.now();
  let errors = 0;
  let warns = 0;

  for (const entry of entries) {
    if (entry.tag) tags[entry.tag] = (tags[entry.tag] || 0) + 1;
    if (entry.role) roles[entry.role] = (roles[entry.role] || 0) + 1;
    if (entry.level === "error") errors++;
    else if (entry.level === "warn") warns++;

    const at = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(at) && now - at <= ACTIVITY_WINDOW_MS) {
      const hour = entry.timestamp.slice(0, 13);
      hourly[hour] = (hourly[hour] || 0) + 1;
    }
  }

  return { total: entries.length, errors, warns, tags, hourly, roles };
}

/** Confines editing to `<role>/{core,context,knowledge}/*.md`. */
function resolveCoreFile(rolePath: string, file: string): string | null {
  const candidate = (file || "").trim();
  if (!candidate.endsWith(".md") || isAbsolute(candidate) || candidate.includes("..") || candidate.includes("\\")) {
    return null;
  }
  if (!CORE_FILE_DIRS.some((dir) => candidate.startsWith(`${dir}/`))) return null;

  const roleAbs = resolvePath(rolePath);
  const fileAbs = resolvePath(pathJoin(rolePath, candidate));
  const base = `${roleAbs}${roleAbs.endsWith(sep) ? "" : sep}`;
  if (!fileAbs.startsWith(base)) return null;

  return fileAbs;
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    req.on("data", (chunk) => chunks.push(chunk.toString()));
    req.on("end", () => resolve(chunks.join("")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function sendText(res: http.ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function handleCoreGet(rolePath: string, res: http.ServerResponse, file: string | null): void {
  if (!file) return sendText(res, 400, "Missing file parameter");

  const filePath = resolveCoreFile(rolePath, file);
  if (!filePath) return sendText(res, 403, "File outside the role's editable directories");

  try {
    sendText(res, 200, readFileSync(filePath, "utf-8"), "text/markdown; charset=utf-8");
  } catch {
    sendText(res, 404, `Not found: ${file}`);
  }
}

async function handleCoreWrite(rolePath: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: { file?: unknown; content?: unknown };
  try {
    const raw = await readRequestBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return sendText(res, 400, "Invalid JSON body");
  }

  if (typeof body.file !== "string" || !body.file) return sendText(res, 400, "Missing file");
  if (typeof body.content !== "string") return sendText(res, 400, "Missing or invalid content");

  const filePath = resolveCoreFile(rolePath, body.file);
  if (!filePath) return sendText(res, 403, "File outside the role's editable directories");

  try {
    // The directory can disappear while a tab is open; recreate rather than ENOENT.
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, body.content, "utf-8");
    sendJson(res, 200, { ok: true, file: body.file, bytes: Buffer.byteLength(body.content) });
  } catch (err) {
    sendText(res, 500, err instanceof Error ? err.message : "Failed to save");
  }
}

// ─── Memory mutations ────────────────────────────────────────────────────────

/** Records living in consolidated.md, addressed by content-derived id. */
type MemoryKind = "learning" | "preference" | "event";

const RECORD_KINDS: readonly string[] = ["learning", "preference", "event"];
/** Journal entries are addressed by date + position instead of by id. */
const EDITABLE_KINDS: readonly string[] = [...RECORD_KINDS, "daily"];

/** Carries the HTTP status a failed precondition should surface as. */
class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(400, `${field} is required`);
  return value.trim();
}

function requireKind(value: unknown, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new RequestError(400, `kind must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function requireRecordKind(value: unknown): MemoryKind {
  return requireKind(value, RECORD_KINDS) as MemoryKind;
}

/** A journal entry is identified by its day plus its position in that day. */
function requireDailyTarget(body: Record<string, unknown>): { date: string; index: number; previous?: string } {
  const date = requireString(body.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RequestError(400, "date must be YYYY-MM-DD");
  if (typeof body.index !== "number" || !Number.isInteger(body.index) || body.index < 0) {
    throw new RequestError(400, "index must be a non-negative integer");
  }
  return { date, index: body.index, previous: typeof body.previous === "string" ? body.previous : undefined };
}

function failDaily(reason?: string): never {
  if (reason === "changed" || reason === "not found") {
    throw new RequestError(409, "this journal entry changed on disk — reload to see the current version");
  }
  throw new RequestError(400, `not saved (${reason || "unknown"})`);
}

/**
 * The record mutators fall back to fuzzy text matching when an id misses. That
 * is right for the LLM tool and wrong here: the viewer always knows the exact
 * id, so a miss means the record changed underneath us and the edit must stop
 * rather than land on a lookalike.
 */
function requireRecord(rolePath: string, roleName: string, kind: MemoryKind, id: string): void {
  const data = readRoleMemory(rolePath, roleName);
  const pool = kind === "learning" ? data.learnings : kind === "preference" ? data.preferences : data.events;
  if (!pool.some((record) => record.id === id)) {
    throw new RequestError(409, `this ${kind} changed on disk — reload to see the current version`);
  }
}

function requirePending(rolePath: string, id: string): string {
  const item = getPendingMemories(rolePath).find((record) => record.id === id);
  if (!item) throw new RequestError(409, "this pending memory changed on disk — reload to see the current list");
  return item.text;
}

function audit(op: string, content: string, extra: Record<string, unknown>): void {
  logMemory(op.startsWith("update") ? "update" : op.startsWith("delete") ? "delete" : "add", {
    op,
    source: "viewer",
    content,
    stored: true,
    ...extra,
  });
}

function createMemory(rolePath: string, roleName: string, body: Record<string, unknown>): { id?: string; message: string } {
  const kind = requireRecordKind(body.kind);

  if (kind === "learning") {
    const text = requireString(body.text, "text");
    const result = addRoleLearning(rolePath, roleName, text, { source: "viewer", usePending: false });
    if (!result.stored) throw new RequestError(409, result.duplicate ? "an identical learning already exists" : `not stored (${result.reason})`);
    audit("learning", text, { id: result.id });
    return { id: result.id, message: "Learning added" };
  }

  if (kind === "preference") {
    const text = requireString(body.text, "text");
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "General";
    const result = addRolePreference(rolePath, roleName, category, text);
    if (!result.stored) throw new RequestError(409, result.duplicate ? "an identical preference already exists" : `not stored (${result.reason})`);
    audit("preference", text, { id: result.id, category: result.category });
    return { id: result.id, message: "Preference added" };
  }

  // An event may be a headline with no body, so either half satisfies it.
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const detail = typeof body.text === "string" ? body.text.trim() : "";
  if (!title && !detail) throw new RequestError(400, "a title or some details are required");

  const result = addRoleEvent(rolePath, roleName, detail || title, {
    title: title || undefined,
    date: typeof body.date === "string" && body.date ? body.date : undefined,
  });
  if (!result.stored) throw new RequestError(409, result.duplicate ? "a near-identical event already exists" : `not stored (${result.reason})`);
  audit("event", title || detail, { id: result.id });
  return { id: result.id, message: "Event added" };
}

function updateMemory(rolePath: string, roleName: string, body: Record<string, unknown>): { id?: string; message: string } {
  if (requireKind(body.kind, EDITABLE_KINDS) === "daily") {
    const target = requireDailyTarget(body);
    const text = requireString(body.text, "text");
    const result = updateDailyEntry(rolePath, target.date, target.index, text, target.previous);
    if (!result.updated) failDaily(result.reason);
    audit("update_daily", text, { detail: `${target.date}#${target.index}` });
    return { message: "Journal entry updated" };
  }

  const kind = requireRecordKind(body.kind);
  const id = requireString(body.id, "id");
  requireRecord(rolePath, roleName, kind, id);

  if (kind === "learning") {
    const text = requireString(body.text, "text");
    const result = updateRoleLearning(rolePath, roleName, id, text);
    if (!result.updated) throw new RequestError(409, result.reason === "duplicate" ? "another learning already has this text" : `not updated (${result.reason})`);
    audit("update_learning", text, { id: result.id, oldId: result.oldId, previous: result.oldText });
    return { id: result.id, message: "Learning updated" };
  }

  if (kind === "preference") {
    const text = requireString(body.text, "text");
    const category = typeof body.category === "string" ? body.category : undefined;
    const result = updateRolePreference(rolePath, roleName, id, text, category);
    if (!result.updated) throw new RequestError(409, result.reason === "duplicate" ? "another preference already has this text" : `not updated (${result.reason})`);
    audit("update_preference", text, { id: result.id, oldId: result.oldId, previous: result.oldText, category: result.category });
    return { id: result.id, message: "Preference updated" };
  }

  const title = typeof body.title === "string" ? body.title : undefined;
  const detail = typeof body.text === "string" ? body.text : undefined;
  if (title !== undefined && detail !== undefined && !title.trim() && !detail.trim()) {
    throw new RequestError(400, "a title or some details are required");
  }

  const result = updateRoleEvent(rolePath, roleName, id, {
    title: title,
    body: detail,
    date: typeof body.date === "string" ? body.date : undefined,
  });
  if (!result.updated) throw new RequestError(409, result.reason === "duplicate" ? "another event already has this content" : `not updated (${result.reason})`);
  audit("update_event", result.title || "", { id: result.id, oldId: result.oldId });
  return { id: result.id, message: "Event updated" };
}

function deleteMemory(rolePath: string, roleName: string, body: Record<string, unknown>): { message: string } {
  if (requireKind(body.kind, EDITABLE_KINDS) === "daily") {
    const target = requireDailyTarget(body);
    const result = deleteDailyEntry(rolePath, target.date, target.index, target.previous);
    if (!result.deleted) failDaily(result.reason);
    audit("delete_daily", target.previous || "", { detail: `${target.date}#${target.index}` });
    return { message: "Journal entry deleted" };
  }

  const kind = requireRecordKind(body.kind);
  const id = requireString(body.id, "id");
  requireRecord(rolePath, roleName, kind, id);

  if (kind === "learning") {
    const result = deleteRoleLearning(rolePath, roleName, id);
    if (!result.deleted) throw new RequestError(409, `not deleted (${result.reason})`);
    audit("delete_learning", result.text || "", { id: result.id });
    return { message: "Learning deleted" };
  }

  if (kind === "preference") {
    const result = deleteRolePreference(rolePath, roleName, id);
    if (!result.deleted) throw new RequestError(409, `not deleted (${result.reason})`);
    audit("delete_preference", result.text || "", { id: result.id, category: result.category });
    return { message: "Preference deleted" };
  }

  const result = deleteRoleEvent(rolePath, roleName, id);
  if (!result.deleted) throw new RequestError(409, `not deleted (${result.reason})`);
  audit("delete_event", result.title || "", { id: result.id });
  return { message: "Event deleted" };
}

function applyMemoryMutation(
  rolePath: string,
  roleName: string,
  body: Record<string, unknown>,
): { id?: string; message: string } {
  switch (body.action) {
    case "create":
      return createMemory(rolePath, roleName, body);

    case "update":
      return updateMemory(rolePath, roleName, body);

    case "delete":
      return deleteMemory(rolePath, roleName, body);

    case "reinforce": {
      const id = requireString(body.id, "id");
      requireRecord(rolePath, roleName, "learning", id);
      const result = reinforceRoleLearning(rolePath, roleName, id);
      if (!result.updated) throw new RequestError(409, "learning could not be reinforced");
      audit("reinforce", result.text || "", { id: result.id, detail: `${result.used}x` });
      return { id: result.id, message: `Reinforced to ${result.used}\u00d7` };
    }

    case "promote": {
      const id = requireString(body.id, "id");
      const text = requirePending(rolePath, id);
      const result = promotePendingLearning(rolePath, roleName, id);
      if (!result.promoted) throw new RequestError(409, "pending memory could not be promoted");
      audit("promote", text, { id: result.id });
      return { message: "Promoted to long-term memory" };
    }

    case "discard": {
      const id = requireString(body.id, "id");
      const text = requirePending(rolePath, id);
      const result = discardPendingLearning(rolePath, id);
      if (!result.discarded) throw new RequestError(409, "pending memory could not be discarded");
      audit("discard", text, { id: result.id });
      return { message: "Discarded" };
    }

    default:
      throw new RequestError(400, "action must be create, update, delete, reinforce, promote or discard");
  }
}

async function handleMemoryMutation(
  rolePath: string,
  roleName: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    const raw = await readRequestBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return sendText(res, 400, "Invalid JSON body");
  }

  try {
    const result = applyMemoryMutation(rolePath, roleName, body);
    log("memory-viewer", `${String(body.action)} ${String(body.kind || "pending")}: ${result.message}`);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    if (err instanceof RequestError) return sendText(res, err.status, err.message);
    const message = err instanceof Error ? err.message : "Mutation failed";
    // memory-git refuses writes when the file moved under us.
    const conflict = message.includes("changed concurrently");
    log("memory-viewer", `mutation failed: ${message}`);
    sendText(res, conflict ? 409 : 500, conflict ? "memory changed on disk — reload and try again" : message);
  }
}

export function startMemoryServer(rolePath: string, roleName: string): Promise<MemoryServerHandle> {
  const logDir = pathJoin(rolePath, "..", ".log");

  const server = http.createServer(async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url || "/", "http://127.0.0.1");
    } catch {
      return sendText(res, 400, "Invalid URL");
    }

    // Data is rebuilt per request: the agent keeps writing while this is open.
    if (url.pathname === "/api/data") {
      return sendJson(res, 200, buildMemoryExportData(rolePath, roleName, "live"));
    }

    if (url.pathname === "/api/logs") {
      const entries = readRoleLogs(logDir);
      return sendJson(res, 200, { entries, agg: aggregateLogs(entries) });
    }

    if (url.pathname === "/api/core") {
      if (req.method === "GET") return handleCoreGet(rolePath, res, url.searchParams.get("file"));
      if (req.method === "PUT" || req.method === "POST") return handleCoreWrite(rolePath, req, res);
      return sendText(res, 405, "Method not allowed");
    }

    if (url.pathname === "/api/memory") {
      if (req.method !== "POST") return sendText(res, 405, "Method not allowed");
      return handleMemoryMutation(rolePath, roleName, req, res);
    }

    if (url.pathname !== "/") return sendText(res, 404, "Not found");

    try {
      const html = renderMemoryViewerHtml(buildMemoryExportData(rolePath, roleName, "live"));
      sendText(res, 200, html, "text/html; charset=utf-8");
    } catch (err) {
      sendText(res, 500, err instanceof Error ? err.message : "Failed to render viewer");
    }
  });

  return new Promise((resolve, reject) => {
    const onBindError = (err: Error) => reject(err);
    server.once("error", onBindError);

    // Port 0: let the OS hand out a free port instead of guessing at one.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("memory server did not bind to a TCP port"));
        return;
      }

      // Past binding, an error event must not silently settle a done promise.
      server.off("error", onBindError);
      server.on("error", (err) => log("memory-viewer", `server error: ${err.message}`));

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

export async function openMemoryServer(rolePath: string, roleName: string): Promise<MemoryServerHandle> {
  const handle = await startMemoryServer(rolePath, roleName);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  await execAsync(`${cmd} "${handle.url}"`);
  return handle;
}
