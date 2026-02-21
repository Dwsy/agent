/**
 * Memory Access — gateway-side read-only access to role-persona memory files.
 *
 * This does NOT duplicate role-persona's logic. It reads the same files
 * from disk that role-persona writes, providing API/WS access for
 * external tools and Web UI.
 *
 * Files read (v2):
 *   ~/.pi/agent/roles/{role}/memory/consolidated.md
 *   ~/.pi/agent/roles/{role}/memory/daily/YYYY-MM-DD.md
 *   ~/.pi/agent/roles/{role}/core/identity.md
 *   ~/.pi/agent/roles/{role}/core/soul.md
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function resolveRolesDir(): string {
  const envPath = process.env.PI_AGENT_ROLES_DIR?.trim();
  return envPath || join(homedir(), ".pi", "agent", "roles");
}

const ROLES_DIR = resolveRolesDir();

// ============================================================================
// Types
// ============================================================================

export interface MemorySearchResult {
  kind: "learning" | "preference" | "event" | "daily";
  text: string;
  score: number;
  category?: string;
  date?: string;
}

export interface MemoryStats {
  role: string;
  learningsCount: number;
  preferencesCount: number;
  eventsCount: number;
  dailyFilesCount: number;
  memoryFileSize: number;
  categories: string[];
}

export interface RoleInfo {
  role: string;
  identity: { name?: string; creature?: string; vibe?: string; emoji?: string } | null;
  soulPreview: string | null;
  hasMemory: boolean;
  hasDailyMemory: boolean;
}

// ============================================================================
// Read Functions
// ============================================================================

function rolePath(role: string): string {
  return join(ROLES_DIR, role);
}

function memoryFileForRole(rp: string): string | null {
  const path = join(rp, "memory", "consolidated.md");
  return existsSync(path) ? path : null;
}

function identityFileForRole(rp: string): string | null {
  const path = join(rp, "core", "identity.md");
  return existsSync(path) ? path : null;
}

function soulFileForRole(rp: string): string | null {
  const path = join(rp, "core", "soul.md");
  return existsSync(path) ? path : null;
}

function listDailyMemoryByDate(rp: string): Map<string, string> {
  const byDate = new Map<string, string>();
  const dir = join(rp, "memory", "daily");
  if (!existsSync(dir)) return byDate;

  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return byDate;
  }

  for (const name of names) {
    const match = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    byDate.set(match[1], join(dir, name));
  }

  return byDate;
}

export function listRoles(): string[] {
  if (!existsSync(ROLES_DIR)) return [];
  try {
    return readdirSync(ROLES_DIR).filter((name) => {
      const p = join(ROLES_DIR, name);
      try { return require("node:fs").statSync(p).isDirectory(); } catch { return false; }
    });
  } catch { return []; }
}

export function getRoleInfo(role: string): RoleInfo | null {
  const rp = rolePath(role);
  if (!existsSync(rp)) return null;

  let identity: RoleInfo["identity"] = null;
  const idFile = identityFileForRole(rp);
  if (idFile) {
    const content = readFileSync(idFile, "utf-8");
    identity = {
      name: content.match(/\*\*(?:Name|名字).*?\*\*\s*[:：]?\s*(.+)/m)?.[1]?.trim(),
      creature: content.match(/\*\*(?:Creature|生物).*?\*\*\s*[:：]?\s*(.+)/m)?.[1]?.trim(),
      vibe: content.match(/\*\*(?:Vibe|风格).*?\*\*\s*[:：]?\s*(.+)/m)?.[1]?.trim(),
      emoji: content.match(/\*\*(?:Emoji|表情).*?\*\*\s*[:：]?\s*(.+)/m)?.[1]?.trim(),
    };
  }

  let soulPreview: string | null = null;
  const soulFile = soulFileForRole(rp);
  if (soulFile) {
    soulPreview = readFileSync(soulFile, "utf-8").slice(0, 500);
  }

  return {
    role,
    identity,
    soulPreview,
    hasMemory: Boolean(memoryFileForRole(rp)),
    hasDailyMemory: listDailyMemoryByDate(rp).size > 0,
  };
}

export function getMemoryStats(role: string): MemoryStats | null {
  const rp = rolePath(role);
  if (!existsSync(rp)) return null;

  const memFile = memoryFileForRole(rp);
  let content = "";
  let fileSize = 0;
  if (memFile) {
    content = readFileSync(memFile, "utf-8");
    fileSize = Buffer.byteLength(content);
  }

  // Count items by parsing headings
  const learnings = (content.match(/^- \[?\d*x?\]?\s*.+$/gm) || []).length;
  const categories = new Set<string>();
  const prefMatches = content.match(/^# Preferences:\s*(.+)$/gm) || [];
  for (const m of prefMatches) {
    const cat = m.replace(/^# Preferences:\s*/, "").trim();
    if (cat) categories.add(cat);
  }

  // Count preferences (lines under Preferences headings)
  let prefs = 0;
  const prefSections = content.split(/^# Preferences:/m).slice(1);
  for (const section of prefSections) {
    const nextHeading = section.indexOf("\n# ");
    const sectionContent = nextHeading >= 0 ? section.slice(0, nextHeading) : section;
    prefs += (sectionContent.match(/^- .+$/gm) || []).length;
  }

  // Count events
  const events = (content.match(/^## \[\d{4}-\d{2}-\d{2}\]/gm) || []).length;

  // Count daily files
  const dailyFiles = listDailyMemoryByDate(rp).size;

  return {
    role,
    learningsCount: learnings,
    preferencesCount: prefs,
    eventsCount: events,
    dailyFilesCount: dailyFiles,
    memoryFileSize: fileSize,
    categories: Array.from(categories),
  };
}

// ============================================================================
// Search (lightweight, no embedding — uses token overlap scoring)
// ============================================================================

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s/_-]/g, "")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function scoreMatch(query: string, queryTokens: Set<string>, candidate: string): number {
  const candidateLower = candidate.toLowerCase();
  let score = 0;
  if (candidateLower.includes(query)) score += 0.5;
  const candidateTokens = tokenize(candidateLower);
  // Jaccard
  let overlap = 0;
  for (const t of queryTokens) if (candidateTokens.has(t)) overlap++;
  const union = queryTokens.size + candidateTokens.size - overlap;
  if (union > 0) score += (overlap / union) * 0.3;
  // Token hits
  if (queryTokens.size > 0) {
    let hits = 0;
    for (const t of queryTokens) if (candidateLower.includes(t)) hits++;
    score += (hits / queryTokens.size) * 0.2;
  }
  return Math.min(1, score);
}

export function searchMemory(
  role: string,
  query: string,
  options?: { maxResults?: number; minScore?: number },
): MemorySearchResult[] {
  const rp = rolePath(role);
  if (!existsSync(rp)) return [];

  const q = query.toLowerCase().trim();
  if (!q) return [];
  const qTokens = tokenize(q);
  const maxResults = options?.maxResults ?? 20;
  const minScore = options?.minScore ?? 0.1;
  const results: MemorySearchResult[] = [];

  // Search consolidated memory
  const memFile = memoryFileForRole(rp);
  if (memFile) {
    const content = readFileSync(memFile, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.replace(/^[-*]\s*/, "").replace(/^\[\d+x\]\s*/, "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const s = scoreMatch(q, qTokens, trimmed);
      if (s >= minScore) {
        results.push({ kind: "learning", text: trimmed, score: s });
      }
    }
  }

  // Search daily memory (last 7 days)
  const dailyByDate = listDailyMemoryByDate(rp);
  if (dailyByDate.size > 0) {
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const file = dailyByDate.get(dateStr);
      if (!file) continue;
      try {
        const content = readFileSync(file, "utf-8");
        const sections = content.split(/^## /m).filter(Boolean);
        for (const section of sections) {
          const text = section.replace(/\n/g, " ").trim().slice(0, 300);
          if (!text) continue;
          const s = scoreMatch(q, qTokens, text);
          if (s >= minScore) {
            results.push({ kind: "daily", text, score: s * 0.9, date: dateStr });
          }
        }
      } catch {}
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}
