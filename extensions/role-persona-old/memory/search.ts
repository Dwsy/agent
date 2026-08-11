/** Scored memory search across consolidated, tag index, pending, and daily layers. */
import { readFileSync } from "node:fs";
import { config } from "../config.ts";
import { log } from "../logger.ts";
import { getRelatedTags, searchTags } from "../memory-tags.ts";
import { readRoleMemory } from "./consolidated.ts";
import { reinforceRoleLearning } from "./mutations.ts";
import { readPendingMemory } from "./pending-store.ts";
import { promotePendingLearning } from "./pending.ts";
import { listDailyMemoryFilesByDate } from "./paths.ts";
import { jaccard, normalizeText, tokenize } from "./text.ts";
import { eventSearchText, type MemorySearchMatch, type ScoredMemoryMatch } from "./types.ts";

/**
 * Score a candidate text against a query using multiple signals.
 * Returns 0-1 score (0 = no match, 1 = perfect match).
 */
function scoreMatch(queryLower: string, queryTokens: Set<string>, candidateLower: string): number {
  let score = 0;

  // 1. Exact substring match (highest signal)
  if (candidateLower.includes(queryLower)) {
    score += 0.5;
  }

  // 2. Token overlap (Jaccard similarity)
  const candidateTokens = tokenize(candidateLower);
  const jaccardScore = jaccard(queryTokens, candidateTokens);
  score += jaccardScore * 0.3;

  // 3. Individual token hits (partial match)
  if (queryTokens.size > 0) {
    let hits = 0;
    for (const qt of queryTokens) {
      if (candidateLower.includes(qt)) hits++;
    }
    score += (hits / queryTokens.size) * 0.2;
  }

  return Math.min(1, score);
}

/** Compact search line — no square brackets (saves prompt tokens). */
export function formatSearchMatchLine(m: MemorySearchMatch & { score?: number }, maxText = 160): string {
  const text = normalizeText(m.text).slice(0, maxText);
  if (m.kind === "learning") return `learning ${(m.used ?? "?")}x ${text}`;
  if (m.kind === "preference") return `preference ${m.category || "General"} ${text}`;
  if (m.kind === "pending") return `pending ${text}`;
  return m.date ? `event ${m.date} ${text}` : `event ${text}`;
}

// Event/pending need stronger hits (long/noisy text otherwise floods results)
const EVENT_MIN_SCORE = 0.35;
const PENDING_MIN_SCORE = 0.28;
const MAX_EVENTS_IN_RESULTS = 2;
const MAX_PENDING_IN_RESULTS = 2;

/**
 * Search role memory with scored ranking.
 * Uses substring match + token overlap + individual token hits.
 * Results sorted by score descending; event/pending are stricter + capped.
 */
export function searchRoleMemory(
  rolePath: string,
  roleName: string,
  query: string,
  options?: { maxResults?: number; minScore?: number; includeDailyMemory?: boolean; autoPromotePending?: boolean; autoReinforce?: boolean },
): ScoredMemoryMatch[] {
  const q = normalizeText(query).toLowerCase();
  if (!q) return [];

  const queryTokens = tokenize(q);
  const maxResults = options?.maxResults ?? config.memory.searchDefaults.maxResults;
  const minScore = options?.minScore ?? config.memory.searchDefaults.minScore;
  const scored: ScoredMemoryMatch[] = [];

  const data = readRoleMemory(rolePath, roleName);

  // Search consolidated memory learnings
  for (const learning of data.learnings) {
    const s = scoreMatch(q, queryTokens, learning.text.toLowerCase());
    if (s >= minScore) {
      scored.push({ kind: "learning", id: learning.id, text: learning.text, used: learning.used, score: s });
    }
  }

  // Search consolidated memory preferences
  for (const pref of data.preferences) {
    const combined = `${pref.category} ${pref.text}`.toLowerCase();
    const s = scoreMatch(q, queryTokens, combined);
    if (s >= minScore) {
      scored.push({ kind: "preference", id: pref.id, text: pref.text, category: pref.category, score: s });
    }
  }

  // Search consolidated memory events (block-level; stricter floor)
  const eventMin = Math.max(minScore, EVENT_MIN_SCORE);
  for (const event of data.events) {
    const full = eventSearchText(event);
    const s = scoreMatch(q, queryTokens, full.toLowerCase());
    if (s >= eventMin) {
      scored.push({
        kind: "event",
        id: event.id,
        text: full.slice(0, 200),
        date: event.date || undefined,
        score: s,
      });
    }
  }

  // ============================================================
  // TAG-BASED RECALL (P0: Issue #49)
  // ============================================================
  // Search tags index for query-relevant tags
  const matchingTags = searchTags(rolePath, q);
  
  // Get related tags (association expansion). Stored lowercase because the
  // lookup below compares with t.toLowerCase().
  const relatedTagsSet = new Set<string>();
  for (const mt of matchingTags.slice(0, 5)) {
    relatedTagsSet.add(mt.tag.toLowerCase());
    const related = getRelatedTags(rolePath, mt.tag, 3);
    for (const r of related) {
      relatedTagsSet.add(r.tag.toLowerCase());
    }
  }

  // Boost memories that have matching tags
  for (const learning of data.learnings) {
    const learningTags = learning.tags || [];
    const hasMatchingTag = learningTags.some(t => 
      matchingTags.some(mt => mt.tag.toLowerCase() === t.toLowerCase())
    );
    const hasRelatedTag = learningTags.some(t => 
      relatedTagsSet.has(t.toLowerCase())
    );
    
    if (hasMatchingTag) {
      // Strong boost for exact tag match
      const tagBoost = 0.3;
      // Find the matching tag score
      const matchScore = matchingTags.find(mt => 
        learningTags.some(t => t.toLowerCase() === mt.tag.toLowerCase())
      )?.strength ?? 0;
      const boost = tagBoost + (matchScore / 100) * 0.1;
      
      // Check if already in results
      const existing = scored.find(s => s.id === learning.id);
      if (existing) {
        existing.score += boost;
      } else {
        scored.push({ kind: "learning", id: learning.id, text: learning.text, used: learning.used, score: boost });
      }
    } else if (hasRelatedTag) {
      // Smaller boost for related tag match
      const relatedBoost = 0.15;
      const existing = scored.find(s => s.id === learning.id);
      if (existing) {
        existing.score += relatedBoost;
      } else {
        scored.push({ kind: "learning", id: learning.id, text: learning.text, used: learning.used, score: relatedBoost });
      }
    }
  }

  // Boost preferences with matching tags
  for (const pref of data.preferences) {
    const prefTags = pref.tags || [];
    const hasMatchingTag = prefTags.some(t => 
      matchingTags.some(mt => mt.tag.toLowerCase() === t.toLowerCase())
    );
    
    if (hasMatchingTag) {
      const tagBoost = 0.25;
      const existing = scored.find(s => s.id === pref.id);
      if (existing) {
        existing.score += tagBoost;
      } else {
        scored.push({ kind: "preference", id: pref.id, text: pref.text, category: pref.category, score: tagBoost });
      }
    }
  }

  // Auto-reinforce: increment used count for highly relevant memories
  if (options?.autoReinforce !== false && roleName) {
    for (const match of scored) {
      if (match.kind === "learning" && match.id && match.score >= 0.5) {
        // Reinforce memories found via text or tag search
        reinforceRoleLearning(rolePath, roleName, match.id);
        log("search-reinforce", `auto-reinforced: ${match.text.slice(0, 50)} (score=${match.score.toFixed(2)})`);
      }
    }
  }

  // Pending: surface above PENDING_MIN_SCORE; auto-promote only when score ≥ 0.5
  {
    const pendingMin = Math.max(minScore, PENDING_MIN_SCORE);
    const pendingData = readPendingMemory(rolePath);
    for (const item of pendingData.items) {
      if (item.promoted || item.discarded) continue;
      if (!item.text) continue;
      const s = scoreMatch(q, queryTokens, item.text.toLowerCase());
      if (s < pendingMin) continue;

      let kind: "pending" | "learning" = "pending";
      let score = s;
      if (options?.autoPromotePending !== false && roleName && s >= 0.5 && item.id) {
        const result = promotePendingLearning(rolePath, roleName, item.id);
        if (result.promoted) {
          log("search-promote", `auto-promoted from search: ${item.text.slice(0, 50)}`);
          kind = "learning";
          score = s * 1.1;
        }
      }
      scored.push({
        kind,
        id: item.id,
        text: item.text.slice(0, 200),
        used: kind === "learning" ? 0 : undefined,
        source: item.source,
        score,
      });
    }
  }

  // Search recent daily memory files (last 7 days); preserve ENTRY kind (EVENT/LESSON/PREFERENCE)
  if (options?.includeDailyMemory !== false) {
    const byDate = new Map(listDailyMemoryFilesByDate(rolePath).map((entry) => [entry.date, entry.path]));
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dailyFile = byDate.get(dateStr);
      if (!dailyFile) continue;

      try {
        const content = readFileSync(dailyFile, "utf-8");
        const sections = content.split(/^## /m).filter(Boolean);
        for (const section of sections) {
          const firstLine = section.split("\n")[0]?.trim() ?? "";
          const headerMatch = firstLine.match(/^\[(\d{2}:\d{2})\]\s*(\w+)/);
          const category = (headerMatch?.[2] || "event").toLowerCase();
          const kind: MemorySearchMatch["kind"] =
            category === "preference" ? "preference" : category === "event" ? "event" : "learning";
          const body = normalizeText(section.replace(firstLine, "")).slice(0, 500);
          if (!body) continue;
          const s = scoreMatch(q, queryTokens, body.toLowerCase());
          // Daily events also need stronger hits
          const dailyMin = kind === "event" ? Math.max(minScore, EVENT_MIN_SCORE) : minScore;
          if (s >= dailyMin) {
            scored.push({
              kind,
              text: `${dateStr} ${body.slice(0, 160)}`,
              date: dateStr,
              category: kind === "preference" ? "daily" : undefined,
              score: s * 0.9, // Slight penalty for daily (less curated)
            });
          }
        }
      } catch {
        // Skip unreadable daily files
      }
    }
  }

  // Sort by score descending; cap noisy kinds so they don't flood the budget
  scored.sort((a, b) => b.score - a.score);
  let eventCount = 0;
  let pendingCount = 0;
  const limited: ScoredMemoryMatch[] = [];
  for (const m of scored) {
    if (limited.length >= maxResults) break;
    if (m.kind === "event") {
      if (eventCount >= MAX_EVENTS_IN_RESULTS) continue;
      eventCount += 1;
    } else if (m.kind === "pending") {
      if (pendingCount >= MAX_PENDING_IN_RESULTS) continue;
      pendingCount += 1;
    }
    limited.push(m);
  }
  return limited;
}
