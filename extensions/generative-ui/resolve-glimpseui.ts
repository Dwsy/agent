// ── Resolve glimpseui package ─────────────────────────────────────────────
// Priority (first hit wins):
//   1. GLIMPSEUI_PATH / GLIMPSE_PACKAGE env (package root or entry .mjs)
//   2. Local checkout ~/Dev/AI/glimpse (dev fork)
//   3. Global npm installs (npm root -g, Homebrew, nvm)
//   4. Extension-local node_modules ("glimpseui")
//
// "优先使用" local/global install so generative-ui picks up the Dock / control
// socket fork instead of a stale registry copy in node_modules.

import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

export type GlimpseuiModule = {
  open: (html: string, options?: Record<string, unknown>) => unknown;
  prompt?: (...args: unknown[]) => unknown;
  statusItem?: (...args: unknown[]) => unknown;
  getNativeHostInfo?: () => unknown;
  [key: string]: unknown;
};

function tryRealpath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : p;
  } catch {
    return p;
  }
}

/** Resolve package main entry path from a package root directory. */
function entryFromPackageRoot(root: string): string | null {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name?: string;
      main?: string;
      exports?: string | { "."?: string | { import?: string; default?: string; require?: string } };
    };
    if (pkg.name && pkg.name !== "glimpseui" && !pkg.name.includes("glimpse")) {
      // Allow forks still named glimpseui; skip unrelated packages.
    }
    let rel = "src/glimpse.mjs";
    if (typeof pkg.exports === "string") {
      rel = pkg.exports;
    } else if (pkg.exports && typeof pkg.exports === "object") {
      const exp = pkg.exports["."];
      if (typeof exp === "string") rel = exp;
      else if (exp && typeof exp === "object") {
        rel = exp.import || exp.default || exp.require || rel;
      }
    } else if (pkg.main) {
      rel = pkg.main;
    }
    const full = join(root, rel);
    if (existsSync(full)) return full;
    // common fallback for this project
    const fallback = join(root, "src/glimpse.mjs");
    return existsSync(fallback) ? fallback : null;
  } catch {
    return null;
  }
}

function asPackageRootOrEntry(candidate: string): string | null {
  const path = tryRealpath(candidate);
  if (!existsSync(path)) return null;
  // Direct entry file
  if (path.endsWith(".mjs") || path.endsWith(".js")) return path;
  // Package root
  const entry = entryFromPackageRoot(path);
  if (entry) return entry;
  // node_modules/glimpseui style already handled by root
  return null;
}

function globalModuleRoots(): string[] {
  const roots: string[] = [];

  try {
    const g = execSync("npm root -g", {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (g) roots.push(g);
  } catch {
    // ignore
  }

  // Active Node prefix (nvm / fnm / homebrew)
  try {
    const exec = process.execPath; // .../bin/node
    const prefix = dirname(dirname(exec));
    roots.push(join(prefix, "lib/node_modules"));
  } catch {
    // ignore
  }

  roots.push(
    "/opt/homebrew/lib/node_modules",
    "/usr/local/lib/node_modules",
    join(homedir(), ".npm-global/lib/node_modules"),
  );

  return [...new Set(roots.filter((r) => r && existsSync(r)))];
}

/**
 * Return absolute path to glimpseui entry module (.mjs), or null.
 */
export function resolveGlimpseuiEntry(): string | null {
  const candidates: string[] = [];

  // 1) Explicit env
  for (const key of ["GLIMPSEUI_PATH", "GLIMPSE_PACKAGE", "GLIMPSEUI_PACKAGE"]) {
    const v = process.env[key];
    if (v) candidates.push(isAbsolute(v) ? v : join(process.cwd(), v));
  }

  // 2) Local checkout (preferred dev fork)
  candidates.push(join(homedir(), "Dev/AI/glimpse"));
  candidates.push(join(homedir(), "Dev/glimpse"));

  // 3) Global installs
  for (const root of globalModuleRoots()) {
    candidates.push(join(root, "glimpseui"));
  }

  for (const c of candidates) {
    const entry = asPackageRootOrEntry(c);
    if (entry) return entry;
  }

  // 4) Extension / cwd node_modules
  const requireFrom = (() => {
    try {
      return createRequire(import.meta.url);
    } catch {
      return createRequire(join(process.cwd(), "package.json"));
    }
  })();

  try {
    // package.json first → package root → entry
    const pkgJson = requireFrom.resolve("glimpseui/package.json");
    const entry = entryFromPackageRoot(dirname(pkgJson));
    if (entry) return entry;
  } catch {
    // ignore
  }

  try {
    return requireFrom.resolve("glimpseui");
  } catch {
    return null;
  }
}

let cached: GlimpseuiModule | null = null;
let cachedFrom: string | null = null;

/**
 * Load glimpseui once. Prefer local/global path; fall back to package name import.
 */
export async function loadGlimpseui(): Promise<GlimpseuiModule> {
  if (cached) return cached;

  const entry = resolveGlimpseuiEntry();
  let mod: GlimpseuiModule;

  if (entry) {
    const href = pathToFileURL(entry).href;
    mod = (await import(href)) as GlimpseuiModule;
    cachedFrom = entry;
  } else {
    mod = (await import("glimpseui")) as GlimpseuiModule;
    cachedFrom = "glimpseui";
  }

  if (typeof mod.open !== "function") {
    throw new Error(`glimpseui module missing open() (from ${cachedFrom})`);
  }

  cached = mod;
  return mod;
}

/** Sync accessor after preload; throws if not yet loaded. */
export function getGlimpseui(): GlimpseuiModule {
  if (!cached) {
    throw new Error("glimpseui not preloaded — call await loadGlimpseui() first");
  }
  return cached;
}

export function getGlimpseuiSource(): string | null {
  return cachedFrom;
}

/**
 * Preload at extension startup. Safe to call multiple times.
 * Logs which copy is used (stderr) once.
 */
export async function preloadGlimpseui(): Promise<GlimpseuiModule> {
  const mod = await loadGlimpseui();
  if (process.env.GLIMPSEUI_DEBUG === "1" || process.env.DEBUG?.includes("glimpse")) {
    console.error(`[generative-ui] glimpseui from: ${cachedFrom}`);
  }
  return mod;
}

// Optional: expose package root for host binary resolution diagnostics
export function resolveGlimpseuiPackageRoot(): string | null {
  const entry = resolveGlimpseuiEntry();
  if (!entry) return null;
  // walk up until package.json
  let dir = dirname(entry);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(entry);
}

