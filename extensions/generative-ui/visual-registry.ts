// Skill-driven visual route registry.
// Any skill subdirectory may ship a `visual-routes.json` manifest declaring
// visual routes. Manifests are loaded deterministically (scan-root order, then
// skill directory name) and bad manifests are skipped with warnings instead of
// throwing. Registered routes take priority over the built-in chain in routing.ts.

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VisualRoute, VisualStyle, VisualTarget } from "./routing.js";

export type RegisteredRouteSpec = Omit<VisualRoute, "research" | "researchInstruction"> & {
  skillRef: string;
  patterns: string[];
};

export interface VisualRouteRegistry {
  routes: RegisteredRouteSpec[];
  warnings: string[];
}

const TARGETS: readonly string[] = ["markdown", "show_widget", "show_canvas"];
const STYLES: readonly string[] = [
  "editorial",
  "analytical",
  "system",
  "comparison",
  "record",
  "workflow",
  "product",
  "illustrative",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Scan roots holding one skill subdirectory each. `VISUAL_SKILLS_ROOTS` (colon separated) overrides. */
export function skillRoots(): string[] {
  const override = process.env.VISUAL_SKILLS_ROOTS;
  if (override?.trim()) {
    return override.split(":").map((part) => part.trim()).filter(Boolean);
  }
  const home = homedir();
  const cwd = process.cwd();
  return [
    join(home, ".pi", "agent", "skills"),
    join(home, ".agents", "skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, ".agents", "skills"),
  ];
}

/** Case-insensitive substring, or `/regex/` form (compiled case-insensitively). */
function toRegExp(pattern: string): RegExp | null {
  if (pattern.length < 3 || !pattern.startsWith("/") || !pattern.endsWith("/")) return null;
  return new RegExp(pattern.slice(1, -1), "i");
}

function isValidPattern(pattern: string): boolean {
  try {
    toRegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function matchesPattern(request: string, pattern: string): boolean {
  const regex = toRegExp(pattern);
  return regex ? regex.test(request) : request.toLowerCase().includes(pattern.toLowerCase());
}

type ParseResult = { spec: RegisteredRouteSpec } | { warning: string };

function parseRouteEntry(entry: unknown, skillDir: string, file: string, index: number): ParseResult {
  const at = `${file}: routes[${index}]`;
  if (!isRecord(entry)) return { warning: `${at}: expected an object` };

  const id = entry.id;
  if (typeof id !== "string" || !id.trim()) return { warning: `${at}: field "id" must be a non-empty string` };
  const title = entry.title;
  if (typeof title !== "string" || !title.trim()) return { warning: `${at}: field "title" must be a non-empty string` };
  const reason = entry.reason;
  if (typeof reason !== "string" || !reason.trim()) return { warning: `${at}: field "reason" must be a non-empty string` };

  const target = entry.target;
  if (typeof target !== "string" || !TARGETS.includes(target)) {
    return { warning: `${at}: field "target" must be one of ${TARGETS.join(", ")}` };
  }
  const style = entry.style;
  if (typeof style !== "string" || !STYLES.includes(style)) {
    return { warning: `${at}: field "style" must be one of ${STYLES.join(", ")}` };
  }

  const patterns = entry.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { warning: `${at}: field "patterns" must be a non-empty array of strings` };
  }
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || !pattern.trim()) {
      return { warning: `${at}: field "patterns" must be a non-empty array of strings` };
    }
    if (!isValidPattern(pattern)) {
      return { warning: `${at}: pattern ${JSON.stringify(pattern)} is not a valid regex` };
    }
  }

  const modules = entry.modules;
  if (!Array.isArray(modules) || !modules.every((item) => typeof item === "string" && item.trim())) {
    return { warning: `${at}: field "modules" must be an array of non-empty strings` };
  }
  const templates = entry.templates;
  if (!Array.isArray(templates) || !templates.every((item) => typeof item === "string" && item.trim())) {
    return { warning: `${at}: field "templates" must be an array of non-empty strings` };
  }
  const contentPlan = entry.contentPlan;
  if (!Array.isArray(contentPlan) || contentPlan.length === 0 || !contentPlan.every((item) => typeof item === "string" && item.trim())) {
    return { warning: `${at}: field "contentPlan" must be a non-empty array of strings` };
  }

  let skillRef = skillDir;
  if (entry.skillRef !== undefined) {
    if (typeof entry.skillRef !== "string" || !entry.skillRef.trim()) {
      return { warning: `${at}: field "skillRef" must be a non-empty string` };
    }
    skillRef = entry.skillRef;
  }

  return {
    spec: {
      id,
      title,
      target: target as VisualTarget,
      patterns: patterns as string[],
      modules: modules as string[],
      templates: templates as string[],
      style: style as VisualStyle,
      reason,
      contentPlan: contentPlan as string[],
      skillRef,
    },
  };
}

/** Load every `visual-routes.json` found under the scan roots. Never throws on bad manifests. */
export function loadVisualRouteRegistry(roots: string[] = skillRoots()): VisualRouteRegistry {
  const routes: RegisteredRouteSpec[] = [];
  const warnings: string[] = [];
  for (const root of roots) {
    let skillDirs: string[];
    try {
      skillDirs = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      continue;
    }
    for (const skillDir of skillDirs) {
      const file = join(root, skillDir, "visual-routes.json");
      let raw: string;
      try {
        raw = readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        warnings.push(`${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
      if (!isRecord(parsed) || !Array.isArray(parsed.routes)) {
        warnings.push(`${file}: expected a top-level object with a "routes" array`);
        continue;
      }
      parsed.routes.forEach((entry, index) => {
        const result = parseRouteEntry(entry, skillDir, file, index);
        if ("warning" in result) warnings.push(result.warning);
        else routes.push(result.spec);
      });
    }
  }
  return { routes, warnings };
}

/** First matching registered route wins (load order). Patterns are case-insensitive. */
export function matchRegisteredRoute(request: string, routes: readonly RegisteredRouteSpec[]): RegisteredRouteSpec | null {
  for (const route of routes) {
    if (route.patterns.some((pattern) => matchesPattern(request, pattern))) return route;
  }
  return null;
}
