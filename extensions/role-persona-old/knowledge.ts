/**
 * Knowledge Base Module — reusable knowledge entries organized by category directories.
 *
 * Two layers:
 *   - Global: ROLES_DIR/knowledge/  (shared across all roles)
 *   - Role:   ROLES_DIR/<role>/knowledge/  (role-specific)
 *
 * Structure: 2-level directories (category/entry.md) with YAML frontmatter.
 * Aggregation across categories is done via tags at the software level.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { log } from "./logger.ts";
import { ROLES_DIR } from "./role-store.ts";
import { config } from "./config.ts";
import type { KnowledgeExternalSource } from "./config.ts";

// ============================================================================
// Constants
// ============================================================================

export const GLOBAL_KNOWLEDGE_DIR = join(ROLES_DIR, "knowledge");

/** Skills directory as knowledge source - scanned from ~/.pi/agent/skills/ */
// ROLES_DIR points to ~/.pi/roles, skills is at ~/.pi/agent/skills
// So we go: ~/.pi/roles -> .. -> .pi -> agent/skills
export const SKILLS_KNOWLEDGE_DIR = join(ROLES_DIR, "..", "agent", "skills");

export function getRoleKnowledgeDir(rolePath: string): string {
  return join(rolePath, "knowledge");
}

// ============================================================================
// Frontmatter Types
// ============================================================================

export interface KnowledgeFrontmatter {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  version: number;
  created: string;
  updated: string;
  scope?: string;
  author?: string;
  name?: string;
}

export interface KnowledgeEntry {
  /** Relative path from knowledge root, e.g. "design-systems/glassmorphism.md" */
  relativePath: string;
  /** Absolute file path */
  absolutePath: string;
  /** Parsed frontmatter */
  meta: KnowledgeFrontmatter;
  /** Source layer: "global", "role", or external source id */
  source: string;
  /** Whether this source is readonly (external sources are always readonly) */
  readonly: boolean;
  /** Category directory name */
  category: string;
  /** File name without extension */
  slug: string;
}

export interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  relevance: number;
  matchedOn: string[];
}

export interface CategoryInfo {
  category: string;
  entries: Array<{
    file: string;
    title: string;
    description: string;
    tags: string[];
    updated: string;
    scope?: string;
  }>;
}

export interface SourceInfo {
  id: string;
  description?: string;
  readonly: boolean;
  categories: CategoryInfo[];
}

export interface KnowledgeListResult {
  sources: SourceInfo[];
  tagIndex: Record<string, string[]>;
  totalEntries: number;
}

export interface KnowledgeWriteResult {
  [key: string]: unknown;
  written: string;
  category: string;
  isNew: boolean;
  version: number;
  source: "global" | "role";
  suggestion?: string;
}

// ============================================================================
// External Source Helpers
// ============================================================================

function resolveExternalPath(p: string): string {
  if (p.startsWith("~")) return join(homedir(), p.slice(1));
  return resolve(p);
}

function getExternalSources(): Array<{ id: string; path: string; description?: string }> {
  const sources = config.knowledge?.externalSources || [];
  return sources
    .map((s: KnowledgeExternalSource) => ({ ...s, path: resolveExternalPath(s.path) }))
    .filter((s) => existsSync(s.path));
}

/** Auto-discover project-level knowledge base (docs/knowledge/) from cwd */
let _projectKnowledgePath: string | null = null;

export function setProjectCwd(cwd: string): void {
  const candidate = join(cwd, "docs", "knowledge");
  _projectKnowledgePath = existsSync(candidate) ? candidate : null;
  if (_projectKnowledgePath) {
    log("knowledge", `project knowledge discovered: ${_projectKnowledgePath}`);
  }
}

function getProjectSource(): { id: string; path: string; description: string } | null {
  if (!_projectKnowledgePath || !existsSync(_projectKnowledgePath)) return null;
  return { id: "project", path: _projectKnowledgePath, description: "Project knowledge base (docs/knowledge/)" };
}

// ============================================================================
// Frontmatter Parser (zero-dependency)
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content.
 * Handles: string values, arrays [a, b, c], numbers, bare values.
 */
export function parseFrontmatter(content: string): { meta: Partial<KnowledgeFrontmatter>; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---\n") && !trimmed.startsWith("---\r\n")) {
    return { meta: {}, body: content };
  }

  const firstNewline = trimmed.indexOf("\n");
  const rest = trimmed.slice(firstNewline + 1);
  const endIdx = rest.indexOf("\n---");
  if (endIdx === -1) return { meta: {}, body: content };

  const yamlBlock = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + 4).replace(/^\r?\n/, "");

  const meta: Record<string, any> = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimLine = line.trim();
    if (!trimLine || trimLine.startsWith("#")) continue;

    const colonIdx = trimLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimLine.slice(0, colonIdx).trim();
    let value = trimLine.slice(colonIdx + 1).trim();

    // Array: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      meta[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Number
    if (/^\d+$/.test(value)) {
      meta[key] = parseInt(value, 10);
      continue;
    }

    meta[key] = value;
  }

  return { meta: meta as Partial<KnowledgeFrontmatter>, body };
}

/**
 * Build frontmatter string from metadata.
 */
export function buildFrontmatter(meta: KnowledgeFrontmatter): string {
  const lines = ["---"];
  lines.push(`title: "${meta.title}"`);
  lines.push(`description: "${meta.description}"`);
  lines.push(`tags: [${meta.tags.join(", ")}]`);
  if (meta.category) lines.push(`category: ${meta.category}`);
  lines.push(`version: ${meta.version}`);
  lines.push(`created: ${meta.created}`);
  lines.push(`updated: ${meta.updated}`);
  if (meta.scope) lines.push(`scope: ${meta.scope}`);
  if (meta.author) lines.push(`author: ${meta.author}`);
  lines.push("---");
  return lines.join("\n");
}

// ============================================================================
// Directory Scanning
// ============================================================================

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Scan a knowledge root directory and return all entries.
 * Supports 2-level: category-dir/entry.md or root-level entry.md (category = "(root)").
 */
function scanKnowledgeDir(rootDir: string, source: string, readonly: boolean): KnowledgeEntry[] {
  if (!existsSync(rootDir)) return [];

  const entries: KnowledgeEntry[] = [];

  let children: string[];
  try {
    children = readdirSync(rootDir);
  } catch {
    return [];
  }

  for (const child of children) {
    if (child.startsWith(".") || child.startsWith("_")) continue;
    const childPath = join(rootDir, child);

    let st;
    try {
      st = statSync(childPath);
    } catch {
      continue;
    }

    if (st.isFile() && child.endsWith(".md")) {
      // Root-level md
      const entry = readEntry(childPath, rootDir, "(root)", source, readonly);
      if (entry) entries.push(entry);
    } else if (st.isDirectory()) {
      // Category directory
      const category = child;
      let mdFiles: string[];
      try {
        mdFiles = readdirSync(childPath).filter((f) => f.endsWith(".md") && !f.startsWith("."));
      } catch {
        continue;
      }

      for (const mdFile of mdFiles) {
        const entry = readEntry(join(childPath, mdFile), rootDir, category, source, readonly);
        if (entry) entries.push(entry);
      }
    }
  }

  return entries;
}

function readEntry(filePath: string, rootDir: string, category: string, source: string, readonly: boolean): KnowledgeEntry | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const { meta } = parseFrontmatter(content);
  const fileName = basename(filePath);
  const slug = fileName.replace(/\.md$/, "");
  const relPath = relative(rootDir, filePath);

  const fullMeta: KnowledgeFrontmatter = {
    title: (meta.title as string) || slug,
    description: (meta.description as string) || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    category: (meta.category as string) || category,
    version: typeof meta.version === "number" ? meta.version : 1,
    created: (meta.created as string) || "",
    updated: (meta.updated as string) || "",
    scope: meta.scope as string | undefined,
    author: meta.author as string | undefined,
  };

  return { relativePath: relPath, absolutePath: filePath, meta: fullMeta, source, readonly, category, slug };
}

// ============================================================================
// Skills Source - Readonly
// ============================================================================

/**
 * Scan skills directory and return entries from SKILL.md files.
 * Each skill directory with SKILL.md becomes a knowledge entry.
 */
function scanSkillsDir(): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  if (!existsSync(SKILLS_KNOWLEDGE_DIR)) return entries;

  let children: string[];
  try {
    children = readdirSync(SKILLS_KNOWLEDGE_DIR);
  } catch {
    return entries;
  }

  for (const child of children) {
    if (child.startsWith(".") || child.startsWith("_")) continue;
    const skillPath = join(SKILLS_KNOWLEDGE_DIR, child);

    let st;
    try {
      st = statSync(skillPath);
    } catch {
      continue;
    }

    if (!st.isDirectory()) continue;

    // Look for SKILL.md in the skill directory
    const skillFile = join(skillPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    let content: string;
    try {
      content = readFileSync(skillFile, "utf-8");
    } catch {
      continue;
    }

    // Parse frontmatter from SKILL.md
    const { meta } = parseFrontmatter(content);
    const title = (meta.title as string) || child;
    const description = (meta.description as string) || "";
    const tags = Array.isArray(meta.tags) ? meta.tags : [];

    // Auto-tag with skill-related keywords for better searchability
    const autoTags = ["skill", "tool", "capability"];
    const allTags = [...new Set([...tags, ...autoTags])];

    // Build a summary from description + first section
    const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)/);
    const firstSection = bodyMatch ? bodyMatch[1].slice(0, 500).trim() : "";

    const fullMeta: KnowledgeFrontmatter = {
      title,
      description,
      tags: allTags,
      category: "skills",
      version: 1,
      created: "",
      updated: "",
      scope: "tools",
    };

    entries.push({
      relativePath: `${child}/SKILL.md`,
      absolutePath: skillFile,
      meta: fullMeta,
      source: "skills",
      readonly: true,
      category: "skills",
      slug: child,
    });
  }

  return entries;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Collect all entries from all sources (global + role + project + external + skills).
 */
function collectAllEntries(rolePath: string | null): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  entries.push(...scanKnowledgeDir(GLOBAL_KNOWLEDGE_DIR, "global", false));
  if (rolePath) entries.push(...scanKnowledgeDir(getRoleKnowledgeDir(rolePath), "role", false));
  const proj = getProjectSource();
  if (proj) entries.push(...scanKnowledgeDir(proj.path, proj.id, true));
  for (const ext of getExternalSources()) {
    entries.push(...scanKnowledgeDir(ext.path, ext.id, true));
  }
  // Add skills source
  entries.push(...scanSkillsDir());
  return entries;
}

/**
 * List all knowledge entries from all sources.
 */
export function listKnowledge(rolePath: string | null): KnowledgeListResult {
  const allEntries = collectAllEntries(rolePath);

  // Group by source
  const sourceMap = new Map<string, { readonly: boolean; description?: string; entries: KnowledgeEntry[] }>();

  // Ensure built-in sources always appear
  sourceMap.set("global", { readonly: false, entries: [], description: "Shared knowledge" });
  if (rolePath) sourceMap.set("role", { readonly: false, entries: [], description: "Role-specific knowledge" });
  const proj = getProjectSource();
  if (proj) sourceMap.set("project", { readonly: true, entries: [], description: proj.description });
  for (const ext of getExternalSources()) {
    sourceMap.set(ext.id, { readonly: true, entries: [], description: ext.description });
  }
  // Skills source - always available, readonly
  sourceMap.set("skills", { readonly: true, entries: [], description: "Available Pi skills (from ~/.pi/agent/skills/)" });

  for (const e of allEntries) {
    const group = sourceMap.get(e.source);
    if (group) group.entries.push(e);
  }

  const toCategories = (entries: KnowledgeEntry[]): CategoryInfo[] => {
    const map = new Map<string, CategoryInfo>();
    for (const e of entries) {
      let cat = map.get(e.category);
      if (!cat) {
        cat = { category: e.category, entries: [] };
        map.set(e.category, cat);
      }
      cat.entries.push({
        file: basename(e.absolutePath),
        title: e.meta.title,
        description: e.meta.description,
        tags: e.meta.tags,
        updated: e.meta.updated,
        scope: e.meta.scope,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
  };

  const sources: SourceInfo[] = [];
  for (const [id, group] of sourceMap) {
    sources.push({
      id,
      description: group.description,
      readonly: group.readonly,
      categories: toCategories(group.entries),
    });
  }

  // Tag index across all sources
  const tagIndex: Record<string, string[]> = {};
  for (const e of allEntries) {
    for (const tag of e.meta.tags) {
      const key = tag.toLowerCase();
      if (!tagIndex[key]) tagIndex[key] = [];
      tagIndex[key].push(`${e.source}:${e.relativePath}`);
    }
  }

  return { sources, tagIndex, totalEntries: allEntries.length };
}

/**
 * Read a single knowledge entry by relative path.
 * Tries global → role → external sources in order.
 * Optionally prefix with "source:" to target a specific source.
 */
export function readKnowledge(
  path: string,
  rolePath: string | null,
): { frontmatter: KnowledgeFrontmatter; body: string; absolutePath: string; source: string; readonly: boolean; charCount: number; lineCount: number } | null {
  // Support "source:path" prefix
  let targetSource: string | null = null;
  const colonIdx = path.indexOf(":");
  if (colonIdx > 0 && !path.startsWith("/") && !path.startsWith(".")) {
    const prefix = path.slice(0, colonIdx);
    // Include "skills" as a valid prefix
    if (["global", "role", "project", "skills"].includes(prefix) || getExternalSources().some((s) => s.id === prefix)) {
      targetSource = prefix;
      path = path.slice(colonIdx + 1);
    }
  }

  const candidates: Array<{ dir: string; source: string; readonly: boolean }> = [];

  if (!targetSource || targetSource === "global") {
    candidates.push({ dir: GLOBAL_KNOWLEDGE_DIR, source: "global", readonly: false });
  }
  if (rolePath && (!targetSource || targetSource === "role")) {
    candidates.push({ dir: getRoleKnowledgeDir(rolePath), source: "role", readonly: false });
  }
  const proj = getProjectSource();
  if (proj && (!targetSource || targetSource === "project")) {
    candidates.push({ dir: proj.path, source: "project", readonly: true });
  }
  for (const ext of getExternalSources()) {
    if (!targetSource || targetSource === ext.id) {
      candidates.push({ dir: ext.path, source: ext.id, readonly: true });
    }
  }
  // Skills source
  if (targetSource === "skills") {
    // Skills are at SKILLS_KNOWLEDGE_DIR/<skill-name>/SKILL.md
    // The path should be like "agent-browser/SKILL.md"
    candidates.push({ dir: SKILLS_KNOWLEDGE_DIR, source: "skills", readonly: true });
  }

  for (const c of candidates) {
    const fullPath = join(c.dir, path);
    if (existsSync(fullPath)) {
      return readKnowledgeFile(fullPath, c.source, c.readonly);
    }
  }

  return null;
}

function readKnowledgeFile(absolutePath: string, source: string, readonly: boolean) {
  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch {
    return null;
  }

  const { meta, body } = parseFrontmatter(content);
  const fullMeta: KnowledgeFrontmatter = {
    title: (meta.title as string) || (meta.name as string) || basename(absolutePath, ".md"),
    description: (meta.description as string) || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    version: typeof meta.version === "number" ? meta.version : 1,
    created: (meta.created as string) || "",
    updated: (meta.updated as string) || "",
    scope: meta.scope as string | undefined,
    author: meta.author as string | undefined,
  };

  return {
    frontmatter: fullMeta,
    body,
    absolutePath,
    source,
    readonly,
    charCount: content.length,
    lineCount: content.split("\n").length,
  };
}

/**
 * Search knowledge entries by query, tags, category, scope.
 * Searches across all sources (global + role + external).
 */
export function searchKnowledge(
  rolePath: string | null,
  opts: {
    query?: string;
    tags?: string[];
    category?: string;
    scope?: string;
    limit?: number;
    roleBoost?: number;
  },
): KnowledgeSearchResult[] {
  const { query, tags, category, scope, limit = 5, roleBoost = 1.2 } = opts;
  const allEntries = collectAllEntries(rolePath);

  const queryLower = (query || "").toLowerCase();
  const queryTokens = queryLower.split(/\s+/).filter(Boolean);
  const filterTags = (tags || []).map((t) => t.toLowerCase());

  const results: KnowledgeSearchResult[] = [];

  for (const entry of allEntries) {
    // Category filter
    if (category && entry.category !== category) continue;
    // Scope filter
    if (scope && entry.meta.scope && entry.meta.scope !== scope) continue;

    let relevance = 0;
    const matchedOn: string[] = [];

    // Tag matching
    if (filterTags.length > 0) {
      const entryTags = entry.meta.tags.map((t) => t.toLowerCase());
      const matched = filterTags.filter((t) => entryTags.includes(t));
      if (matched.length > 0) {
        relevance += 0.3 * (matched.length / filterTags.length);
        matchedOn.push(...matched.map((t) => `tag:${t}`));
      }
    }

    // Query matching
    if (queryTokens.length > 0) {
      const searchable = [
        entry.meta.title,
        entry.meta.description,
        entry.meta.tags.join(" "),
        entry.category,
        entry.slug,
      ]
        .join(" ")
        .toLowerCase();

      let tokenHits = 0;
      for (const token of queryTokens) {
        if (searchable.includes(token)) tokenHits++;
      }

      if (tokenHits > 0) {
        const tokenScore = tokenHits / queryTokens.length;
        relevance += 0.5 * tokenScore;
        matchedOn.push("keyword");

        // Title exact match bonus
        if (entry.meta.title.toLowerCase().includes(queryLower)) {
          relevance += 0.2;
          matchedOn.push("title");
        }
      }
    }

    // No query and no tags → list mode, give base score
    if (queryTokens.length === 0 && filterTags.length === 0) {
      relevance = 0.5;
      matchedOn.push("browse");
    }

    if (relevance <= 0) continue;

    // Role knowledge boost
    if (entry.source === "role") {
      relevance *= roleBoost;
    }

    results.push({ entry, relevance: Math.min(1, relevance), matchedOn });
  }

  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, limit);
}

/**
 * Write a knowledge entry. Smart category matching when category is not specified.
 */
export function writeKnowledge(
  rolePath: string | null,
  opts: {
    title: string;
    description?: string;
    content: string;
    category?: string;
    tags?: string[];
    scope?: string;
    global?: boolean;
  },
): KnowledgeWriteResult {
  const isGlobal = opts.global !== false;
  const rootDir = isGlobal ? GLOBAL_KNOWLEDGE_DIR : (rolePath ? getRoleKnowledgeDir(rolePath) : GLOBAL_KNOWLEDGE_DIR);
  const source: "global" | "role" = isGlobal ? "global" : "role";

  ensureDir(rootDir);

  const tags = opts.tags || [];
  const today = new Date().toISOString().split("T")[0];

  // Resolve category
  let category: string | null | undefined = opts.category;
  let suggestion: string | undefined;

  if (!category) {
    // Smart match: find best existing category by tag/title overlap
    category = matchCategory(rootDir, opts.title, tags);
    if (category && category !== "(root)") {
      suggestion = `Matched existing category '${category}' by tags/title similarity`;
    } else {
      category = "(root)";
    }
  }

  // Build file path
  const slug = toSlug(opts.title);
  const targetDir = category === "(root)" ? rootDir : join(rootDir, category);
  ensureDir(targetDir);

  const filePath = join(targetDir, `${slug}.md`);
  const isNew = !existsSync(filePath);

  // If updating, bump version
  let version = 1;
  if (!isNew) {
    try {
      const existing = readFileSync(filePath, "utf-8");
      const { meta } = parseFrontmatter(existing);
      version = (typeof meta.version === "number" ? meta.version : 1) + 1;
    } catch {
      // ignore
    }
  }

  const meta: KnowledgeFrontmatter = {
    title: opts.title,
    description: opts.description || "",
    tags,
    category: category === "(root)" ? undefined : category,
    version,
    created: isNew ? today : (readExistingCreated(filePath) || today),
    updated: today,
    scope: opts.scope,
  };

  const fileContent = `${buildFrontmatter(meta)}\n\n${opts.content}`;
  writeFileSync(filePath, fileContent, "utf-8");

  const relPath = relative(rootDir, filePath);
  log("knowledge", `${isNew ? "created" : "updated"} ${source}:${relPath} v${version}`);

  return {
    written: filePath,
    category: category === "(root)" ? "(root)" : category,
    isNew,
    version,
    source,
    suggestion,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

function readExistingCreated(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const { meta } = parseFrontmatter(content);
    return (meta.created as string) || null;
  } catch {
    return null;
  }
}

/**
 * Find the best matching existing category directory for given title + tags.
 */
function matchCategory(rootDir: string, title: string, tags: string[]): string | null {
  if (!existsSync(rootDir)) return null;

  let dirs: string[];
  try {
    dirs = readdirSync(rootDir).filter((name) => {
      if (name.startsWith(".") || name.startsWith("_")) return false;
      try {
        return statSync(join(rootDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }

  if (dirs.length === 0) return null;

  const titleLower = title.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  let bestDir: string | null = null;
  let bestScore = 0;

  for (const dir of dirs) {
    let score = 0;
    const dirLower = dir.toLowerCase().replace(/-/g, " ");
    const dirTokens = dirLower.split(/[\s-]+/);

    // Directory name matches title tokens
    for (const token of dirTokens) {
      if (titleLower.includes(token)) score += 0.3;
    }

    // Directory name matches tags
    for (const token of dirTokens) {
      if (tagSet.has(token)) score += 0.4;
    }

    // Scan existing entries in this dir for tag overlap
    try {
      const files = readdirSync(join(rootDir, dir)).filter((f) => f.endsWith(".md"));
      for (const file of files.slice(0, 5)) {
        const content = readFileSync(join(rootDir, dir, file), "utf-8");
        const { meta } = parseFrontmatter(content);
        const entryTags = (Array.isArray(meta.tags) ? meta.tags : []).map((t: string) => t.toLowerCase());
        const overlap = entryTags.filter((t: string) => tagSet.has(t)).length;
        if (overlap > 0) score += 0.3 * (overlap / Math.max(tagSet.size, 1));
      }
    } catch {
      // ignore
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestScore >= 0.2 ? bestDir : null;
}
