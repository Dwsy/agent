/** Text normalization, hashing, token similarity, and learning dedupe (module-internal). */
import { createHash } from "node:crypto";
import { config } from "../config.ts";
import { DEFAULT_MEMORY_CATEGORIES, type MemoryLearningRecord } from "./types.ts";

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function hashId(type: string, text: string, extra = ""): string {
  return createHash("sha1")
    .update(`${type}:${text.toLowerCase()}:${extra.toLowerCase()}`)
    .digest("hex")
    .slice(0, 10);
}

export function sanitizeCategory(category?: string): string {
  const raw = normalizeText(category || "");
  if (!raw) return "General";
  const found = DEFAULT_MEMORY_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return found || raw;
}

export function isPlaceholderItem(text: string): boolean {
  const t = normalizeText(text).toLowerCase();
  return t === "(none)" || t === "(none yet)" || t === "none" || t === "-";
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s/_-]/g, "")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  const union = a.size + b.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

/**
 * Per-item metadata that markdown bullets cannot express on their own.
 *
 * It rides along in a trailing HTML comment — invisible when the file is
 * rendered, unambiguous to parse, and obvious to a human editing the raw file
 * that the tail is machine-owned:
 *
 *   - [3x] prefer explicit contracts <!-- tags: design, api | src: auto | seen: 2026-08-11 -->
 */
export interface ItemMeta {
  tags?: string[];
  source?: string;
  date?: string;
}

const META_SUFFIX = /\s*<!--\s*([^]*?)\s*-->\s*$/;

/** `|` and `,` are the field separators, so they cannot survive inside a value. */
function metaSafe(value: string): string {
  return normalizeText(value).replace(/[|,<>]/g, "").trim();
}

export function stripItemMeta(line: string): { text: string; meta: ItemMeta } {
  const match = line.match(META_SUFFIX);
  if (!match) return { text: line, meta: {} };

  const meta: ItemMeta = {};
  for (const field of match[1].split("|")) {
    const separator = field.indexOf(":");
    if (separator < 0) continue;
    const key = field.slice(0, separator).trim().toLowerCase();
    const value = field.slice(separator + 1).trim();
    if (!value) continue;
    if (key === "tags") {
      const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
      if (tags.length) meta.tags = tags;
    } else if (key === "src") {
      meta.source = value;
    } else if (key === "seen") {
      meta.date = value;
    }
  }

  return { text: line.slice(0, match.index).trimEnd(), meta };
}

export function renderItemMeta(meta: ItemMeta): string {
  const fields: string[] = [];
  const tags = (meta.tags || []).map(metaSafe).filter(Boolean);
  if (tags.length) fields.push(`tags: ${tags.join(", ")}`);
  const source = metaSafe(meta.source || "");
  if (source) fields.push(`src: ${source}`);
  const date = metaSafe(meta.date || "");
  if (date) fields.push(`seen: ${date}`);
  return fields.length ? ` <!-- ${fields.join(" | ")} -->` : "";
}

/** Union of tags, preserving first-seen order. */
export function mergeTags(a?: string[], b?: string[]): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const seen = new Map<string, string>();
  for (const tag of [...(a || []), ...(b || [])]) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  return Array.from(seen.values());
}

/** Keeps the record that wins, but never drops the other's metadata. */
function absorb(keep: MemoryLearningRecord, other: MemoryLearningRecord): void {
  keep.used = Math.max(keep.used, other.used);
  keep.tags = mergeTags(keep.tags, other.tags);
  keep.source = keep.source || other.source;
  if (!keep.lastAccessed || (other.lastAccessed && other.lastAccessed > keep.lastAccessed)) {
    keep.lastAccessed = other.lastAccessed || keep.lastAccessed;
  }
}

export function dedupeLearnings(learnings: MemoryLearningRecord[]): MemoryLearningRecord[] {
  const byExact = new Map<string, MemoryLearningRecord>();
  for (const learning of learnings) {
    const key = normalizeText(learning.text).toLowerCase();
    const existing = byExact.get(key);
    if (!existing) {
      byExact.set(key, learning);
    } else {
      absorb(existing, learning);
    }
  }

  const candidates = Array.from(byExact.values()).sort((a, b) => {
    if (b.used !== a.used) return b.used - a.used;
    return b.text.length - a.text.length;
  });

  const kept: MemoryLearningRecord[] = [];
  for (const current of candidates) {
    const currentTokens = tokenize(current.text);
    const similar = kept.find((k) => jaccard(currentTokens, tokenize(k.text)) >= config.memory.dedupeThreshold);
    if (!similar) {
      kept.push(current);
    } else {
      absorb(similar, current);
    }
  }

  return kept;
}
