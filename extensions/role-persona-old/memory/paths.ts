/** File-system layout of a role's memory directory (module-internal except dailySummaryPath). */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { today } from "./text.ts";

export function memoryRootDir(rolePath: string): string {
  return join(rolePath, "memory");
}

export function memoryFilePath(rolePath: string): string {
  return join(memoryRootDir(rolePath), "consolidated.md");
}

export function dailyMemoryDir(rolePath: string): string {
  return join(memoryRootDir(rolePath), "daily");
}

export function dailyMemoryPath(rolePath: string, date = today()): string {
  return join(dailyMemoryDir(rolePath), `${date}.md`);
}

export function dailySummaryDir(rolePath: string): string {
  return join(dailyMemoryDir(rolePath), "Summary");
}

export function dailySummaryPath(rolePath: string, date: string): string {
  return join(dailySummaryDir(rolePath), `${date}.md`);
}

export function pendingMemoryPath(rolePath: string): string {
  return join(memoryRootDir(rolePath), "pending.md");
}

export function listDailyMemoryFilesByDate(rolePath: string): Array<{ date: string; path: string }> {
  const dir = dailyMemoryDir(rolePath);
  if (!existsSync(dir)) return [];

  const files: Array<{ date: string; path: string }> = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  for (const filename of names) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    files.push({ date: match[1], path: join(dir, filename) });
  }

  files.sort((a, b) => b.date.localeCompare(a.date));
  return files;
}
