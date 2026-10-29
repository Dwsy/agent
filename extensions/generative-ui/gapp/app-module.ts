import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * Hot-reloadable loader for app-owned ESM files (tools.mjs, tui.mjs).
 *
 * Bun keys its module cache by resolved path and ignores URL query strings, so
 * `import(`${url}?mtime=…`)` keeps returning the first-loaded copy for the life
 * of the daemon — edits to an app's tools.mjs silently never took effect. Node
 * honours the query. This loader therefore memoizes by mtime and re-executes
 * through `require` + `require.cache` invalidation on Bun, and through a
 * generation-stamped URL elsewhere. `invalidateAppModule` forces the next load
 * to re-execute even when the mtime is unchanged.
 */

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
const requireFromHere = createRequire(import.meta.url);

interface ModuleEntry {
  /** Last observed mtime; -1 = never loaded. */
  mtimeMs: number;
  /** Bumped by invalidation/force so the next URL is distinct under Node. */
  generation: number;
  module?: unknown;
}

const entries = new Map<string, ModuleEntry>();

function entryOf(file: string): ModuleEntry {
  let entry = entries.get(file);
  if (!entry) {
    entry = { mtimeMs: -1, generation: 0 };
    entries.set(file, entry);
  }
  return entry;
}

function requireCache(): Record<string, unknown> {
  return (requireFromHere as unknown as { cache: Record<string, unknown> }).cache;
}

function dropFromRequireCache(file: string): void {
  if (!isBun) return;
  const cache = requireCache();
  try {
    delete cache[requireFromHere.resolve(file)];
  } catch {
    // unresolvable: fall through to the raw key below
  }
  delete cache[file];
}

/**
 * Drop the cached module so the next load re-executes the file, even if its
 * mtime did not change.
 */
export function invalidateAppModule(file: string): void {
  const entry = entries.get(file);
  if (entry) {
    entry.module = undefined;
    entry.generation += 1;
  }
  dropFromRequireCache(file);
}

/**
 * Load an app-owned module, re-executing it after the file changes (mtime) or
 * after invalidateAppModule. Missing file → ENOENT; other load errors surface
 * unchanged so a broken module is never memoized as healthy.
 */
export async function loadAppModule(
  file: string,
  options?: { force?: boolean },
): Promise<unknown> {
  const info = await stat(file);
  const entry = entryOf(file);
  if (entry.module !== undefined && !options?.force && entry.mtimeMs === info.mtimeMs) {
    return entry.module;
  }
  if (options?.force) entry.generation += 1;
  const module = isBun
    ? loadViaRequire(file)
    : await import(`${pathToFileURL(file).href}?mtime=${info.mtimeMs}&gen=${entry.generation}`);
  entry.module = module;
  entry.mtimeMs = info.mtimeMs;
  return module;
}

function loadViaRequire(file: string): unknown {
  // Bun re-executes the file once its cache entry is gone; without the delete
  // the stale first load would come back forever.
  dropFromRequireCache(file);
  let resolved = file;
  try {
    resolved = requireFromHere.resolve(file);
  } catch {
    // keep the raw absolute path
  }
  return requireFromHere(resolved);
}
