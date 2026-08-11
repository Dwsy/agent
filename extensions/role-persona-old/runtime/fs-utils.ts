/** Pure filesystem/path helpers used by tools and commands. */
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const normalizePath = (path: string) => path.replace(/\/$/, "");

export function resolveRoleScopedPath(
  baseRolePath: string,
  relativePath: string,
): { ok: true; absolutePath: string; normalizedRelative: string } | { ok: false; error: string } {
  const requested = (relativePath || "").trim().replace(/^\/+/, "");
  if (!requested) {
    return { ok: false as const, error: "Path is required" };
  }

  const roleRoot = resolve(baseRolePath);
  const absolutePath = resolve(roleRoot, requested);
  const rel = relative(roleRoot, absolutePath);
  const relParts = rel.split(/[\\/]/).filter(Boolean);
  if (rel.startsWith("..") || relParts.includes("..")) {
    return { ok: false as const, error: "Path escapes role directory" };
  }

  return {
    ok: true as const,
    absolutePath,
    normalizedRelative: rel || ".",
  };
}

export function walkFiles(dir: string, recursive: boolean, maxEntries: number): string[] {
  const entries: string[] = [];

  const visit = (current: string) => {
    if (entries.length >= maxEntries) return;

    let children: string[] = [];
    try {
      children = readdirSync(current);
    } catch {
      return;
    }

    children.sort((a, b) => a.localeCompare(b));

    for (const child of children) {
      if (entries.length >= maxEntries) break;
      const full = join(current, child);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        if (recursive) visit(full);
        continue;
      }

      if (st.isFile()) entries.push(full);
    }
  };

  visit(dir);
  return entries;
}
