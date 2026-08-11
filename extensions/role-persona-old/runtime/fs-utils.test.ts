import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizePath, resolveRoleScopedPath, walkFiles } from "./fs-utils.ts";

describe("normalizePath", () => {
  test("strips a single trailing slash", () => {
    expect(normalizePath("/a/b/")).toBe("/a/b");
    expect(normalizePath("/a/b")).toBe("/a/b");
  });
});

describe("resolveRoleScopedPath", () => {
  const base = "/roles/zero";

  test("rejects empty path", () => {
    const result = resolveRoleScopedPath(base, "");
    expect(result.ok).toBe(false);
  });

  test("rejects escaping the role directory", () => {
    for (const p of ["..", "../x", "a/../../x", "../../etc/passwd"]) {
      const result = resolveRoleScopedPath(base, p);
      expect(result.ok).toBe(false);
    }
  });

  test("resolves normal relative paths", () => {
    const result = resolveRoleScopedPath(base, "memory/consolidated.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("/roles/zero/memory/consolidated.md");
      expect(result.normalizedRelative).toBe("memory/consolidated.md");
    }
  });

  test("strips leading slashes instead of treating them as absolute", () => {
    const result = resolveRoleScopedPath(base, "/core/identity.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe("/roles/zero/core/identity.md");
    }
  });

  test("normalizes inner traversal that stays inside the role dir", () => {
    const result = resolveRoleScopedPath(base, "memory/../core/soul.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedRelative).toBe("core/soul.md");
    }
  });
});

describe("walkFiles", () => {
  function makeTree(): string {
    const dir = mkdtempSync(join(tmpdir(), "walk-files-"));
    writeFileSync(join(dir, "a.md"), "a");
    writeFileSync(join(dir, "b.md"), "b");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "c.md"), "c");
    return dir;
  }

  test("non-recursive skips subdirectories", () => {
    const dir = makeTree();
    const files = walkFiles(dir, false, 100);
    expect(files.map((f) => f.split("/").pop())).toEqual(["a.md", "b.md"]);
  });

  test("recursive includes subdirectory files", () => {
    const dir = makeTree();
    const files = walkFiles(dir, true, 100);
    expect(files.map((f) => f.split("/").pop()).sort()).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("respects maxEntries cap", () => {
    const dir = makeTree();
    const files = walkFiles(dir, true, 2);
    expect(files.length).toBe(2);
  });

  test("returns empty for missing directory", () => {
    expect(walkFiles("/nonexistent-dir-xyz", true, 10)).toEqual([]);
  });
});
