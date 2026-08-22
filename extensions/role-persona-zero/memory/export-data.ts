/**
 * Data contract for the memory web viewer.
 *
 * One builder feeds both delivery modes: the live HTTP server (memory-viewer.ts)
 * and the self-contained static export (html-export.ts). Keeping a single
 * builder is what stops the two surfaces from drifting apart.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTagCloud } from "../memory-tags.ts";
import { readRoleMemory } from "./consolidated.ts";
import { readDailyMemories } from "./daily.ts";
import { getPendingMemories } from "./pending.ts";
import { eventSearchText } from "./types.ts";

/** `live` talks to the local server APIs; `static` is a single offline file. */
export type ViewerMode = "live" | "static";

/** How often a learning has been reinforced, bucketed for display. */
export type LearningTier = "reinforced" | "active" | "new";

export interface ViewerLearning {
  id: string;
  text: string;
  used: number;
  tier: LearningTier;
  source?: string;
  tags: string[];
  date?: string;
}

export interface ViewerPreference {
  id: string;
  text: string;
  category: string;
  tags: string[];
}

export interface ViewerEvent {
  id: string;
  title: string;
  body: string;
  text: string;
  date: string;
}

export interface ViewerDaily {
  text: string;
  date: string;
  /** Position inside that day's file; together with `date` it addresses the entry. */
  index: number;
  time?: string;
  kind?: string;
}

export interface ViewerPending {
  id: string;
  text: string;
  source: string;
  category?: string;
  createdAt: string;
  promoted: boolean;
}

export interface ViewerTag {
  name: string;
  /** Times the tag was applied over the role's history (persisted tag index). */
  count: number;
  /** Items in the current snapshot that still carry the tag; may be 0. */
  items: number;
  /** Forgetting-curve adjusted strength, 0–100. */
  strength: number;
}

export interface ViewerCoreFile {
  dir: string;
  name: string;
  path: string;
  size: number;
}

export interface ViewerStats {
  total: number;
  learnings: number;
  preferences: number;
  events: number;
  daily: number;
  pending: number;
  reinforced: number;
  waiting: number;
  byCategory: Record<string, number>;
  byTier: Record<LearningTier, number>;
}

export interface MemoryExportData {
  mode: ViewerMode;
  title: string;
  roleName: string;
  updatedAt: string;
  generatedAt: string;
  learnings: ViewerLearning[];
  preferences: ViewerPreference[];
  events: ViewerEvent[];
  daily: ViewerDaily[];
  pending: ViewerPending[];
  tags: ViewerTag[];
  coreFiles: ViewerCoreFile[];
  stats: ViewerStats;
}

/** Directories exposed as editable "role definition" markdown in live mode. */
export const CORE_FILE_DIRS = ["core", "context", "knowledge"] as const;

function learningTier(used: number): LearningTier {
  if (used >= 3) return "reinforced";
  if (used > 0) return "active";
  return "new";
}

function scanCoreFiles(rolePath: string): ViewerCoreFile[] {
  const files: ViewerCoreFile[] = [];
  for (const dir of CORE_FILE_DIRS) {
    let entries: string[];
    try {
      entries = readdirSync(join(rolePath, dir));
    } catch {
      continue; // optional directory
    }
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".md")) continue;
      try {
        const stat = statSync(join(rolePath, dir, entry));
        if (!stat.isFile()) continue;
        files.push({ dir, name: entry.replace(/\.md$/, ""), path: `${dir}/${entry}`, size: stat.size });
      } catch {
        // unreadable entry: skip rather than fail the whole view
      }
    }
  }
  return files;
}

/**
 * Tags live in two places: the durable vocabulary index the tagger maintains,
 * and whatever tags happen to be attached to items in this snapshot. Merge both
 * so the view stays honest when one side is empty.
 */
function collectTags(
  rolePath: string,
  learnings: ViewerLearning[],
  preferences: ViewerPreference[],
): ViewerTag[] {
  const merged = new Map<string, ViewerTag>();

  let cloud: Array<{ tag: string; count: number; strength: number }> = [];
  try {
    cloud = getTagCloud(rolePath, 500);
  } catch {
    cloud = []; // no tag index yet
  }

  for (const entry of cloud) {
    merged.set(entry.tag.toLowerCase(), {
      name: entry.tag,
      count: entry.count,
      items: 0,
      strength: Math.round(entry.strength),
    });
  }

  const bump = (raw: string) => {
    const key = raw.toLowerCase();
    const tag = merged.get(key) || { name: raw, count: 0, items: 0, strength: 0 };
    tag.items += 1;
    if (tag.count < tag.items) tag.count = tag.items;
    merged.set(key, tag);
  };
  for (const item of learnings) for (const tag of item.tags) bump(tag);
  for (const item of preferences) for (const tag of item.tags) bump(tag);

  return Array.from(merged.values()).sort((a, b) =>
    b.items - a.items || b.count - a.count || a.name.localeCompare(b.name));
}

export function buildMemoryExportData(
  rolePath: string,
  roleName: string,
  mode: ViewerMode,
): MemoryExportData {
  const data = readRoleMemory(rolePath, roleName);

  const learnings: ViewerLearning[] = data.learnings.map((l) => ({
    id: l.id,
    text: l.text,
    used: l.used,
    tier: learningTier(l.used),
    source: l.source,
    tags: l.tags || [],
    date: l.lastAccessed,
  }));

  const preferences: ViewerPreference[] = data.preferences.map((p) => ({
    id: p.id,
    text: p.text,
    category: p.category || "general",
    tags: p.tags || [],
  }));

  const events: ViewerEvent[] = data.events.map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    text: eventSearchText(e),
    date: e.date,
  }));

  const daily = readDailyMemories(rolePath);

  const pending: ViewerPending[] = getPendingMemories(rolePath)
    .filter((p) => !p.discarded)
    .map((p) => ({
      id: p.id,
      text: p.text,
      source: p.source,
      category: p.category,
      createdAt: p.createdAt,
      promoted: p.promoted,
    }));

  const byCategory: Record<string, number> = {};
  for (const p of preferences) byCategory[p.category] = (byCategory[p.category] || 0) + 1;

  const byTier: Record<LearningTier, number> = { reinforced: 0, active: 0, new: 0 };
  for (const l of learnings) byTier[l.tier] += 1;

  return {
    mode,
    title: `${roleName} · memory`,
    roleName,
    updatedAt: data.metadata?.updated || new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    learnings,
    preferences,
    events,
    daily,
    pending,
    tags: collectTags(rolePath, learnings, preferences),
    coreFiles: mode === "live" ? scanCoreFiles(rolePath) : [],
    stats: {
      total: learnings.length + preferences.length + events.length + daily.length + pending.length,
      learnings: learnings.length,
      preferences: preferences.length,
      events: events.length,
      daily: daily.length,
      pending: pending.length,
      reinforced: byTier.reinforced,
      waiting: pending.filter((p) => !p.promoted).length,
      byCategory,
      byTier,
    },
  };
}
