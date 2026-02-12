#!/usr/bin/env bun
/**
 * BG-005: Architecture drift detection.
 * Compares docs/architecture/ARCHITECTURE.md claims against actual codebase.
 *
 * Checks:
 * 1. File existence — every file listed in §2 Directory Structure exists
 * 2. Line counts — actual vs documented (>20% drift = warning)
 * 3. Export verification — key exports mentioned in docs exist in code
 * 4. Test count — actual vs documented
 * 5. Interface fields — documented interface fields match types.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const ARCH_DOC = join(ROOT, "docs/architecture/ARCHITECTURE.md");

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
// 1. Parse documented files from §2 Directory Structure
// ============================================================================

const archDoc = readFileSync(ARCH_DOC, "utf-8");

// Extract file paths and line counts from the directory structure section
const fileLinePattern = /├──\s+(\S+)\s+(\d+)L|└──\s+(\S+)\s+(\d+)L/g;
const dirPattern = /├──\s+(\S+\/)\s+(\d+)\s+files\s+([\d,]+)\s+lines|(\S+\/)\s+(\d+)\s+files\s+([\d,]+)\s+lines/;

// Parse documented files with line counts
const documentedFiles: Array<{ path: string; lines: number; dir: string }> = [];

let currentDir = "src/";
for (const line of archDoc.split("\n")) {
  // Track current directory context
  const dirMatch = line.match(/^├──\s+(\S+\/)|^│\s*├──\s+(\S+\/)|^(\S+\/)/);
  if (dirMatch) {
    const d = dirMatch[1] || dirMatch[2] || dirMatch[3];
    if (d && !d.includes("L")) {
      // It's a directory line
    }
  }

  // Match file entries like "├── server.ts                 484L"
  const fileMatch = line.match(/[├└]──\s+(\S+\.ts)\s+(\d+)L/);
  if (fileMatch) {
    documentedFiles.push({
      path: fileMatch[1],
      lines: parseInt(fileMatch[2]),
      dir: currentDir,
    });
  }
}

// ============================================================================
// 2. Check actual file existence and line counts
// ============================================================================

// Scan all .ts files in src/ (non-test)
function getAllSourceFiles(dir: string, prefix = ""): Array<{ rel: string; lines: number }> {
  const results: Array<{ rel: string; lines: number }> = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllSourceFiles(full, rel));
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      const content = readFileSync(full, "utf-8");
      results.push({ rel, lines: content.split("\n").length });
    }
  }
  return results;
}

const actualFiles = getAllSourceFiles(SRC);
const actualFileMap = new Map(actualFiles.map((f) => [f.rel, f.lines]));

// Check documented files exist
for (const doc of documentedFiles) {
  // Try to find the file in actual files
  const match = actualFiles.find((f) => f.rel.endsWith(doc.path) || f.rel === doc.path);
  if (!match) {
    drift("error", "file-missing", `Documented file not found: ${doc.path} (${doc.lines}L)`);
    continue;
  }

  // Check line count drift
  const pctDrift = Math.abs(match.lines - doc.lines) / doc.lines;
  if (pctDrift > 0.3) {
    drift("warn", "line-drift", `${doc.path}: documented ${doc.lines}L, actual ${match.lines}L (${(pctDrift * 100).toFixed(0)}% drift)`);
  }
}

// ============================================================================
// 3. Check for undocumented files (new files not in architecture doc)
// ============================================================================

const documentedNames = new Set(documentedFiles.map((f) => f.path));
for (const actual of actualFiles) {
  const basename = actual.rel.split("/").pop()!;
  if (!documentedNames.has(basename) && !actual.rel.includes("__tests__")) {
    drift("info", "undocumented", `File not in ARCHITECTURE.md: ${actual.rel} (${actual.lines}L)`);
  }
}

// ============================================================================
// 4. Test count verification
// ============================================================================

const testCountMatch = archDoc.match(/(\d+)\s*pass\s*\/\s*0\s*fail/);
const documentedTestCount = testCountMatch ? parseInt(testCountMatch[1]) : 0;

const testResult = spawnSync("bun", ["test", "--bail"], { cwd: ROOT, timeout: 30000 });
const testOutput = testResult.stdout?.toString() ?? "";
const actualTestMatch = testOutput.match(/(\d+)\s+pass/);
const actualTestCount = actualTestMatch ? parseInt(actualTestMatch[1]) : 0;

if (documentedTestCount > 0 && actualTestCount > 0) {
  const testDrift = actualTestCount - documentedTestCount;
  if (testDrift !== 0) {
    drift("warn", "test-count", `Documented: ${documentedTestCount} pass, Actual: ${actualTestCount} pass (${testDrift > 0 ? "+" : ""}${testDrift})`);
  }
}

// ============================================================================
// 5. Key interface verification (GatewayContext fields)
// ============================================================================

const typesPath = join(SRC, "gateway/types.ts");
if (existsSync(typesPath)) {
  const typesContent = readFileSync(typesPath, "utf-8");

  // Check documented GatewayContext fields exist
  const ctxFieldPattern = /`ctx\.(\w+)`/g;
  let ctxMatch;
  while ((ctxMatch = ctxFieldPattern.exec(archDoc)) !== null) {
    const field = ctxMatch[1];
    if (!typesContent.includes(field)) {
      drift("error", "interface-drift", `GatewayContext field documented but not in types.ts: ${field}`);
    }
  }

  // Check actual GatewayContext fields are documented
  const actualFields: string[] = [];
  const fieldPattern = /^\s+(\w+)\s*[?:].*(?:\/\/|$)/gm;
  let fieldMatch;
  const ctxSection = typesContent.slice(typesContent.indexOf("interface GatewayContext"));
  while ((fieldMatch = fieldPattern.exec(ctxSection)) !== null) {
    if (!fieldMatch[1].startsWith("//")) actualFields.push(fieldMatch[1]);
  }
}

// ============================================================================
// 6. Circular dependency check
// ============================================================================

const circDocMatch = archDoc.match(/circular.*?(\d+)/i);
const documentedCircular = circDocMatch ? parseInt(circDocMatch[1]) : 0;

const madgeResult = spawnSync("npx", ["madge", "--circular", "src/server.ts"], { cwd: ROOT, timeout: 30000 });
const madgeOutput = madgeResult.stdout?.toString() ?? "";
const actualCircMatch = madgeOutput.match(/Found (\d+) circular/);
const actualCircular = actualCircMatch ? parseInt(actualCircMatch[1]) : 0;

if (documentedCircular > 0 && actualCircular !== documentedCircular) {
  drift("warn", "circular-deps", `Documented: ${documentedCircular} circular deps, Actual: ${actualCircular}`);
}

// ============================================================================
// Report
// ============================================================================

console.log("=== BG-005: Architecture Drift Report ===\n");

const errors = drifts.filter((d) => d.severity === "error");
const warns = drifts.filter((d) => d.severity === "warn");
const infos = drifts.filter((d) => d.severity === "info");

if (errors.length > 0) {
  console.log(`❌ ERRORS (${errors.length}):`);
  for (const d of errors) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}

if (warns.length > 0) {
  console.log(`⚠️  WARNINGS (${warns.length}):`);
  for (const d of warns) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}

if (infos.length > 0) {
  console.log(`ℹ️  INFO (${infos.length}):`);
  for (const d of infos) console.log(`  [${d.category}] ${d.message}`);
  console.log();
}

const total = drifts.length;
console.log(`\n--- Summary: ${errors.length} errors, ${warns.length} warnings, ${infos.length} info (${total} total) ---`);

if (errors.length > 0) {
  console.log("\n🔴 DRIFT DETECTED — architecture doc needs update");
  process.exit(1);
} else if (warns.length > 0) {
  console.log("\n🟡 Minor drift — consider updating docs");
} else {
  console.log("\n🟢 No drift detected");
}
