/** Data-driven conflict detection (duplicates, near-duplicates, outdated items). */
import { readRoleMemory } from "./consolidated.ts";
import { normalizeText } from "./text.ts";

export interface MemoryConflict {
  type: "contradiction" | "outdated" | "duplication";
  category?: string;
  items: Array<{ id: string; text: string; reason: string }>;
  suggestion: string;
}

/**
 * Detect conflicts dynamically based on actual memory content.
 * No hardcoded patterns - uses statistical analysis and similarity.
 */
export function detectMemoryConflicts(rolePath: string): MemoryConflict[] {
  const data = readRoleMemory(rolePath, "");
  const conflicts: MemoryConflict[] = [];

  // 1. Duplicate Detection (by normalized text)
  const allItems = [
    ...data.learnings.map(l => ({ id: l.id, text: l.text, kind: 'learning' as const, tags: l.tags })),
    ...data.preferences.map(p => ({ id: p.id, text: p.text, kind: 'preference' as const, category: p.category, tags: p.tags }))
  ];

  const textGroups = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = normalizeText(item.text).toLowerCase();
    if (!textGroups.has(key)) textGroups.set(key, []);
    textGroups.get(key)!.push(item);
  }

  for (const [, items] of textGroups) {
    if (items.length > 1) {
      conflicts.push({
        type: "duplication",
        items: items.map(i => ({
          id: i.id,
          text: i.text,
          reason: "存在完全相同的记忆条目"
        })),
        suggestion: `建议合并 ${items.length} 条重复记忆为一条`
      });
    }
  }

  // 2. Near-Duplicate Detection (high similarity)
  const threshold = 0.85;
  const processed = new Set<string>();
  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const a = allItems[i], b = allItems[j];
      if (processed.has(a.id) || processed.has(b.id)) continue;

      const sim = jaccardSimilarity(normalizeText(a.text), normalizeText(b.text));
      if (sim >= threshold) {
        processed.add(a.id);
        processed.add(b.id);
        conflicts.push({
          type: "duplication",
          category: a.kind === "preference" ? a.category : undefined,
          items: [
            { id: a.id, text: a.text, reason: `与另一条相似度 ${(sim * 100).toFixed(0)}%` },
            { id: b.id, text: b.text, reason: `与另一条相似度 ${(sim * 100).toFixed(0)}%` }
          ],
          suggestion: "这两条记忆高度相似，建议合并或删除其中一条"
        });
      }
    }
  }

  // 3. Category-level duplicate preferences
  const byCategory = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if ('category' in item) {
      const list = byCategory.get(item.category) || [];
      list.push(item);
      byCategory.set(item.category, list);
    }
  }

  for (const [category, items] of byCategory) {
    if (items.length < 2) continue;
    // Check for same-meaning preferences in same category
    const semGroups = new Map<string, typeof items>();
    for (const item of items) {
      // Group by first 50 chars (rough semantic grouping)
      const key = normalizeText(item.text).slice(0, 50).toLowerCase();
      if (!semGroups.has(key)) semGroups.set(key, []);
      semGroups.get(key)!.push(item);
    }

    for (const [, group] of semGroups) {
      if (group.length > 1) {
        conflicts.push({
          type: "duplication",
          category,
          items: group.map(i => ({
            id: i.id,
            text: i.text,
            reason: `在同一类别中表达相似含义`
          })),
          suggestion: `建议合并 ${category} 类别中 ${group.length} 条相似偏好`
        });
      }
    }
  }

  // 4. Outdated Detection (never used + old)
  const outdatedLearnings = data.learnings.filter(l =>
    l.used === 0 && l.source === "auto"
  );

  if (outdatedLearnings.length > 3) {
    conflicts.push({
      type: "outdated",
      items: outdatedLearnings.slice(0, 3).map(l => ({
        id: l.id,
        text: l.text,
        reason: "自动提取但从未被使用"
      })),
      suggestion: "建议运行 /memory-tidy 清理未使用的自动提取记忆"
    });
  }

  return conflicts;
}

// Intentionally different from text.ts tokenize()+jaccard(): splits on whitespace
// only (no lowercasing, no punctuation stripping, no min-token-length filter) and
// returns 0 for two empty inputs instead of 1. Merging with text.ts would change
// conflict-detection behavior; keep this historical variant as-is.
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Get a human-readable conflict report
 */
export function getConflictReport(rolePath: string): string {
  const conflicts = detectMemoryConflicts(rolePath);
  
  if (conflicts.length === 0) {
    return "✅ 未检测到记忆冲突";
  }

  const lines = [`⚠️ 检测到 ${conflicts.length} 个潜在冲突:\n`];
  
  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    lines.push(`\n## ${i + 1}. ${c.type === "contradiction" ? "🔴 矛盾" : c.type === "outdated" ? "🟡 过时" : "🟠 重复"}${c.category ? ` [${c.category}]` : ""}`);
    
    for (const item of c.items) {
      lines.push(`   - ${item.text}`);
      lines.push(`     └─ ${item.reason}`);
    }
    
    lines.push(`   💡 建议: ${c.suggestion}`);
  }

  return lines.join("\n");
}
