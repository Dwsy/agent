/** Prompt-injection blocks: long-term / daily context, on-demand recall, edit spec. */
import { existsSync, readFileSync } from "node:fs";
import { config } from "../config.ts";
import { readRoleMemory } from "./consolidated.ts";
import { getRecentDailyMemoryFiles, readDailySummary } from "./daily.ts";
import { dailyMemoryPath, listDailyMemoryFilesByDate, memoryFilePath } from "./paths.ts";
import { getPendingMemories } from "./pending.ts";
import { formatSearchMatchLine, searchRoleMemory } from "./search.ts";
import { today } from "./text.ts";

export function readMemoryPromptBlocks(
  rolePath: string,
  roleName: string,
  options?: { summaryEnabled?: boolean; recentDays?: number }
): string[] {
  const blocks: string[] = [];
  const longTerm = readLongTermMemoryBlock(rolePath, roleName);
  if (longTerm) blocks.push(longTerm);
  blocks.push(...readDailyMemoryBlocks(rolePath, options));
  return blocks;
}

/**
 * Long-term consolidated memory as a single prompt block, or null if empty.
 *
 * Rendered from parsed data (not a raw file dump) so every entry carries its
 * `[id:xxxxxxxxxx]` — the model can target any entry for update/delete/
 * reinforce without a search roundtrip. Frontmatter and machine-owned meta
 * comments are dropped to save prompt tokens.
 */
export function readLongTermMemoryBlock(rolePath: string, roleName: string): string | null {
  const memoryFile = memoryFilePath(rolePath);
  if (!existsSync(memoryFile)) return null;

  const data = readRoleMemory(rolePath, roleName);
  if (data.learnings.length === 0 && data.preferences.length === 0 && data.events.length === 0) {
    return null;
  }

  const lines: string[] = [
    "### Long-Term Memory",
    "",
    "Every entry carries [id:...] — pass that id to role_exec update_*/delete_*/reinforce ops directly.",
    "",
  ];

  const sorted = [...data.learnings].sort((a, b) => b.used - a.used || a.text.localeCompare(b.text));
  const tiers: Array<[string, (used: number) => boolean]> = [
    ["Learnings (High Priority)", (used) => used >= 3],
    ["Learnings (Normal)", (used) => used >= 1 && used < 3],
    ["Learnings (New)", (used) => used === 0],
  ];
  for (const [title, match] of tiers) {
    const items = sorted.filter((l) => match(l.used));
    if (items.length === 0) continue;
    lines.push(`#### ${title}`);
    for (const l of items) lines.push(`- [id:${l.id}] [${l.used}x] ${l.text}`);
    lines.push("");
  }

  if (data.preferences.length > 0) {
    lines.push("#### Preferences");
    const prefs = [...data.preferences].sort((a, b) => a.category.localeCompare(b.category) || a.text.localeCompare(b.text));
    for (const p of prefs) lines.push(`- [id:${p.id}] [${p.category}] ${p.text}`);
    lines.push("");
  }

  if (data.events.length > 0) {
    lines.push("#### Events");
    for (const e of data.events) {
      lines.push(`- [id:${e.id}] [${e.date || "?"}] ${e.title}`);
      if (e.body.trim()) lines.push(...e.body.split("\n").map((line) => `  ${line}`));
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "");
}

/**
 * Pending review block: surfaces unreviewed auto-extracted candidates so the
 * model can curate them (promote/discard) instead of leaving them to expire.
 * Returns null when there is nothing to review.
 */
export function buildPendingReviewBlock(rolePath: string, maxItems = 8): string | null {
  const items = getPendingMemories(rolePath);
  if (items.length === 0) return null;

  const lines = [
    `### Pending Memories Awaiting Review (${items.length})`,
    "",
    "Background extraction produced these unverified candidates. When convenient (not mid-task), review them:",
    "keep → role_exec({ op: \"promote_pending\", args: { id } }) · drop → role_exec({ op: \"discard_pending\", args: { id } }). Batch via args.ids. Unreviewed items expire after a few days.",
    "",
  ];
  for (const item of items.slice(0, maxItems)) {
    lines.push(`- [id:${item.id}] [${item.source}] ${item.text}`);
  }
  if (items.length > maxItems) {
    lines.push(`- … ${items.length - maxItems} more — role_exec({ op: "read", args: { section: "pending" } })`);
  }
  return lines.join("\n");
}

/**
 * Read daily memory blocks (today full + past summaries / past full fallback).
 * Same logic as readMemoryPromptBlocks but excludes the long-term block.
 */
export function readDailyMemoryBlocks(
  rolePath: string,
  options?: { summaryEnabled?: boolean; recentDays?: number }
): string[] {
  const blocks: string[] = [];
  const cfg = config.memory.dailySummary;
  const summaryEnabled = options?.summaryEnabled ?? cfg.enabled;
  const recentDays = Math.max(1, options?.recentDays ?? cfg.recentDays);

  if (!summaryEnabled) {
    const recentDailyFiles = getRecentDailyMemoryFiles(rolePath, recentDays);
    for (const { date, path } of recentDailyFiles) {
      blocks.push(`### Daily Memory: ${date}\n\n${readFileSync(path, "utf-8")}`);
    }
    return blocks;
  }

  const todayStr = today();
  const todayFullPath = dailyMemoryPath(rolePath, todayStr);
  if (existsSync(todayFullPath)) {
    blocks.push(`### Daily Memory: ${todayStr}\n\n${readFileSync(todayFullPath, "utf-8")}`);
  }

  const pastSlots = recentDays - 1;
  if (pastSlots > 0) {
    const all = listDailyMemoryFilesByDate(rolePath);
    let used = 0;
    for (const { date, path } of all) {
      if (date === todayStr) continue;
      if (used >= pastSlots) break;
      const summary = readDailySummary(rolePath, date);
      if (summary) {
        blocks.push(`### Daily Memory Summary: ${date}\n\n${summary}`);
      } else {
        blocks.push(`### Daily Memory: ${date}\n\n${readFileSync(path, "utf-8")}`);
      }
      used += 1;
    }
  }

  return blocks;
}

/**
 * Load high priority memories (used >= 3) for essential context.
 */
export function loadHighPriorityMemories(rolePath: string, roleName: string): string {
  const data = readRoleMemory(rolePath, roleName);
  const highPriority = data.learnings
    .filter((l) => l.used >= 3)
    .sort((a, b) => b.used - a.used)
    .slice(0, 10);

  if (highPriority.length === 0) return "";

  const lines = highPriority.map((l) => `- [id:${l.id}] [${l.used}x] ${l.text}`);
  return `### High Priority Learnings\n\n${lines.join("\n")}`;
}

/**
 * On-demand memory loading: search relevant memories based on query.
 * Returns matching memories formatted for prompt injection.
 */
export function loadMemoryOnDemand(
  rolePath: string,
  roleName: string,
  query: string,
  options?: {
    maxResults?: number;
    minScore?: number;
    includeHighPriority?: boolean;
  }
): { content: string; matchCount: number; searchQuery: string } {
  const maxResults = options?.maxResults ?? 5;
  const minScore = options?.minScore ?? 0.2;
  const includeHighPriority = options?.includeHighPriority ?? true;

  const blocks: string[] = [];
  let matchCount = 0;

  // Always include high priority memories as essential context
  if (includeHighPriority) {
    const highPriority = loadHighPriorityMemories(rolePath, roleName);
    if (highPriority) {
      blocks.push(highPriority);
    }
  }

  // Search for query-relevant memories
  if (query.trim()) {
    const matches = searchRoleMemory(rolePath, roleName, query, {
      maxResults,
      minScore,
      includeDailyMemory: false, // Only search curated memory for precision
    });

    matchCount = matches.length;

    if (matches.length > 0) {
      const relevantLines = matches.map((m) => `- ${formatSearchMatchLine(m)}`);
      blocks.push(`### Relevant Memories (search: "${query.slice(0, 50)}${query.length > 50 ? "..." : ""}")\n\n${relevantLines.join("\n")}`);
    }
  }

  const content = blocks.join("\n\n---\n\n");
  return { content, matchCount, searchQuery: query };
}

export function buildMemoryEditInstruction(rolePath: string): string {
  return `## 🧠 Memory Edit Spec\n\nPrefer \`role_exec\` ops for all edits — they handle ids, dedupe, tiers, git commits, and vector index sync automatically. Injected memory entries carry [id:...]; pass that id straight to update_*/delete_*/reinforce/promote_pending.\n\nDirect file editing (${memoryFilePath(rolePath)}) is a fallback for bulk restructuring only. If you do edit the file, follow this format exactly:\n\n1) Learning sections\n- # Learnings (High Priority)  -> used >= 3\n- # Learnings (Normal)         -> used 1-2\n- # Learnings (New)            -> used = 0\n- Learning line format: - [Nx] concise text\n\n2) Preference sections\n- # Preferences: Communication | Code | Tools | Workflow | General\n- Preference line format: - concise text\n\n3) Event section\n- # Events\n- Event format:\n  ## [YYYY-MM-DD] Title\n  Details...\n\nRules:\n- Keep items durable and reusable across sessions.\n- Avoid one-off tasks and noisy logs.\n- Do not delete valid memory entries unless clearly duplicated.\n- If file looks malformed, normalize to canonical heading structure.\n- Never use free-form paragraphs under learning/preference sections; use bullet lines.\n- Keep learning/preference lines under 120 chars when possible.\n- After a direct file edit, run role_exec({ op: "repair" }) to normalize, then role_exec({ op: "vector_rebuild" }) if vector memory is enabled.`;
}
