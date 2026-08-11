/** Record-level CRUD on consolidated memory (events, learnings, preferences). */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { config } from "../config.ts";
import { log } from "../logger.ts";
import { extractTagsWithLLM } from "../memory-tags.ts";
import { readRoleMemory, saveRoleMemory } from "./consolidated.ts";
import { appendDailyRoleMemory } from "./daily.ts";
import { addPendingLearning } from "./pending.ts";
import { hashId, jaccard, normalizeText, sanitizeCategory, today, tokenize } from "./text.ts";
import { eventSearchText } from "./types.ts";

/**
 * Append a durable event to consolidated # Events (+ optional daily log).
 * content: free text; optional title; date defaults to today.
 */
export function addRoleEvent(
  rolePath: string,
  roleName: string,
  content: string,
  options?: { title?: string; date?: string; appendDaily?: boolean }
): { stored: boolean; duplicate?: boolean; id?: string; reason?: string } {
  const body = normalizeText(content);
  if (!body || body === "(none)") return { stored: false, reason: "empty" };

  const date = options?.date || today();
  const title = normalizeText(options?.title || "") || body.slice(0, 80);
  const full = title === body ? title : `${title}\n${body}`;
  const id = hashId("event", full, date);

  const data = readRoleMemory(rolePath, roleName);
  const exact = data.events.find((e) => e.id === id || eventSearchText(e).toLowerCase() === full.toLowerCase());
  if (exact) return { stored: false, duplicate: true, id: exact.id, reason: "duplicate" };

  // Soft dedupe: high token overlap with existing event
  const tokens = tokenize(full.toLowerCase());
  const similar = data.events.find((e) => jaccard(tokens, tokenize(eventSearchText(e).toLowerCase())) >= config.memory.dedupeThreshold);
  if (similar) return { stored: false, duplicate: true, id: similar.id, reason: "duplicate" };

  data.events.unshift({
    id,
    date,
    title,
    body: title === body ? "" : body,
  });
  saveRoleMemory(rolePath, data);

  if (options?.appendDaily !== false) {
    appendDailyRoleMemory(rolePath, "event", full);
  }

  log("event", `stored [${id}] ${full.slice(0, 120)}`);
  return { stored: true, id };
}

export function addRoleLearning(
  rolePath: string,
  roleName: string,
  text: string,
  options?: { source?: string; appendDaily?: boolean; tags?: string[]; weight?: number; usePending?: boolean }
): { stored: boolean; duplicate?: boolean; id?: string; reason?: string; layer?: string } {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "(none)") return { stored: false, reason: "empty" };

  // Check if this should go to pending layer
  // auto-extract and compaction both go to pending for verification
  const usePendingLayer = options?.usePending ?? (options?.source === "auto" || options?.source === "compaction");
  
  if (usePendingLayer) {
    const result = addPendingLearning(rolePath, normalized, options?.source || "auto");
    if (!result.stored) {
      return { stored: false, duplicate: result.duplicate, id: result.id, reason: "duplicate", layer: "pending" };
    }
    if (options?.appendDaily !== false) {
      appendDailyRoleMemory(rolePath, "lesson", normalized);
    }
    return { stored: true, id: result.id, reason: "pending", layer: "pending" };
  }

  const data = readRoleMemory(rolePath, roleName);
  const duplicate = data.learnings.find((l) => normalizeText(l.text).toLowerCase() === normalized.toLowerCase());
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id, reason: "duplicate", layer: "consolidated" };

  data.learnings.push({
    id: hashId("learning", normalized),
    text: normalized,
    used: 0,
    source: options?.source,
    tags: options?.tags,
    weight: options?.weight ?? 1.0,
    lastAccessed: today(),
  });
  data.lastConsolidated = data.lastConsolidated || today();
  saveRoleMemory(rolePath, data);

  if (options?.appendDaily !== false) {
    appendDailyRoleMemory(rolePath, "lesson", normalized);
  }

  return { stored: true, id: hashId("learning", normalized), layer: "consolidated" };
}

export async function addRoleLearningWithTags(
  ctx: ExtensionContext,
  rolePath: string,
  roleName: string,
  text: string,
  options?: { source?: string; appendDaily?: boolean; tagModel?: string }
): Promise<{ stored: boolean; duplicate?: boolean; id?: string; reason?: string; tags?: string[]; layer?: "pending" | "consolidated" }> {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "(none)") return { stored: false, reason: "empty" };

  // Auto-extracted and compaction items MUST go through pending layer for verification
  const usePendingLayer = options?.source === "auto" || options?.source === "compaction";
  if (usePendingLayer) {
    const result = addPendingLearning(rolePath, normalized, options?.source || "auto");
    if (!result.stored) {
      return { stored: false, duplicate: result.duplicate, id: result.id, reason: "duplicate", layer: "pending" as const };
    }
    let tags: string[] = [];
    try {
      const extraction = await extractTagsWithLLM(normalized, ctx, options?.tagModel);
      tags = extraction.tags.map((t) => t.tag);
    } catch { /* tag extraction is non-critical */ }
    if (options?.appendDaily !== false) {
      appendDailyRoleMemory(rolePath, "lesson", normalized);
    }
    return { stored: true, id: result.id, reason: "pending", tags, layer: "pending" as const };
  }

  const data = readRoleMemory(rolePath, roleName);
  const duplicate = data.learnings.find((l) => normalizeText(l.text).toLowerCase() === normalized.toLowerCase());
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id, reason: "duplicate" };

  const extraction = await extractTagsWithLLM(normalized, ctx, options?.tagModel);
  const tags = extraction.tags.map((t) => t.tag);

  data.learnings.push({
    id: hashId("learning", normalized),
    text: normalized,
    used: 0,
    source: options?.source,
    tags,
    weight: 1.0,
    lastAccessed: today(),
  });
  data.lastConsolidated = data.lastConsolidated || today();
  saveRoleMemory(rolePath, data);

  if (options?.appendDaily !== false) {
    appendDailyRoleMemory(rolePath, "lesson", normalized);
  }

  return { stored: true, id: hashId("learning", normalized), tags };
}

export function addRolePreference(
  rolePath: string,
  roleName: string,
  category: string,
  text: string,
  options?: { appendDaily?: boolean }
): { stored: boolean; duplicate?: boolean; id?: string; reason?: string; category: string } {
  const normalized = normalizeText(text);
  const safeCategory = sanitizeCategory(category);
  if (!normalized || normalized === "(none)") return { stored: false, reason: "empty", category: safeCategory };

  const data = readRoleMemory(rolePath, roleName);
  const duplicate = data.preferences.find(
    (p) => p.category.toLowerCase() === safeCategory.toLowerCase() && normalizeText(p.text).toLowerCase() === normalized.toLowerCase()
  );
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id, reason: "duplicate", category: safeCategory };

  data.preferences.push({
    id: hashId("preference", normalized, safeCategory),
    category: safeCategory,
    text: normalized,
  });
  saveRoleMemory(rolePath, data);

  if (options?.appendDaily !== false) {
    appendDailyRoleMemory(rolePath, "preference", `[${safeCategory}] ${normalized}`);
  }

  return { stored: true, id: hashId("preference", normalized, safeCategory), category: safeCategory };
}

export function reinforceRoleLearning(
  rolePath: string,
  roleName: string,
  idOrQuery: string
): { updated: boolean; id?: string; used?: number; text?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  if (!query) return { updated: false };

  const data = readRoleMemory(rolePath, roleName);
  const direct = data.learnings.find((l) => l.id === idOrQuery);
  const fuzzy = direct || data.learnings.find((l) => l.text.toLowerCase().includes(query));
  if (!fuzzy) return { updated: false };

  fuzzy.used += 1;
  saveRoleMemory(rolePath, data);
  return { updated: true, id: fuzzy.id, used: fuzzy.used, text: fuzzy.text };
}

export function updateRoleLearning(
  rolePath: string,
  roleName: string,
  idOrQuery: string,
  newText: string
): { updated: boolean; id?: string; oldId?: string; oldText?: string; newText?: string; reason?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  const normalizedNew = normalizeText(newText);
  if (!query) return { updated: false, reason: "empty query" };
  if (!normalizedNew) return { updated: false, reason: "empty new text" };

  const data = readRoleMemory(rolePath, roleName);
  const direct = data.learnings.find((l) => l.id === idOrQuery);
  const fuzzy = direct || data.learnings.find((l) => l.text.toLowerCase().includes(query));
  if (!fuzzy) return { updated: false, reason: "not found" };

  // Check for duplicate (excluding the item being updated)
  const duplicate = data.learnings.find(
    (l) => l.id !== fuzzy.id && normalizeText(l.text).toLowerCase() === normalizedNew.toLowerCase()
  );
  if (duplicate) return { updated: false, reason: "duplicate", id: duplicate.id };

  const oldText = fuzzy.text;
  const oldId = fuzzy.id;
  fuzzy.text = normalizedNew;
  fuzzy.id = hashId("learning", normalizedNew); // Regenerate ID based on new text
  fuzzy.lastAccessed = today();
  saveRoleMemory(rolePath, data);

  return { updated: true, id: fuzzy.id, oldId, oldText, newText: normalizedNew };
}

export function updateRolePreference(
  rolePath: string,
  roleName: string,
  idOrQuery: string,
  newText: string,
  newCategory?: string
): { updated: boolean; id?: string; oldId?: string; oldText?: string; newText?: string; category?: string; reason?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  const normalizedNew = normalizeText(newText);
  if (!query) return { updated: false, reason: "empty query" };
  if (!normalizedNew) return { updated: false, reason: "empty new text" };

  const data = readRoleMemory(rolePath, roleName);
  const direct = data.preferences.find((p) => p.id === idOrQuery);
  const fuzzy = direct || data.preferences.find((p) => p.text.toLowerCase().includes(query));
  if (!fuzzy) return { updated: false, reason: "not found" };

  const safeCategory = newCategory === undefined ? fuzzy.category : sanitizeCategory(newCategory);

  // Check for duplicate (excluding the item being updated)
  const duplicate = data.preferences.find(
    (p) =>
      p.id !== fuzzy.id &&
      p.category.toLowerCase() === safeCategory.toLowerCase() &&
      normalizeText(p.text).toLowerCase() === normalizedNew.toLowerCase()
  );
  if (duplicate) return { updated: false, reason: "duplicate", id: duplicate.id };

  const oldText = fuzzy.text;
  const oldId = fuzzy.id;
  fuzzy.text = normalizedNew;
  fuzzy.category = safeCategory;
  fuzzy.id = hashId("preference", normalizedNew, safeCategory); // Regenerate ID
  saveRoleMemory(rolePath, data);

  return { updated: true, id: fuzzy.id, oldId, oldText, newText: normalizedNew, category: safeCategory };
}

export function deleteRoleLearning(
  rolePath: string,
  roleName: string,
  idOrQuery: string
): { deleted: boolean; id?: string; text?: string; reason?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  if (!query) return { deleted: false, reason: "empty query" };

  const data = readRoleMemory(rolePath, roleName);
  const index = data.learnings.findIndex((l) => l.id === idOrQuery);
  const fuzzyIndex = index >= 0 ? index : data.learnings.findIndex((l) => l.text.toLowerCase().includes(query));

  if (fuzzyIndex < 0) return { deleted: false, reason: "not found" };

  const removed = data.learnings.splice(fuzzyIndex, 1)[0];
  saveRoleMemory(rolePath, data);

  return { deleted: true, id: removed.id, text: removed.text };
}

export function deleteRolePreference(
  rolePath: string,
  roleName: string,
  idOrQuery: string
): { deleted: boolean; id?: string; text?: string; category?: string; reason?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  if (!query) return { deleted: false, reason: "empty query" };

  const data = readRoleMemory(rolePath, roleName);
  const index = data.preferences.findIndex((p) => p.id === idOrQuery);
  const fuzzyIndex = index >= 0 ? index : data.preferences.findIndex((p) => p.text.toLowerCase().includes(query));

  if (fuzzyIndex < 0) return { deleted: false, reason: "not found" };

  const removed = data.preferences.splice(fuzzyIndex, 1)[0];
  saveRoleMemory(rolePath, data);

  return { deleted: true, id: removed.id, text: removed.text, category: removed.category };
}
