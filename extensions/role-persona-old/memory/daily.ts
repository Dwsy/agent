/** Daily journal files and their generated summaries. */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logger.ts";
import { writeCommittedMemoryFile } from "../memory-git.ts";
import { dailyMemoryDir, dailyMemoryPath, dailySummaryDir, dailySummaryPath, listDailyMemoryFilesByDate } from "./paths.ts";
import { normalizeText, nowTime, today } from "./text.ts";

export function ensureDailySummaryDir(rolePath: string): void {
  const dir = dailySummaryDir(rolePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readDailySummary(rolePath: string, date: string): string | null {
  const path = dailySummaryPath(rolePath, date);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function writeDailySummary(rolePath: string, date: string, content: string): void {
  ensureDailySummaryDir(rolePath);
  const file = dailySummaryPath(rolePath, date);
  const expectedContent = existsSync(file) ? readFileSync(file, "utf-8") : null;
  writeCommittedMemoryFile(rolePath, file, content, `update daily summary ${date}`, { expectedContent });
}

export function readDailyMemoryRaw(rolePath: string, date: string): string | null {
  const path = dailyMemoryPath(rolePath, date);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

/**
 * Returns dates within the configured window (yesterday, day-before...) that have
 * a daily file but no summary yet. Fixed-date based (not "most recent files"),
 * so stale old files outside the window are ignored.
 */
export function listDailySummariesToGenerate(rolePath: string, recentDays: number): string[] {
  const pastSlots = Math.max(0, recentDays - 1);
  if (pastSlots === 0) return [];

  // Fixed date window: yesterday, 2 days ago...
  const targetDates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= pastSlots; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    targetDates.push(d.toISOString().slice(0, 10));
  }

  // Only check these fixed dates: needs daily file AND missing summary
  const result: string[] = [];
  for (const date of targetDates) {
    const daily = dailyMemoryPath(rolePath, date);
    const summary = dailySummaryPath(rolePath, date);
    if (existsSync(daily) && !existsSync(summary)) {
      result.push(date);
    }
  }
  return result;
}

/**
 * List all generated daily summaries (most recent first).
 * Used by the memory web viewer.
 */
export function listAllDailySummaries(
  rolePath: string
): Array<{ date: string; content: string; chars: number }> {
  const dir = dailySummaryDir(rolePath);
  if (!existsSync(dir)) return [];
  const out: Array<{ date: string; content: string; chars: number }> = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const filename of names) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    try {
      const content = readFileSync(join(dir, filename), "utf-8");
      out.push({ date: match[1], content, chars: content.length });
    } catch {
      // ignore unreadable
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

export function appendDailyRoleMemory(
  rolePath: string,
  category: "event" | "lesson" | "preference" | "context" | "decision",
  text: string,
  date = today()
): void {
  const section = `## [${nowTime()}] ${category.toUpperCase()}\n\n${normalizeText(text)}\n\n`;

  const writeOne = (file: string) => {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const exists = existsSync(file);
    const header = exists ? "" : `# Memory: ${date}\n\n`;
    const previous = exists ? readFileSync(file, "utf-8") : "";
    writeCommittedMemoryFile(rolePath, file, previous + header + section, `append daily memory ${date}`, {
      expectedContent: exists ? previous : null,
    });
  };

  writeOne(dailyMemoryPath(rolePath, date));

  log("daily-memory", `[${category}] ${text.slice(0, 120)}`);
}

/**
 * Get the N most recent existing daily memory files.
 * Returns array of {date, path} sorted by date descending (newest first).
 */
export function getRecentDailyMemoryFiles(rolePath: string, count: number = 2): Array<{ date: string; path: string }> {
  return listDailyMemoryFilesByDate(rolePath)
    .slice(0, count)
    .map((item) => ({ date: item.date, path: item.path }));
}

/** One `## [HH:MM] KIND` block inside a day's journal file. */
export interface DailyEntry {
  /** Position in the file: the only stable handle an entry has. */
  index: number;
  time?: string;
  kind?: string;
  text: string;
}

const DAILY_HEADING = /^##\s+(?:\[(\d{1,2}:\d{2})\]\s*)?(.*)$/;
const DAILY_WINDOW_DAYS = 30;

/** Keeps every block, including empty ones, so indices address the real file. */
export function parseDailyEntries(content: string): DailyEntry[] {
  const entries: DailyEntry[] = [];
  let current: { time?: string; kind?: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    entries.push({
      index: entries.length,
      time: current.time,
      kind: current.kind,
      text: current.body.join("\n").trim(),
    });
    current = null;
  };

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(DAILY_HEADING);
    if (heading) {
      flush();
      current = { time: heading[1] || undefined, kind: heading[2].trim() || undefined, body: [] };
      continue;
    }
    // Lines before the first heading are the `# Memory: <date>` title block.
    if (current) current.body.push(line);
  }
  flush();

  return entries;
}

export function renderDailyFile(date: string, entries: DailyEntry[]): string {
  const lines: string[] = [`# Memory: ${date}`, ""];
  for (const entry of entries) {
    const label = [entry.time ? `[${entry.time}]` : "", entry.kind || ""].filter(Boolean).join(" ").trim();
    lines.push(`## ${label || "Entry"}`, "", entry.text.trim(), "");
  }
  // Trailing blank line keeps appendDailyRoleMemory's concatenation clean.
  return lines.join("\n") + "\n";
}

export interface DailyMemory extends DailyEntry {
  date: string;
}

/** Recent journal entries, newest day first; empty blocks are not shown. */
export function readDailyMemories(rolePath: string): DailyMemory[] {
  let files: string[];
  try {
    files = readdirSync(dailyMemoryDir(rolePath))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, DAILY_WINDOW_DAYS);
  } catch {
    return []; // daily dir may not exist yet
  }

  const memories: DailyMemory[] = [];
  for (const file of files) {
    const date = file.replace(/\.md$/, "");
    let content: string;
    try {
      content = readFileSync(join(dailyMemoryDir(rolePath), file), "utf-8");
    } catch {
      continue;
    }
    for (const entry of parseDailyEntries(content)) {
      if (entry.text) memories.push({ ...entry, date });
    }
  }
  return memories;
}

function rewriteDailyFile(
  rolePath: string,
  date: string,
  action: string,
  mutate: (entries: DailyEntry[]) => string | null,
): { ok: boolean; reason?: string } {
  const file = dailyMemoryPath(rolePath, date);
  if (!existsSync(file)) return { ok: false, reason: "not found" };

  const previous = readFileSync(file, "utf-8");
  const entries = parseDailyEntries(previous);
  const rejection = mutate(entries);
  if (rejection) return { ok: false, reason: rejection };

  writeCommittedMemoryFile(rolePath, file, renderDailyFile(date, entries), `${action} ${date}`, {
    expectedContent: previous,
  });
  return { ok: true };
}

/**
 * Rewrite one journal entry. `expectedText` is the copy the caller was looking
 * at: indices shift when the agent appends, so the content is what confirms
 * the caller and the file still agree on which entry this is.
 */
export function updateDailyEntry(
  rolePath: string,
  date: string,
  index: number,
  text: string,
  expectedText?: string,
): { updated: boolean; reason?: string } {
  const next = text.trim();
  if (!next) return { updated: false, reason: "empty" };

  // The mutator returns a rejection reason, or null when it applied cleanly.
  const result = rewriteDailyFile(rolePath, date, "edit daily memory", (entries) => {
    const entry = entries[index];
    if (!entry) return "not found";
    if (expectedText !== undefined && entry.text !== expectedText) return "changed";
    entry.text = next;
    return null;
  });

  if (result.ok) log("daily-memory", `edited ${date}#${index}: ${next.slice(0, 120)}`);
  return { updated: result.ok, reason: result.reason };
}

export function deleteDailyEntry(
  rolePath: string,
  date: string,
  index: number,
  expectedText?: string,
): { deleted: boolean; reason?: string } {
  const result = rewriteDailyFile(rolePath, date, "delete daily memory", (entries) => {
    const entry = entries[index];
    if (!entry) return "not found";
    if (expectedText !== undefined && entry.text !== expectedText) return "changed";
    entries.splice(index, 1);
    return null;
  });

  if (result.ok) log("daily-memory", `deleted ${date}#${index}`);
  return { deleted: result.ok, reason: result.reason };
}
