/** Deterministic consolidation (dedupe) and LLM tidy-plan application. */
import { log } from "../logger.ts";
import { readRoleMemory, saveRoleMemory } from "./consolidated.ts";
import { dedupeLearnings, hashId, isPlaceholderItem, normalizeText, sanitizeCategory, today } from "./text.ts";
import type { MemoryPreferenceRecord } from "./types.ts";

export function consolidateRoleMemory(rolePath: string, roleName: string): {
  beforeLearnings: number;
  afterLearnings: number;
  beforePreferences: number;
  afterPreferences: number;
  removed: number;
} {
  const data = readRoleMemory(rolePath, roleName);
  const beforeLearnings = data.learnings.length;
  const beforePreferences = data.preferences.length;

  data.learnings = dedupeLearnings(data.learnings);

  const prefMap = new Map<string, MemoryPreferenceRecord>();
  for (const pref of data.preferences) {
    const key = `${sanitizeCategory(pref.category).toLowerCase()}::${normalizeText(pref.text).toLowerCase()}`;
    if (!prefMap.has(key)) prefMap.set(key, { ...pref, category: sanitizeCategory(pref.category) });
  }
  data.preferences = Array.from(prefMap.values());
  data.lastConsolidated = today();

  saveRoleMemory(rolePath, data);

  const afterLearnings = data.learnings.length;
  const afterPreferences = data.preferences.length;

  const removed = (beforeLearnings - afterLearnings) + (beforePreferences - afterPreferences);
  if (removed > 0) {
    log("consolidate", `${roleName}: L ${beforeLearnings}->${afterLearnings} P ${beforePreferences}->${afterPreferences} removed=${removed}`);
  }

  return {
    beforeLearnings,
    afterLearnings,
    beforePreferences,
    afterPreferences,
    removed,
  };
}

export interface LlmTidyPlan {
  removeLearningIds?: string[];
  removePreferenceIds?: string[];
  rewriteLearnings?: Array<{ id: string; text: string }>;
  rewritePreferences?: Array<{ id: string; text: string; category?: string }>;
  addLearnings?: string[];
  addPreferences?: Array<{ category?: string; text: string }>;
}

export function applyLlmTidyPlan(
  rolePath: string,
  roleName: string,
  plan: LlmTidyPlan
): {
  beforeLearnings: number;
  afterLearnings: number;
  beforePreferences: number;
  afterPreferences: number;
  removedLearnings: number;
  removedPreferences: number;
  rewrittenLearnings: number;
  rewrittenPreferences: number;
  addedLearnings: number;
  addedPreferences: number;
} {
  const data = readRoleMemory(rolePath, roleName);
  const beforeLearnings = data.learnings.length;
  const beforePreferences = data.preferences.length;

  const removeLearningSet = new Set((plan.removeLearningIds || []).map((id) => id.trim()).filter(Boolean));
  const removePreferenceSet = new Set((plan.removePreferenceIds || []).map((id) => id.trim()).filter(Boolean));

  data.learnings = data.learnings.filter((l) => !removeLearningSet.has(l.id));
  data.preferences = data.preferences.filter((p) => !removePreferenceSet.has(p.id));
  const removedLearningCount = beforeLearnings - data.learnings.length;
  const removedPreferenceCount = beforePreferences - data.preferences.length;

  let rewrittenLearnings = 0;
  let rewrittenPreferences = 0;

  const learningRewriteMap = new Map((plan.rewriteLearnings || []).map((r) => [r.id, normalizeText(r.text || "")]));
  for (const learning of data.learnings) {
    const next = learningRewriteMap.get(learning.id);
    if (!next) continue;
    if (!next || isPlaceholderItem(next)) continue;
    if (next !== learning.text) {
      learning.text = next;
      rewrittenLearnings += 1;
    }
  }

  const prefRewriteMap = new Map((plan.rewritePreferences || []).map((r) => [r.id, {
    text: normalizeText(r.text || ""),
    category: sanitizeCategory(r.category || "General"),
  }]));
  for (const pref of data.preferences) {
    const next = prefRewriteMap.get(pref.id);
    if (!next) continue;
    if (next.text && !isPlaceholderItem(next.text) && next.text !== pref.text) {
      pref.text = next.text;
      rewrittenPreferences += 1;
    }
    if (next.category !== pref.category) {
      pref.category = next.category;
      rewrittenPreferences += 1;
    }
  }

  let addedLearnings = 0;
  for (const raw of plan.addLearnings || []) {
    const text = normalizeText(raw || "");
    if (!text || isPlaceholderItem(text)) continue;
    const exists = data.learnings.some((l) => normalizeText(l.text).toLowerCase() === text.toLowerCase());
    if (exists) continue;
    data.learnings.push({ id: hashId("learning", text), text, used: 0 });
    addedLearnings += 1;
  }

  let addedPreferences = 0;
  for (const raw of plan.addPreferences || []) {
    const text = normalizeText(raw?.text || "");
    if (!text || isPlaceholderItem(text)) continue;
    const category = sanitizeCategory(raw?.category || "General");
    const exists = data.preferences.some(
      (p) => p.category.toLowerCase() === category.toLowerCase() && normalizeText(p.text).toLowerCase() === text.toLowerCase()
    );
    if (exists) continue;
    data.preferences.push({ id: hashId("preference", text, category), text, category });
    addedPreferences += 1;
  }

  // Final deterministic cleanup
  data.learnings = dedupeLearnings(data.learnings);
  const prefMap = new Map<string, MemoryPreferenceRecord>();
  for (const pref of data.preferences) {
    const key = `${sanitizeCategory(pref.category).toLowerCase()}::${normalizeText(pref.text).toLowerCase()}`;
    if (!prefMap.has(key)) prefMap.set(key, { ...pref, category: sanitizeCategory(pref.category) });
  }
  data.preferences = Array.from(prefMap.values());
  data.lastConsolidated = today();

  saveRoleMemory(rolePath, data);

  log("llm-tidy-apply", `${roleName}: L ${beforeLearnings}->${data.learnings.length} P ${beforePreferences}->${data.preferences.length} +${addedLearnings}L +${addedPreferences}P -${removedLearningCount}L -${removedPreferenceCount}P rewrite=${rewrittenLearnings}L ${rewrittenPreferences}P`);

  return {
    beforeLearnings,
    afterLearnings: data.learnings.length,
    beforePreferences,
    afterPreferences: data.preferences.length,
    removedLearnings: removedLearningCount,
    removedPreferences: removedPreferenceCount,
    rewrittenLearnings,
    rewrittenPreferences,
    addedLearnings,
    addedPreferences,
  };
}
