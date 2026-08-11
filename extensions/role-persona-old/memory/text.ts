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

export function dedupeLearnings(learnings: MemoryLearningRecord[]): MemoryLearningRecord[] {
  const byExact = new Map<string, MemoryLearningRecord>();
  for (const learning of learnings) {
    const key = normalizeText(learning.text).toLowerCase();
    const existing = byExact.get(key);
    if (!existing) {
      byExact.set(key, learning);
    } else {
      existing.used = Math.max(existing.used, learning.used);
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
      similar.used = Math.max(similar.used, current.used);
    }
  }

  return kept;
}
