/** consolidated.md parsing, rendering, read/write, layout migration, and repair. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { log } from "../logger.ts";
import { contentHash, writeCommittedMemoryFile } from "../memory-git.ts";
import { renderPendingMemory } from "./pending-store.ts";
import { dailyMemoryDir, memoryFilePath, memoryRootDir, pendingMemoryPath } from "./paths.ts";
import { dedupeLearnings, hashId, isPlaceholderItem, normalizeText, sanitizeCategory, today } from "./text.ts";
import {
  DEFAULT_MEMORY_CATEGORIES,
  type MemoryEventRecord,
  type MemoryLearningRecord,
  type MemoryPreferenceRecord,
  type RoleMemoryData,
  type RoleMemoryMetadata,
} from "./types.ts";

function migrateLegacyMemoryLayout(rolePath: string): void {
  const canonical = memoryFilePath(rolePath);
  const legacyMemory = join(rolePath, "MEMORY.md");

  if (existsSync(legacyMemory)) {
    const shouldCopy = !existsSync(canonical) || statSync(legacyMemory).mtimeMs > statSync(canonical).mtimeMs;
    if (shouldCopy) {
      writeCommittedMemoryFile(rolePath, canonical, readFileSync(legacyMemory, "utf-8"), "migrate consolidated memory");
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

    writeCommittedMemoryFile(rolePath, dst, readFileSync(src, "utf-8"), "migrate daily memory");
    log("migrate-memory", `upgraded ${src} -> ${dst}`);
  }
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
    writeCommittedMemoryFile(rolePath, file, initial, "initialize consolidated memory");
  }

  // Ensure pending layer exists
  const pendingFile = pendingMemoryPath(rolePath);
  if (!existsSync(pendingFile)) {
    const pendingInitial = renderPendingMemory({
      roleName,
      updated: today(),
      items: [],
    });
    writeCommittedMemoryFile(rolePath, pendingFile, pendingInitial, "initialize pending memory");
  }
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

/**
 * Group raw # Events lines into structured blocks.
 * Canonical form: ## [YYYY-MM-DD] Title + body lines.
 * Free-form / legacy lines become a single orphan block for search + round-trip.
 */
export function parseEventBlocks(eventLines: string[]): MemoryEventRecord[] {
  const blocks: MemoryEventRecord[] = [];
  let current: { date: string; title: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.body.join("\n").replace(/\n+$/, "").trim();
    const title = normalizeText(current.title);
    if (!title && !body) {
      current = null;
      return;
    }
    if (isPlaceholderItem(title || body)) {
      current = null;
      return;
    }
    const text = [title, body].filter(Boolean).join("\n");
    blocks.push({
      id: hashId("event", text, current.date),
      date: current.date,
      title: title || body.slice(0, 80),
      body: title ? body : "",
    });
    current = null;
  };

  for (const raw of eventLines) {
    const line = raw.replace(/\s+$/, "");
    const h2 = line.match(/^##\s+(?:\[(\d{4}-\d{2}-\d{2})\]\s*)?(.+)$/);
    if (h2) {
      flush();
      current = { date: h2[1] || "", title: h2[2].trim(), body: [] };
      continue;
    }
    // Top-level # headings that leaked into events (not ##) — start orphan if needed
    if (/^#\s+/.test(line) && !line.startsWith("##")) {
      if (!current) {
        current = { date: "", title: line.replace(/^#+\s+/, "").trim(), body: [] };
      } else {
        current.body.push(line);
      }
      continue;
    }
    if (!current) {
      if (!line.trim() || isPlaceholderItem(line.replace(/^[-*]\s+/, ""))) continue;
      current = { date: "", title: "", body: [line] };
      continue;
    }
    current.body.push(line);
  }
  flush();
  return blocks;
}

function renderEventBlocks(events: MemoryEventRecord[]): string[] {
  if (events.length === 0) return ["- (none)"];
  const lines: string[] = [];
  for (const event of events) {
    const title = event.title || "Event";
    lines.push(event.date ? `## [${event.date}] ${title}` : `## ${title}`);
    if (event.body.trim()) {
      lines.push(event.body.trimEnd());
    }
    lines.push("");
  }
  return lines;
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
    events: parseEventBlocks(events),
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
  lines.push(...renderEventBlocks(data.events));

  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

function readRawMemory(rolePath: string): string {
  const file = memoryFilePath(rolePath);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function writeMemory(rolePath: string, content: string, expectedHash?: string): void {
  const file = memoryFilePath(rolePath);
  const dir = memoryRootDir(rolePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeCommittedMemoryFile(rolePath, file, content, "update consolidated memory", { expectedHash });
}

export function readRoleMemory(rolePath: string, roleName: string): RoleMemoryData {
  ensureRoleMemoryFiles(rolePath, roleName);
  const content = readRawMemory(rolePath);
  const data = parseRoleMemory(content, roleName);
  data.sourceHash = contentHash(content);
  return data;
}

export function saveRoleMemory(rolePath: string, data: RoleMemoryData): void {
  writeMemory(rolePath, renderRoleMemory(data), data.sourceHash);
}

export function repairRoleMemory(
  rolePath: string,
  roleName: string
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
  writeMemory(rolePath, canonical, contentHash(raw));

  log("repair", `repaired ${roleName}: ${issues} issues, backup=${backupPath}`);
  return { repaired: true, issues, backupPath };
}
