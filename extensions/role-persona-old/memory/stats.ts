/** Read-only listings, fact extraction, and aggregate statistics. */
import { readRoleMemory } from "./consolidated.ts";
import { listDailyMemoryFilesByDate } from "./paths.ts";
import { getPendingMemories } from "./pending.ts";
import { eventSearchText, type MemoryLearningRecord } from "./types.ts";

export type MemoryReadSection = "all" | "learnings" | "preferences" | "events" | "pending";

const READ_VIEW_SECTIONS: readonly MemoryReadSection[] = ["all", "learnings", "preferences", "events", "pending"];

export function isMemoryReadSection(value: string): value is MemoryReadSection {
  return READ_VIEW_SECTIONS.includes(value as MemoryReadSection);
}

function renderLearningTier(title: string, items: MemoryLearningRecord[]): string[] {
  const lines = [`### ${title}`];
  if (items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const l of items) {
      const tags = l.tags?.length ? ` (tags: ${l.tags.join(", ")})` : "";
      lines.push(`- [id:${l.id}] [${l.used}x] ${l.text}${tags}`);
    }
  }
  lines.push("");
  return lines;
}

/**
 * Full ID-annotated memory view for autonomous model editing.
 * Every entry carries `[id:xxxxxxxxxx]` so the model can target it directly
 * with update/delete/reinforce/promote actions — no search roundtrip needed.
 */
export function renderMemoryReadView(
  rolePath: string,
  roleName: string,
  section: MemoryReadSection = "all"
): { text: string; learnings: number; preferences: number; events: number; pending: number } {
  const data = readRoleMemory(rolePath, roleName);
  const pendingItems = getPendingMemories(rolePath);
  const lines: string[] = [];

  if (section === "all" || section === "learnings") {
    const sorted = [...data.learnings].sort((a, b) => b.used - a.used || a.text.localeCompare(b.text));
    lines.push(...renderLearningTier("Learnings (High Priority)", sorted.filter((l) => l.used >= 3)));
    lines.push(...renderLearningTier("Learnings (Normal)", sorted.filter((l) => l.used >= 1 && l.used < 3)));
    lines.push(...renderLearningTier("Learnings (New)", sorted.filter((l) => l.used === 0)));
  }

  if (section === "all" || section === "preferences") {
    const byCategory = new Map<string, typeof data.preferences>();
    for (const pref of data.preferences) {
      const list = byCategory.get(pref.category) || [];
      list.push(pref);
      byCategory.set(pref.category, list);
    }
    lines.push("### Preferences");
    if (data.preferences.length === 0) lines.push("- (none)");
    for (const [category, items] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      for (const p of [...items].sort((a, b) => a.text.localeCompare(b.text))) {
        lines.push(`- [id:${p.id}] [${category}] ${p.text}`);
      }
    }
    lines.push("");
  }

  if (section === "all" || section === "events") {
    lines.push("### Events");
    if (data.events.length === 0) lines.push("- (none)");
    for (const e of data.events) {
      lines.push(`- [id:${e.id}] [${e.date || "?"}] ${e.title}`);
      if (e.body.trim()) {
        const body = e.body.length > 300 ? `${e.body.slice(0, 300)}…` : e.body;
        lines.push(...body.split("\n").map((line) => `  ${line}`));
      }
    }
    lines.push("");
  }

  if (section === "all" || section === "pending") {
    lines.push("### Pending (unreviewed auto-extracted candidates — promote_pending or discard_pending)");
    if (pendingItems.length === 0) lines.push("- (none)");
    for (const p of pendingItems) {
      lines.push(`- [id:${p.id}] [${p.source}] [${p.createdAt}] ${p.text}`);
    }
  }

  return {
    text: lines.join("\n").replace(/\n+$/, ""),
    learnings: data.learnings.length,
    preferences: data.preferences.length,
    events: data.events.length,
    pending: pendingItems.length,
  };
}

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
