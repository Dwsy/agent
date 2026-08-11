/** Daily journal files and their generated summaries. */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logger.ts";
import { writeCommittedMemoryFile } from "../memory-git.ts";
import { dailyMemoryPath, dailySummaryDir, dailySummaryPath, listDailyMemoryFilesByDate } from "./paths.ts";
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

/**
 * Read all daily memory files
 */
export function readDailyMemories(rolePath: string): Array<{ text: string; date: string; time?: string }> {
  const dailyDir = join(rolePath, "memory", "daily");
  const memories: Array<{ text: string; date: string; time?: string }> = [];

  try {
    const files = readdirSync(dailyDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
    for (const file of files.slice(0, 30)) { // Latest 30 days
      const date = file.replace('.md', '');
      const content = readFileSync(join(dailyDir, file), 'utf-8');
      // Parse entries (## [HH:MM] text format)
      const entries = content.split(/^## /m).filter(Boolean);
      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        const firstLine = lines[0] || '';
        const text = lines.slice(1).join(' ').trim();
        if (text) {
          // Extract time from first line if present
          const timeMatch = firstLine.match(/^\[(\d{2}:\d{2})\]/);
          memories.push({
            text,
            date,
            time: timeMatch ? timeMatch[1] : undefined
          });
        }
      }
    }
  } catch {
    // Daily dir may not exist
  }

  return memories;
}
