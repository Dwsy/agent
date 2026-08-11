/** Read-only listings, fact extraction, and aggregate statistics. */
import { readRoleMemory } from "./consolidated.ts";
import { listDailyMemoryFilesByDate } from "./paths.ts";
import { getPendingMemories } from "./pending.ts";
import { eventSearchText } from "./types.ts";

export function listRoleMemory(rolePath: string, roleName: string): {
  text: string;
  learnings: number;
  preferences: number;
  events: number;
  pending: number;
  issues: number;
} {
  const data = readRoleMemory(rolePath, roleName);
  const pendingItems = getPendingMemories(rolePath);

  const learningLines = data.learnings
    .sort((a, b) => b.used - a.used)
    .slice(0, 20)
    .map((l) => `- [${l.id}] [${l.used}x] ${l.text}`);

  const prefLines = data.preferences
    .slice(0, 20)
    .map((p) => `- [${p.id}] [${p.category}] ${p.text}`);

  const eventLines = data.events
    .slice(0, 15)
    .map((e) => `- [${e.id}] [${e.date || "?"}] ${e.title || eventSearchText(e).slice(0, 100)}`);

  const pendingLines = pendingItems
    .slice(0, 15)
    .map((p) => `- [${p.id || "?"}] [${p.source}] ${p.text}`);

  const text = [
    `## Memory (${roleName})`,
    "",
    `- Learnings: ${data.learnings.length}`,
    `- Preferences: ${data.preferences.length}`,
    `- Events: ${data.events.length}`,
    `- Pending: ${pendingItems.length}`,
    `- Parse issues: ${data.issues.length}`,
    "",
    "### Learnings",
    ...(learningLines.length > 0 ? learningLines : ["- (none)"]),
    "",
    "### Preferences",
    ...(prefLines.length > 0 ? prefLines : ["- (none)"]),
    "",
    "### Events",
    ...(eventLines.length > 0 ? eventLines : ["- (none)"]),
    "",
    "### Pending",
    ...(pendingLines.length > 0 ? pendingLines : ["- (none)"]),
  ].join("\n");

  return {
    text,
    learnings: data.learnings.length,
    preferences: data.preferences.length,
    events: data.events.length,
    pending: pendingItems.length,
    issues: data.issues.length,
  };
}

export function extractMemoryFacts(
  rolePath: string,
  roleName: string
): {
  learnings: Array<{ id: string; text: string }>;
  preferences: Array<{ id: string; category: string; text: string }>;
} {
  const data = readRoleMemory(rolePath, roleName);
  return {
    learnings: data.learnings.map((l) => ({ id: l.id, text: l.text })),
    preferences: data.preferences.map((p) => ({ id: p.id, category: p.category, text: p.text })),
  };
}

export interface MemoryStats {
  roleName: string;
  learnings: { total: number; highPriority: number; normal: number; new: number };
  preferences: { total: number; categories: Record<string, number> };
  events: number;
  dailyMemoryFiles: number;
  lastConsolidated: string | null;
}

/**
 * Get statistics about a role's memory.
 */
export function getMemoryStats(rolePath: string, roleName: string): MemoryStats {
  const data = readRoleMemory(rolePath, roleName);

  const highPriority = data.learnings.filter((l) => l.used >= 3).length;
  const normal = data.learnings.filter((l) => l.used >= 1 && l.used < 3).length;
  const newLearnings = data.learnings.filter((l) => l.used === 0).length;

  const categories: Record<string, number> = {};
  for (const pref of data.preferences) {
    categories[pref.category] = (categories[pref.category] || 0) + 1;
  }

  const dailyFiles = listDailyMemoryFilesByDate(rolePath).length;

  return {
    roleName,
    learnings: { total: data.learnings.length, highPriority, normal, new: newLearnings },
    preferences: { total: data.preferences.length, categories },
    events: data.events.length,
    dailyMemoryFiles: dailyFiles,
    lastConsolidated: data.lastConsolidated ?? null,
  };
}
