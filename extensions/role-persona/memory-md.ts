import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { log } from "./logger.ts";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { extractTagsWithLLM, updateTagWeights, type TagRegistry } from "./memory-tags.ts";
import { config } from "./config.ts";

export const DEFAULT_MEMORY_CATEGORIES = config.memory.defaultCategories as unknown as readonly string[];
export type MemoryCategory = (typeof DEFAULT_MEMORY_CATEGORIES)[number] | string;

export interface MemoryLearningRecord {
  id: string;
  text: string;
  used: number;
  source?: string;
  tags?: string[];
  weight?: number;
  lastAccessed?: string;
}

export interface MemoryPreferenceRecord {
  id: string;
  category: string;
  text: string;
  tags?: string[];
}

export interface RoleMemoryMetadata {
  name: string;
  version: string;
  created: string;
  updated: string;
  autoConsolidate: boolean;
  consolidationInterval: string;
  tags: string[];
}

export interface RoleMemoryData {
  roleName: string;
  metadata: RoleMemoryMetadata;
  autoExtracted: boolean;
  lastConsolidated?: string;
  learnings: MemoryLearningRecord[];
  preferences: MemoryPreferenceRecord[];
  events: string[];
  issues: string[];
}

export interface MemorySearchMatch {
  kind: "learning" | "preference" | "event";
  id?: string;
  text: string;
  category?: string;
  used?: number;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashId(type: string, text: string, extra = ""): string {
  return createHash("sha1")
    .update(`${type}:${text.toLowerCase()}:${extra.toLowerCase()}`)
    .digest("hex")
    .slice(0, 10);
}

function memoryRootDir(rolePath: string): string {
  return join(rolePath, "memory");
}

function memoryFilePath(rolePath: string): string {
  return join(memoryRootDir(rolePath), "consolidated.md");
}

function dailyMemoryDir(rolePath: string): string {
  return join(memoryRootDir(rolePath), "daily");
}

function dailyMemoryPath(rolePath: string, date = today()): string {
  return join(dailyMemoryDir(rolePath), `${date}.md`);
}

function listDailyMemoryFilesByDate(rolePath: string): Array<{ date: string; path: string }> {
  const dir = dailyMemoryDir(rolePath);
  if (!existsSync(dir)) return [];

  const files: Array<{ date: string; path: string }> = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  for (const filename of names) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;
    files.push({ date: match[1], path: join(dir, filename) });
  }

  files.sort((a, b) => b.date.localeCompare(a.date));
  return files;
}

function migrateLegacyMemoryLayout(rolePath: string): void {
  const canonical = memoryFilePath(rolePath);
  const legacyMemory = join(rolePath, "MEMORY.md");

  if (existsSync(legacyMemory)) {
    const shouldCopy = !existsSync(canonical) || statSync(legacyMemory).mtimeMs > statSync(canonical).mtimeMs;
    if (shouldCopy) {
      copyFileSync(legacyMemory, canonical);
      log("migrate-memory", `upgraded ${legacyMemory} -> ${canonical}`);
    }
  }

  const legacyDailyRoot = memoryRootDir(rolePath);
  const canonicalDaily = dailyMemoryDir(rolePath);

  if (!existsSync(legacyDailyRoot)) return;

  let names: string[] = [];
  try {
    names = readdirSync(legacyDailyRoot);
  } catch {
    return;
  }

  for (const filename of names) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;

    const src = join(legacyDailyRoot, filename);
    const dst = join(canonicalDaily, filename);

    const shouldCopy = !existsSync(dst) || statSync(src).mtimeMs > statSync(dst).mtimeMs;
    if (!shouldCopy) continue;

    copyFileSync(src, dst);
    log("migrate-memory", `upgraded ${src} -> ${dst}`);
  }
}

function sanitizeCategory(category?: string): string {
  const raw = normalizeText(category || "");
  if (!raw) return "General";
  const found = DEFAULT_MEMORY_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return found || raw;
}

function defaultMemoryMetadata(roleName: string): RoleMemoryMetadata {
  const date = today();
  return {
    name: roleName,
    version: "1.2.0",
    created: date,
    updated: date,
    autoConsolidate: true,
    consolidationInterval: "7d",
    tags: [],
  };
}

function parseYamlBoolean(value: string): boolean | null {
  if (/^(true|yes|on)$/i.test(value)) return true;
  if (/^(false|no|off)$/i.test(value)) return false;
  return null;
}

function parseYamlStringArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  return body
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

function parseFrontmatter(content: string): { metadata: Partial<RoleMemoryMetadata>; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---\n")) {
    return { metadata: {}, body: content };
  }

  const startOffset = content.length - trimmed.length;
  const endMarker = "\n---";
  const endIndexInTrimmed = trimmed.indexOf(endMarker, 4);
  if (endIndexInTrimmed < 0) {
    return { metadata: {}, body: content };
  }

  const rawMeta = trimmed.slice(4, endIndexInTrimmed);
  const afterMeta = trimmed.slice(endIndexInTrimmed + endMarker.length);
  const body = content.slice(0, startOffset) + afterMeta.replace(/^\s*\n/, "");

  const metadata: Partial<RoleMemoryMetadata> = {};
  for (const line of rawMeta.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();

    if (key === "name" || key === "version" || key === "created" || key === "updated" || key === "consolidationInterval") {
      (metadata as any)[key] = value.replace(/^['\"]|['\"]$/g, "");
      continue;
    }

    if (key === "autoConsolidate") {
      const parsed = parseYamlBoolean(value);
      if (parsed !== null) metadata.autoConsolidate = parsed;
      continue;
    }

    if (key === "tags") {
      metadata.tags = parseYamlStringArray(value);
      continue;
    }
  }

  return { metadata, body };
}

function mergeMemoryMetadata(roleName: string, partial?: Partial<RoleMemoryMetadata>): RoleMemoryMetadata {
  const base = defaultMemoryMetadata(roleName);
  if (!partial) return base;
  return {
    name: partial.name || base.name,
    version: partial.version || base.version,
    created: partial.created || base.created,
    updated: partial.updated || base.updated,
    autoConsolidate: partial.autoConsolidate ?? base.autoConsolidate,
    consolidationInterval: partial.consolidationInterval || base.consolidationInterval,
    tags: Array.isArray(partial.tags) ? partial.tags.filter(Boolean) : base.tags,
  };
}

function renderFrontmatter(metadata: RoleMemoryMetadata): string {
  const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"")}"`;
  const tags = metadata.tags.map((tag) => quote(tag)).join(", ");

  return [
    "---",
    `name: ${quote(metadata.name)}`,
    `version: ${quote(metadata.version)}`,
    `created: ${quote(metadata.created)}`,
    `updated: ${quote(metadata.updated)}`,
    `autoConsolidate: ${metadata.autoConsolidate ? "true" : "false"}`,
    `consolidationInterval: ${quote(metadata.consolidationInterval)}`,
    `tags: [${tags}]`,
    "---",
    "",
  ].join("\n");
}

export function ensureRoleMemoryFiles(rolePath: string, roleName: string): void {
  if (!existsSync(rolePath)) mkdirSync(rolePath, { recursive: true });

  const memoryRoot = memoryRootDir(rolePath);
  if (!existsSync(memoryRoot)) mkdirSync(memoryRoot, { recursive: true });

  const dailyDir = dailyMemoryDir(rolePath);
  if (!existsSync(dailyDir)) mkdirSync(dailyDir, { recursive: true });

  migrateLegacyMemoryLayout(rolePath);

  const file = memoryFilePath(rolePath);
  if (!existsSync(file)) {
    const initial = renderRoleMemory({
      roleName,
      metadata: defaultMemoryMetadata(roleName),
      autoExtracted: true,
      lastConsolidated: today(),
      learnings: [],
      preferences: [],
      events: [],
      issues: [],
    });
    writeFileSync(file, initial, "utf-8");
  }
}

function isPlaceholderItem(text: string): boolean {
  const t = normalizeText(text).toLowerCase();
  return t === "(none)" || t === "(none yet)" || t === "none" || t === "-";
}

function parseLearningItem(line: string, fallbackUsed: number): { text: string; used: number } | null {
  let text = normalizeText(line);
  let used = fallbackUsed;

  const prefixed = text.match(/^\[(\d+)x\]\s*(.+)$/i);
  if (prefixed) {
    used = Number(prefixed[1]);
    text = normalizeText(prefixed[2]);
  }

  const suffixed = text.match(/^(.+?)\s*\((?:used[:\s]*)?(\d+)x?\)$/i);
  if (suffixed) {
    text = normalizeText(suffixed[1]);
    used = Number(suffixed[2]);
  }

  if (!text || isPlaceholderItem(text)) return null;
  if (!Number.isFinite(used) || used < 0) used = fallbackUsed;

  return { text, used: Math.floor(used) };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s/_-]/g, "")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  const union = a.size + b.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

function dedupeLearnings(learnings: MemoryLearningRecord[]): MemoryLearningRecord[] {
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

function parseRoleMemory(content: string, roleName: string): RoleMemoryData {
  const { metadata: parsedMetadata, body } = parseFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const issues: string[] = [];

  let autoExtracted = true;
  let lastConsolidated: string | undefined;
  let roleNameFromHeading = roleName;

  const learningHigh: string[] = [];
  const learningNormal: string[] = [];
  const learningNew: string[] = [];
  const legacyLessons: string[] = [];
  const legacyPreferences: string[] = [];
  const prefSections = new Map<string, string[]>();
  const events: string[] = [];

  type Section = "none" | "high" | "normal" | "new" | "pref" | "events" | "legacy_lessons" | "legacy_prefs";
  let section: Section = "none";
  let currentPrefCategory = "General";

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);

    if (heading) {
      const title = heading[1].trim();
      const lower = title.toLowerCase();

      if (lower.startsWith("memory:")) {
        const headingRoleName = title.split(":").slice(1).join(":").trim();
        if (headingRoleName) roleNameFromHeading = headingRoleName;
        continue;
      }
      if (lower.startsWith("last consolidated:")) {
        const maybeDate = title.split(":").slice(1).join(":").trim();
        if (maybeDate) lastConsolidated = maybeDate;
        continue;
      }
      if (lower.startsWith("auto-extracted:")) {
        const value = title.split(":").slice(1).join(":").trim().toLowerCase();
        autoExtracted = value !== "false" && value !== "0";
        continue;
      }
      if (lower.includes("learnings") && lower.includes("high")) {
        section = "high";
        continue;
      }
      if (lower.includes("learnings") && lower.includes("normal")) {
        section = "normal";
        continue;
      }
      if (lower.includes("learnings") && lower.includes("new")) {
        section = "new";
        continue;
      }
      if (lower.startsWith("preferences:")) {
        section = "pref";
        currentPrefCategory = sanitizeCategory(title.split(":").slice(1).join(":").trim());
        if (!prefSections.has(currentPrefCategory)) prefSections.set(currentPrefCategory, []);
        continue;
      }
      if (lower === "preferences") {
        section = "pref";
        currentPrefCategory = "General";
        if (!prefSections.has(currentPrefCategory)) prefSections.set(currentPrefCategory, []);
        continue;
      }
      if (lower.startsWith("events")) {
        section = "events";
        continue;
      }

      // Legacy headings migration support
      if (lower.includes("significant events")) {
        section = "events";
        events.push(`## ${title}`);
        continue;
      }
      if (lower.includes("lessons learned")) {
        section = "legacy_lessons";
        continue;
      }
      if (lower.includes("preferences & boundaries") || lower.includes("preferences and boundaries")) {
        section = "legacy_prefs";
        continue;
      }
      if (lower.includes("running notes")) {
        section = "events";
        events.push(`## ${title}`);
        continue;
      }

      // Unknown headings are preserved under events (legacy/foreign sections)
      section = "events";
      events.push(line);
      continue;
    }

    if (!line.trim() || line.trim() === "---") {
      if (section === "events" && events.length > 0) events.push("");
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const item = bullet ? bullet[1] : normalizeText(line);

    if (!bullet && section !== "events") {
      issues.push(`Non-bullet line in ${section || "unknown"}: ${line}`);
    }

    if (isPlaceholderItem(item)) continue;

    if (section === "none") {
      events.push(line);
      issues.push(`Recovered stray line into events: ${line}`);
      continue;
    }

    if (section === "high") learningHigh.push(item);
    else if (section === "normal") learningNormal.push(item);
    else if (section === "new") learningNew.push(item);
    else if (section === "legacy_lessons") legacyLessons.push(item);
    else if (section === "legacy_prefs") legacyPreferences.push(item);
    else if (section === "pref") {
      const list = prefSections.get(currentPrefCategory) || [];
      list.push(item);
      prefSections.set(currentPrefCategory, list);
    } else if (section === "events") {
      events.push(line);
    }
  }

  const learnings: MemoryLearningRecord[] = [];
  const pushLearning = (items: string[], fallbackUsed: number) => {
    for (const item of items) {
      const parsed = parseLearningItem(item, fallbackUsed);
      if (!parsed) continue;
      learnings.push({
        id: hashId("learning", parsed.text),
        text: parsed.text,
        used: parsed.used,
      });
    }
  };

  pushLearning(learningHigh, 3);
  pushLearning(learningNormal, 1);
  pushLearning(learningNew, 0);
  pushLearning(legacyLessons, 1);

  const dedupedLearnings = dedupeLearnings(learnings);

  const prefMap = new Map<string, MemoryPreferenceRecord>();

  if (legacyPreferences.length > 0) {
    const list = prefSections.get("General") || [];
    list.push(...legacyPreferences);
    prefSections.set("General", list);
  }

  for (const [category, items] of prefSections.entries()) {
    for (const raw of items) {
      const text = normalizeText(raw);
      if (!text) continue;
      const key = `${sanitizeCategory(category)}::${text.toLowerCase()}`;
      if (!prefMap.has(key)) {
        prefMap.set(key, {
          id: hashId("preference", text, category),
          category: sanitizeCategory(category),
          text,
        });
      }
    }
  }

  const resolvedRoleName = parsedMetadata.name || roleNameFromHeading || roleName;

  return {
    roleName: resolvedRoleName,
    metadata: mergeMemoryMetadata(resolvedRoleName, parsedMetadata),
    autoExtracted,
    lastConsolidated,
    learnings: dedupedLearnings,
    preferences: Array.from(prefMap.values()),
    events,
    issues,
  };
}

function renderLearningList(learnings: MemoryLearningRecord[], minUsed: number, maxUsed: number): string[] {
  const list = learnings
    .filter((l) => l.used >= minUsed && l.used <= maxUsed)
    .sort((a, b) => {
      if (b.used !== a.used) return b.used - a.used;
      return a.text.localeCompare(b.text);
    });

  if (list.length === 0) return ["- (none)"];
  return list.map((l) => `- [${l.used}x] ${l.text}`);
}

function renderRoleMemory(data: RoleMemoryData): string {
  const metadata = mergeMemoryMetadata(data.roleName, {
    ...(data.metadata || {}),
    name: data.roleName,
    updated: today(),
  });

  const allCategories = new Set<string>(DEFAULT_MEMORY_CATEGORIES);
  for (const pref of data.preferences) allCategories.add(sanitizeCategory(pref.category));

  const byCategory = new Map<string, MemoryPreferenceRecord[]>();
  for (const pref of data.preferences) {
    const cat = sanitizeCategory(pref.category);
    const list = byCategory.get(cat) || [];
    list.push(pref);
    byCategory.set(cat, list);
  }

  const orderedCategories = [
    ...DEFAULT_MEMORY_CATEGORIES,
    ...Array.from(allCategories)
      .filter((c) => !DEFAULT_MEMORY_CATEGORIES.some((base) => base === c))
      .sort(),
  ];

  const lines: string[] = [
    renderFrontmatter(metadata).trimEnd(),
    `# Memory: ${data.roleName}`,
    `# Last Consolidated: ${data.lastConsolidated || today()}`,
    `# Auto-Extracted: ${data.autoExtracted ? "true" : "false"}`,
    "",
    "---",
    "",
    "# Learnings (High Priority)",
    ...renderLearningList(data.learnings, 3, Number.MAX_SAFE_INTEGER),
    "",
    "# Learnings (Normal)",
    ...renderLearningList(data.learnings, 1, 2),
    "",
    "# Learnings (New)",
    ...renderLearningList(data.learnings, 0, 0),
    "",
  ];

  for (const category of orderedCategories) {
    const items = (byCategory.get(category) || []).sort((a, b) => a.text.localeCompare(b.text));
    lines.push(`# Preferences: ${category}`);
    if (items.length === 0) {
      lines.push("- (none)");
    } else {
      for (const item of items) lines.push(`- ${item.text}`);
    }
    lines.push("");
  }

  lines.push("# Events");
  if (data.events.length === 0) {
    lines.push("- (none)");
  } else {
    lines.push(...data.events);
  }

  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

function readRawMemory(rolePath: string): string {
  const file = memoryFilePath(rolePath);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function writeMemory(rolePath: string, content: string): void {
  const file = memoryFilePath(rolePath);
  const dir = memoryRootDir(rolePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(file, content, "utf-8");
}

export function readRoleMemory(rolePath: string, roleName: string): RoleMemoryData {
  ensureRoleMemoryFiles(rolePath, roleName);
  const content = readRawMemory(rolePath);
  return parseRoleMemory(content, roleName);
}

function saveRoleMemory(rolePath: string, data: RoleMemoryData): void {
  writeMemory(rolePath, renderRoleMemory(data));
}

export function appendDailyRoleMemory(
  rolePath: string,
  category: "event" | "lesson" | "preference" | "context" | "decision",
  text: string,
  date = today()
): void {
  const section = `## [${nowTime()}] ${category.toUpperCase()}\n\n${normalizeText(text)}\n\n`;

  const writeOne = (file: string) => {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const exists = existsSync(file);
    const header = exists ? "" : `# Memory: ${date}\n\n`;
    writeFileSync(file, header + section, { encoding: "utf-8", flag: exists ? "a" : "w" });
  };

  writeOne(dailyMemoryPath(rolePath, date));

  log("daily-memory", `[${category}] ${text.slice(0, 120)}`);
}

export function addRoleLearning(
  rolePath: string,
  roleName: string,
  text: string,
  options?: { source?: string; appendDaily?: boolean; tags?: string[]; weight?: number }
): { stored: boolean; duplicate?: boolean; id?: string; reason?: string } {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "(none)") return { stored: false, reason: "empty" };

  const data = readRoleMemory(rolePath, roleName);
  const duplicate = data.learnings.find((l) => normalizeText(l.text).toLowerCase() === normalized.toLowerCase());
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id, reason: "duplicate" };

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

  return { stored: true, id: hashId("learning", normalized) };
}

export async function addRoleLearningWithTags(
  ctx: ExtensionContext,
  rolePath: string,
  roleName: string,
  text: string,
  options?: { source?: string; appendDaily?: boolean; tagModel?: string }
): Promise<{ stored: boolean; duplicate?: boolean; id?: string; reason?: string; tags?: string[] }> {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "(none)") return { stored: false, reason: "empty" };

  const data = readRoleMemory(rolePath, roleName);
  const duplicate = data.learnings.find((l) => normalizeText(l.text).toLowerCase() === normalized.toLowerCase());
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id, reason: "duplicate" };

  // Extract tags using LLM
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

export interface ScoredMemoryMatch extends MemorySearchMatch {
  score: number;
}

/**
 * Search role memory with scored ranking.
 * Uses substring match + token overlap + individual token hits.
 * Results sorted by score descending. Minimum threshold: 0.1.
 */
export function searchRoleMemory(
  rolePath: string,
  roleName: string,
  query: string,
  options?: { maxResults?: number; minScore?: number; includeDailyMemory?: boolean },
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

  // Search consolidated memory events
  for (const event of data.events) {
    const s = scoreMatch(q, queryTokens, event.toLowerCase());
    if (s >= minScore) {
      scored.push({ kind: "event", text: event, score: s });
    }
  }

  // Search recent daily memory files (last 7 days)
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
        // Split by ## headings (each is a memory entry)
        const sections = content.split(/^## /m).filter(Boolean);
        for (const section of sections) {
          const text = normalizeText(section).slice(0, 500);
          if (!text) continue;
          const s = scoreMatch(q, queryTokens, text.toLowerCase());
          if (s >= minScore) {
            const firstLine = section.split("\n")[0]?.trim() ?? "";
            scored.push({
              kind: "event",
              text: `[${dateStr}] ${firstLine}: ${text.slice(0, 200)}`,
              score: s * 0.9, // Slight penalty for daily (less curated)
            });
          }
        }
      } catch {
        // Skip unreadable daily files
      }
    }
  }

  // Sort by score descending, limit results
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

export function listRoleMemory(rolePath: string, roleName: string): {
  text: string;
  learnings: number;
  preferences: number;
  issues: number;
} {
  const data = readRoleMemory(rolePath, roleName);

  const learningLines = data.learnings
    .sort((a, b) => b.used - a.used)
    .slice(0, 20)
    .map((l) => `- [${l.id}] [${l.used}x] ${l.text}`);

  const prefLines = data.preferences
    .slice(0, 20)
    .map((p) => `- [${p.id}] [${p.category}] ${p.text}`);

  const text = [
    `## Memory (${roleName})`,
    "",
    `- Learnings: ${data.learnings.length}`,
    `- Preferences: ${data.preferences.length}`,
    `- Parse issues: ${data.issues.length}`,
    "",
    "### Learnings",
    ...(learningLines.length > 0 ? learningLines : ["- (none)"]),
    "",
    "### Preferences",
    ...(prefLines.length > 0 ? prefLines : ["- (none)"]),
  ].join("\n");

  return { text, learnings: data.learnings.length, preferences: data.preferences.length, issues: data.issues.length };
}

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

export function repairRoleMemory(
  rolePath: string,
  roleName: string,
  options?: { force?: boolean }
): {
  repaired: boolean;
  issues: number;
  backupPath?: string;
} {
  ensureRoleMemoryFiles(rolePath, roleName);
  const file = memoryFilePath(rolePath);
  const raw = readRawMemory(rolePath);

  const parsed = parseRoleMemory(raw, roleName);
  const canonical = renderRoleMemory(parsed);

  const changed = raw !== canonical;
  const issues = parsed.issues.length;
  if (!changed && issues === 0) return { repaired: false, issues: 0 };

  const backupDir = join(rolePath, ".backup", "memory");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = join(backupDir, `MEMORY.backup-${Date.now()}.md`);
  if (existsSync(file)) copyFileSync(file, backupPath);
  writeMemory(rolePath, canonical);

  log("repair", `repaired ${roleName}: ${issues} issues, backup=${backupPath}`);
  return { repaired: true, issues, backupPath };
}

/**
 * Get the N most recent existing daily memory files.
 * Returns array of {date, path} sorted by date descending (newest first).
 */
function getRecentDailyMemoryFiles(rolePath: string, count: number = 2): Array<{ date: string; path: string }> {
  return listDailyMemoryFilesByDate(rolePath)
    .slice(0, count)
    .map((item) => ({ date: item.date, path: item.path }));
}

export function readMemoryPromptBlocks(rolePath: string): string[] {
  const blocks: string[] = [];
  const memoryFile = memoryFilePath(rolePath);
  if (existsSync(memoryFile)) {
    blocks.push(`### Long-Term Memory\n\n${readFileSync(memoryFile, "utf-8")}`);
  }

  // Load most recent 2 existing daily memory files (not fixed today/yesterday)
  const recentDailyFiles = getRecentDailyMemoryFiles(rolePath, 2);
  for (const { date, path } of recentDailyFiles) {
    blocks.push(`### Daily Memory: ${date}\n\n${readFileSync(path, "utf-8")}`);
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

  const lines = highPriority.map((l) => `- [${l.used}x] ${l.text}`);
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
      const relevantLines = matches.map((m) => {
        if (m.kind === "learning") return `- [${m.used}x] ${m.text}`;
        if (m.kind === "preference") return `- [${m.category}] ${m.text}`;
        return `- ${m.text}`;
      });
      blocks.push(`### Relevant Memories (search: "${query.slice(0, 50)}${query.length > 50 ? "..." : ""}")\n\n${relevantLines.join("\n")}`);
    }
  }

  const content = blocks.join("\n\n---\n\n");
  return { content, matchCount, searchQuery: query };
}

export function buildMemoryEditInstruction(rolePath: string): string {
  return `## 🧠 Memory Edit Spec (STRICT)\n\nMemory file: ${memoryFilePath(rolePath)}\n\nWhen you update memory, follow this format exactly:\n\n1) Learning sections\n- # Learnings (High Priority)  -> used >= 3\n- # Learnings (Normal)         -> used 1-2\n- # Learnings (New)            -> used = 0\n- Learning line format: - [Nx] concise text\n\n2) Preference sections\n- # Preferences: Communication | Code | Tools | Workflow | General\n- Preference line format: - concise text\n\n3) Event section\n- # Events\n- Event format:\n  ## [YYYY-MM-DD] Title\n  Details...\n\nRules:\n- Keep items durable and reusable across sessions.\n- Avoid one-off tasks and noisy logs.\n- Do not delete valid memory entries unless clearly duplicated.\n- If file looks malformed, normalize to canonical heading structure.\n- Never use free-form paragraphs under learning/preference sections; use bullet lines.\n- Keep learning/preference lines under 120 chars when possible.`;
}

export function extractMemoryFacts(rolePath: string, roleName: string): { learnings: string[]; preferences: string[] } {
  const data = readRoleMemory(rolePath, roleName);
  return {
    learnings: data.learnings.map((l) => l.text),
    preferences: data.preferences.map((p) => `[${p.category}] ${p.text}`),
  };
}

export interface MemoryStats {
  roleName: string;
  learnings: { total: number; highPriority: number; normal: number; new: number };
  preferences: { total: number; categories: Record<string, number> };
  events: number;
  dailyMemoryFiles: number;
  lastConsolidated: string | null;
}

/**
 * Get statistics about a role's memory.
 */
export function getMemoryStats(rolePath: string, roleName: string): MemoryStats {
  const data = readRoleMemory(rolePath, roleName);

  const highPriority = data.learnings.filter((l) => l.used >= 3).length;
  const normal = data.learnings.filter((l) => l.used >= 1 && l.used < 3).length;
  const newLearnings = data.learnings.filter((l) => l.used === 0).length;

  const categories: Record<string, number> = {};
  for (const pref of data.preferences) {
    categories[pref.category] = (categories[pref.category] || 0) + 1;
  }

  const dailyFiles = listDailyMemoryFilesByDate(rolePath).length;

  return {
    roleName,
    learnings: { total: data.learnings.length, highPriority, normal, new: newLearnings },
    preferences: { total: data.preferences.length, categories },
    events: data.events.length,
    dailyMemoryFiles: dailyFiles,
    lastConsolidated: data.lastConsolidated ?? null,
  };
}
