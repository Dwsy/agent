#!/usr/bin/env bun
/**
 * BG-005: Architecture drift detection.
 * Compares docs/architecture/ARCHITECTURE.md against actual codebase.
 *
 * Checks:
 * 1. Documented files exist + line count drift (>50% = warning)
 * 2. Undocumented source files
 * 3. Directory-level file count + total lines
 * 4. GatewayContext interface fields
 * 5. Circular dependency count
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const ARCH_DOC = join(ROOT, "docs/architecture/ARCHITECTURE.md");
const LINE_DRIFT_THRESHOLD = 0.5;

interface DriftItem {
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
}

const drifts: DriftItem[] = [];
function drift(severity: DriftItem["severity"], category: string, message: string) {
  drifts.push({ severity, category, message });
}

// ============================================================================
// Parse §2 Directory Structure
// ============================================================================

const archDoc = readFileSync(ARCH_DOC, "utf-8");
const structureMatch = archDoc.match(/## 2\. Directory Structure\s*\n```\n([\s\S]*?)\n```/);

interface DocFile { relPath: string; lines: number }
interface DocDir { relPath: string; fileCount: number; totalLines: number }

const documentedFiles: DocFile[] = [];
const documentedDirs: DocDir[] = [];

if (!structureMatch) {
  drift("error", "parse", "Could not find §2 Directory Structure");
} else {
  const lines = structureMatch[1].split("\n");

  // Track directory context using a stack.
  // Depth is determined by counting "│   " or "    " prefixes (4 chars each).
  // The first line "src/" is the root — we skip it as prefix.
  const dirStack: { depth: number; path: string }[] = [];

  function currentDir(depth: number): string {
    // Pop entries at same or deeper depth
    while (dirStack.length > 0 && dirStack[dirStack.length - 1]!.depth >= depth) {
      dirStack.pop();
    }
    return dirStack.length > 0 ? dirStack[dirStack.length - 1]!.path : "";
  }

  for (const line of lines) {
    // Measure indent: count groups of "│   " or "    " (4 chars)
    let indent = 0;
    let pos = 0;
    while (pos + 3 < line.length) {
      const chunk = line.slice(pos, pos + 4);
      if (chunk === "│   " || chunk === "    ") {
        indent++;
        pos += 4;
      } else {
        break;
      }
    }

    // Strip tree drawing chars
    const rest = line.slice(pos).replace(/^[├└]──\s*/, "").trim();
    if (!rest || rest === "│") continue;

    // Directory with stats: "api/    9 files    1,303 lines   ..."
    const dirStatsMatch = rest.match(/^(\S+\/)\s+(\d+)\s+files?\s+([\d,]+)\s+lines?/);
    if (dirStatsMatch) {
      const dirName = dirStatsMatch[1];
      const parent = currentDir(indent);
      const relPath = parent + dirName;

      // Skip "src/" root — it's our scan base
      if (relPath !== "src/") {
        // Strip leading "src/" if present
        const clean = relPath.replace(/^src\//, "");
        dirStack.push({ depth: indent, path: relPath });
        documentedDirs.push({
          relPath: clean,
          fileCount: parseInt(dirStatsMatch[2]),
          totalLines: parseInt(dirStatsMatch[3].replace(/,/g, "")),
        });
      } else {
        dirStack.push({ depth: indent, path: relPath });
      }
      continue;
    }

    // Directory without stats: "plugins/builtin/" or "telegram/"
    const plainDirMatch = rest.match(/^(\S+\/)\s*(Channel implementations|$)/);
    if (plainDirMatch) {
      const dirName = plainDirMatch[1];
      const parent = currentDir(indent);
      const relPath = parent + dirName;
      dirStack.push({ depth: indent, path: relPath });
      continue;
    }

    // File with line count: "server.ts    484L    ..."
    const fileMatch = rest.match(/^(\S+\.ts)\s+(\d+)L/);
    if (fileMatch) {
      const parent = currentDir(indent);
      const relPath = (parent + fileMatch[1]).replace(/^src\//, "");
      documentedFiles.push({ relPath, lines: parseInt(fileMatch[2]) });
      continue;
    }
  }
}

// ============================================================================
// Scan actual source files
// ============================================================================

function scanDir(dir: string, prefix = ""): Array<{ rel: string; lines: number }> {
  const results: Array<{ rel: string; lines: number }> = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      results.push(...scanDir(full, rel));
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      results.push({ rel, lines: readFileSync(full, "utf-8").split("\n").length });
    }
  }
  return results;
}

const actualFiles = scanDir(SRC);
const actualFileMap = new Map(actualFiles.map((f) => [f.rel, f.lines]));

// ============================================================================
// Check 1: Documented files exist + line drift
// ============================================================================

for (const doc of documentedFiles) {
  const actual = actualFileMap.get(doc.relPath);
  if (actual === undefined) {
    drift("error", "file-missing", `Documented file not found: src/${doc.relPath} (${doc.lines}L)`);
    continue;
  }
  const pct = Math.abs(actual - doc.lines) / doc.lines;
  if (pct > LINE_DRIFT_THRESHOLD) {
    drift("warn", "line-drift", `src/${doc.relPath}: doc ${doc.lines}L → actual ${actual}L (${(pct * 100).toFixed(0)}%)`);
  }
}

// ============================================================================
// Check 2: Undocumented files
// ============================================================================

const docPathSet = new Set(documentedFiles.map((f) => f.relPath));
const docDirPrefixes = documentedDirs.map((d) => d.relPath);

for (const f of actualFiles) {
  if (docPathSet.has(f.rel)) continue;
  // Files under a documented dir are covered by dir-level checks
  if (docDirPrefixes.some((p) => f.rel.startsWith(p))) continue;
  drift("info", "undocumented", `src/${f.rel} (${f.lines}L)`);
}

// ============================================================================
// Check 3: Directory-level (file count + total lines)
// ============================================================================

for (const d of documentedDirs) {
  const dirPath = join(SRC, d.relPath);
  if (!existsSync(dirPath)) {
    drift("error", "dir-missing", `src/${d.relPath} not found`);
    continue;
  }
  // Only count files directly under this dir, excluding files under more-specific documented subdirs
  const subDirs = documentedDirs.filter((sd) => sd.relPath !== d.relPath && sd.relPath.startsWith(d.relPath));
  const dirFiles = actualFiles.filter((f) => {
    if (!f.rel.startsWith(d.relPath)) return false;
    // Exclude if file belongs to a more-specific documented subdir
    return !subDirs.some((sd) => f.rel.startsWith(sd.relPath));
  });
  const count = dirFiles.length;
  const total = dirFiles.reduce((s, f) => s + f.lines, 0);

  if (count !== d.fileCount) {
    drift("info", "dir-count", `src/${d.relPath}: doc ${d.fileCount} files, actual ${count}`);
  }
  const pct = Math.abs(total - d.totalLines) / d.totalLines;
  if (pct > LINE_DRIFT_THRESHOLD) {
    drift("warn", "dir-lines", `src/${d.relPath}: doc ${d.totalLines}L, actual ${total}L (${(pct * 100).toFixed(0)}%)`);
  }
}

// ============================================================================
// Check 4: GatewayContext fields
// ============================================================================

const gwTypesPath = join(SRC, "gateway/types.ts");
if (existsSync(gwTypesPath)) {
  const gwTypes = readFileSync(gwTypesPath, "utf-8");
  const ctxBlock = archDoc.match(/## 8\. GatewayContext[\s\S]*?```typescript\s*([\s\S]*?)```/);
  if (ctxBlock) {
    const fieldRe = /^\s+(\w+)\s*[?:]/gm;
    let m;
    while ((m = fieldRe.exec(ctxBlock[1])) !== null) {
      if (!gwTypes.includes(m[1])) {
        drift("warn", "ctx-field", `GatewayContext.${m[1]} documented but missing in types.ts`);
      }
    }
  }
}

// ============================================================================
// Check 5: Circular dependencies
// ============================================================================

const circMatch = archDoc.match(/Circular Dependencies \((\d+)\)/);
const docCircular = circMatch ? parseInt(circMatch[1]) : 0;

try {
  const r = spawnSync("npx", ["madge", "--circular", "src/server.ts"], {
    cwd: ROOT, timeout: 15000, stdio: ["pipe", "pipe", "pipe"],
  });
  const out = r.stdout?.toString() ?? "";
  const m = out.match(/Found (\d+) circular/);
  const actual = m ? parseInt(m[1]) : 0;
  if (actual > docCircular) {
    drift("warn", "circular", `Doc: ${docCircular}, Actual: ${actual} (new cycles)`);
  } else if (actual < docCircular) {
    drift("info", "circular", `Doc: ${docCircular}, Actual: ${actual} (cycles fixed)`);
  }
} catch {
  drift("info", "circular", "madge unavailable, skipped");
}

// ============================================================================
// Report
// ============================================================================

console.log("=== BG-005: Architecture Drift Report ===\n");

const errors = drifts.filter((d) => d.severity === "error");
const warns = drifts.filter((d) => d.severity === "warn");
const infos = drifts.filter((d) => d.severity === "info");

if (errors.length) {
  console.log(`❌ ERRORS (${errors.length}):`);
  for (const d of errors) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}
if (warns.length) {
  console.log(`⚠️  WARNINGS (${warns.length}):`);
  for (const d of warns) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}
if (infos.length) {
  console.log(`ℹ️  INFO (${infos.length}):`);
  for (const d of infos) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}

console.log(`--- Summary: ${errors.length} errors, ${warns.length} warnings, ${infos.length} info ---`);

if (errors.length) {
  console.log("\n🔴 DRIFT DETECTED — update ARCHITECTURE.md");
  process.exit(1);
} else if (warns.length) {
  console.log("\n🟡 Minor drift — consider updating docs");
} else {
  console.log("\n🟢 No drift detected");
}
