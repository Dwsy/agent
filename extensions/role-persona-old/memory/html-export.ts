/** HTML visualization export of a role's full memory. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readRoleMemory } from "./consolidated.ts";
import { readDailyMemories } from "./daily.ts";
import { getPendingMemories } from "./pending.ts";
import { eventSearchText } from "./types.ts";

export interface MemoryExportData {
  title: string;
  roleName: string;
  updatedAt: string;
  generatedAt: string;
  learnings: Array<{
    id: string;
    text: string;
    used: number;
    source?: string;
    tags?: string[];
    date?: string;
  }>;
  preferences: Array<{
    id: string;
    text: string;
    category: string;
    tags?: string[];
    date?: string;
  }>;
  events: Array<{
    id?: string;
    text: string;
    date?: string;
    title?: string;
  }>;
  daily: Array<{
    text: string;
    date: string;
    time?: string;
  }>;
  pending: Array<{
    id: string;
    text: string;
    source: string;
    category?: string;
    createdAt: string;
    promoted: boolean;
  }>;
  tags: Array<{
    name: string;
    count: number;
  }>;
  stats: {
    total: number;
    highPriority: number;
    pending: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Export all memory to HTML visualization
 */
export function exportMemoryToHtml(rolePath: string, roleName: string): string {
  const data = readRoleMemory(rolePath, roleName);
  // Template lives at the extension root; this module sits one level down in memory/.
  const templatePath = join(dirname(__filename), "..", "templates", "memory-export.html");

  // Read daily memory files
  const dailyMemories = readDailyMemories(rolePath);

  // Read pending memories
  const pendingData = getPendingMemories(rolePath);
  const pendingMemories = pendingData
    .filter(p => !p.discarded)
    .map(p => ({
      id: p.id,
      text: p.text,
      source: p.source,
      category: p.category,
      createdAt: p.createdAt,
      promoted: p.promoted
    }));

  // Collect all tags
  const tagCounts = new Map<string, number>();
  for (const l of data.learnings) {
    for (const t of l.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  for (const p of data.preferences) {
    for (const t of p.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const tags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Count by category
  const byCategory: Record<string, number> = {};
  for (const p of data.preferences) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }

  const exportData: MemoryExportData = {
    title: `Memory - ${roleName}`,
    roleName,
    updatedAt: data.metadata?.updated || new Date().toISOString().split('T')[0],
    generatedAt: new Date().toLocaleString("zh-CN"),
    learnings: data.learnings.map(l => ({
      id: l.id,
      text: l.text,
      used: l.used,
      source: l.source,
      tags: l.tags,
      date: l.lastAccessed
    })),
    preferences: data.preferences.map(p => ({
      id: p.id,
      text: p.text,
      category: p.category,
      tags: p.tags
    })),
    events: data.events.map(e => ({
      id: e.id,
      text: eventSearchText(e),
      date: e.date || undefined,
      title: e.title,
    })),
    daily: dailyMemories,
    pending: pendingMemories,
    tags,
    stats: {
      total: data.learnings.length + data.preferences.length + data.events.length + dailyMemories.length,
      highPriority: data.learnings.filter(l => l.used >= 3).length,
      pending: pendingMemories.filter(p => !p.promoted).length,
      byCategory
    }
  };

  // Read template
  let template: string;
  try {
    template = readFileSync(templatePath, "utf-8");
  } catch {
    return generateFallbackHtml(exportData);
  }

  // Replace placeholders
  return template
    .replace(/\{\{title\}\}/g, exportData.title)
    .replace(/\{\{roleName\}\}/g, roleName)
    .replace(/\{\{updatedAt\}\}/g, exportData.updatedAt)
    .replace(/\{\{generatedAt\}\}/g, exportData.generatedAt)
    .replace("{{data}}", JSON.stringify(exportData));
}

function generateFallbackHtml(data: MemoryExportData): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${data.title}</title>
<style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:1rem;background:#fff;color:#1e293b}
h1{color:#6366f1}h2{margin-top:2rem;border-bottom:1px solid #e2e8f0;padding-bottom:0.5rem}
.card{border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:1rem 0}
.tag{background:#f1f5f9;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.8rem;margin-right:0.3rem}
.stats{display:flex;gap:2rem;margin:1rem 0}.stat{text-align:center}.stat-value{font-size:2rem;font-weight:bold;color:#6366f1}
</style></head>
<body>
<h1>🧠 ${data.title}</h1>
<p>${data.generatedAt}</p>
<div class="stats">
  <div class="stat"><div class="stat-value">${data.learnings.length}</div><div>Learnings</div></div>
  <div class="stat"><div class="stat-value">${data.preferences.length}</div><div>Preferences</div></div>
  <div class="stat"><div class="stat-value">${data.daily.length}</div><div>Daily</div></div>
</div>
<h2>💡 Learnings</h2>
${data.learnings.map(l=>`<div class="card"><p>${l.text}</p>${l.tags?.map(t=>`<span class="tag">#${t}</span>`).join('')||''}<small> Used: ${l.used}</small></div>`).join('')}
<h2>⚙️ Preferences</h2>
${data.preferences.map(p=>`<div class="card"><strong>[${p.category}]</strong><p>${p.text}</p></div>`).join('')}
<h2>📝 Daily</h2>
${data.daily.slice(0,20).map(d=>`<div class="card"><small>${d.date} ${d.time||''}</small><p>${d.text}</p></div>`).join('')}
</body></html>`;
}
