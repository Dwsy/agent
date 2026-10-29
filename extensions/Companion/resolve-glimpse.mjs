// ── Resolve glimpse package ────────────────────────────────────────────────
// Same strategy as generative-ui/resolve-glimpseui.ts (first hit wins):
//   1. GLIMPSEUI_PATH / GLIMPSE_PACKAGE env (package root or entry .mjs)
//   2. Local checkout ~/Dev/AI/glimpse (dev fork)
//   3. Global npm installs (npm root -g, Homebrew, nvm)
//   4. require.resolve("glimpseui") from this module

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

function entryFromPackageRoot(root) {
  const fallback = join(root, "src/glimpse.mjs");
  if (!existsSync(fallback)) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    let rel = "src/glimpse.mjs";
    if (typeof pkg.exports === "string") {
      rel = pkg.exports;
    } else if (pkg.exports && typeof pkg.exports === "object" && pkg.exports["."]) {
      const exp = pkg.exports["."];
      if (typeof exp === "string") rel = exp;
      else if (typeof exp === "object") rel = exp.import || exp.default || rel;
    } else if (pkg.main) {
      rel = pkg.main;
    }
    const full = join(root, rel);
    return existsSync(full) ? full : fallback;
  } catch {
    return fallback;
  }
}

function asEntry(candidate) {
  if (!existsSync(candidate)) return null;
  if (candidate.endsWith(".mjs") || candidate.endsWith(".js")) return candidate;
  return entryFromPackageRoot(candidate);
}

function globalModuleRoots() {
  const roots = [];
  try {
    const g = execSync("npm root -g", {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (g) roots.push(g);
  } catch {}
  try {
    const prefix = dirname(dirname(process.execPath));
    roots.push(join(prefix, "lib/node_modules"));
  } catch {}
  roots.push(
    "/opt/homebrew/lib/node_modules",
    "/usr/local/lib/node_modules",
    join(homedir(), ".npm-global/lib/node_modules"),
  );
  return [...new Set(roots.filter((r) => r && existsSync(r)))];
}

export function resolveGlimpseEntry() {
  const candidates = [];

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
    const entry = asEntry(c);
    if (entry) return entry;
  }

  // 4) node_modules lookup from this module
  try {
    const requireFrom = createRequire(import.meta.url);
    const pkgJson = requireFrom.resolve("glimpseui/package.json");
    return entryFromPackageRoot(dirname(pkgJson));
  } catch {
    return null;
  }
}

let cached = null;

/** Load the glimpse module (dynamic import of resolved entry). */
export async function loadGlimpse() {
  if (cached) return cached;
  const entry = resolveGlimpseEntry();
  if (!entry) {
    throw new Error(
      "Cannot resolve glimpse package. Set GLIMPSEUI_PATH to the glimpse checkout or install glimpseui globally."
    );
  }
  const mod = await import(pathToFileURL(entry).href);
  if (typeof mod.open !== "function" || typeof mod.getFollowCursorSupport !== "function") {
    throw new Error(`glimpse module at ${entry} is missing expected exports`);
  }
  cached = mod;
  return mod;
}
