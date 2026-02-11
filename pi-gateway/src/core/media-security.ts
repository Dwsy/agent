import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Validate a media path is safe to serve/send.
 * Returns true if path is allowed, false if blocked.
 */
export function validateMediaPath(pathRaw: string, workspaceRoot?: string): boolean {
  // Block empty/whitespace-only paths
  if (!pathRaw || !pathRaw.trim()) return false;

  // Block null bytes
  if (pathRaw.includes("\0")) return false;

  // Block URL schemes (file://, data:, etc.) — relative paths never contain ://
  if (pathRaw.includes("://")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathRaw)) return false;

  // Block absolute paths
  if (pathRaw.startsWith("/")) return false;

  // Block ~ (home directory)
  if (pathRaw.startsWith("~")) return false;

  // Block directory traversal
  if (pathRaw.includes("..")) return false;

  // If workspace root provided, resolve and verify containment
  if (workspaceRoot) {
    try {
      const resolved = resolve(workspaceRoot, pathRaw);
      // Symlink resolution — follow links to real path
      let realPath: string;
      let fileExists = false;
      try {
        realPath = realpathSync(resolved);
        fileExists = true;
      } catch {
        // File doesn't exist yet (e.g., agent will create it) — use resolved path
        realPath = resolved;
      }
      // Match root resolution strategy to file resolution strategy
      const realRoot = fileExists ? realpathSync(workspaceRoot) : resolve(workspaceRoot);
      if (!realPath.startsWith(realRoot + "/") && realPath !== realRoot) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}
