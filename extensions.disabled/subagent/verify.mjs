#!/usr/bin/env node

/**
 * Verification script for subagent refactoring
 * Checks file structure, imports, and basic syntax
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const EXTENSION_DIR = __dirname;

const expectedFiles = [
  "index.ts",
  "agents.ts",
  "types.ts",
  "executor/runner.ts",
  "executor/parser.ts",
  "modes/base.ts",
  "modes/single.ts",
  "modes/parallel.ts",
  "modes/chain.ts",
  "ui/formatter.ts",
  "ui/renderer.ts",
  "utils/concurrency.ts",
  "utils/formatter.ts",
  "utils/tempfiles.ts",
  "README.md",
  "REFACTORING.md",
  "ARCHITECTURE.md",
  "tsconfig.json",
];

const expectedExports = {
  "types.ts": [
    "SingleResult",
    "SubagentDetails",
    "UsageStats",
    "DisplayItem",
    "SubagentParams",
    "OnUpdateCallback",
    "AgentRunnerOptions",
    "ProcessResult",
  ],
  "executor/parser.ts": ["parseEventLine", "accumulateUsage", "createInitialUsage"],
  "executor/runner.ts": ["runSingleAgent"],
  "modes/base.ts": ["ExecutionMode", "ExecutionContext", "ModeResult"],
  "modes/single.ts": ["SingleMode"],
  "modes/parallel.ts": ["ParallelMode"],
  "modes/chain.ts": ["ChainMode"],
  "utils/concurrency.ts": ["mapWithConcurrencyLimit"],
  "utils/formatter.ts": ["formatTokens", "formatUsageStats", "shortenPath", "getFinalOutput"],
  "utils/tempfiles.ts": ["writePromptToTempFile", "cleanupTempFiles"],
  "ui/formatter.ts": ["formatToolCall", "getDisplayItems", "aggregateUsage", "renderDisplayItems"],
  "ui/renderer.ts": ["renderCall", "renderResult"],
};

const importPatterns = {
  "executor/runner.ts": [
    "./parser",
    "../types",
    "../agents",
    "../utils/tempfiles",
  ],
  "modes/single.ts": ["../executor/runner", "../types", "../utils/formatter", "./base"],
  "modes/parallel.ts": ["../executor/runner", "../types", "../utils/concurrency", "../utils/formatter", "../executor/parser", "./base"],
  "modes/chain.ts": ["../executor/runner", "../types", "../utils/formatter", "./base"],
  "ui/renderer.ts": ["../types", "./formatter", "../utils/formatter"],
};

let passed = 0;
let failed = 0;

function log(message, status) {
  console.log(`${status} ${message}`);
  if (status === "✅") passed++;
  if (status === "❌") failed++;
}

console.log("\n🔍 Verifying Subagent Refactoring\n");
console.log("=".repeat(60));

// Check files exist
console.log("\n📁 Checking file structure...");
expectedFiles.forEach((file) => {
  const filePath = path.join(EXTENSION_DIR, file);
  if (fs.existsSync(filePath)) {
    log(`File exists: ${file}`, "✅");
  } else {
    log(`Missing file: ${file}`, "❌");
  }
});

// Check exports
console.log("\n📦 Checking exports...");
Object.entries(expectedExports).forEach(([file, exports]) => {
  const filePath = path.join(EXTENSION_DIR, file);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  exports.forEach((exp) => {
    // Match export with optional async keyword and more flexible spacing
    const pattern = new RegExp(`export\\s+(?:async\\s+)?(?:const|function|class|interface|type)\\s+${exp}\\b`);
    if (pattern.test(content)) {
      log(`${file} exports: ${exp}`, "✅");
    } else {
      log(`${file} missing export: ${exp}`, "❌");
    }
  });
});

// Check imports
console.log("\n🔗 Checking imports...");
Object.entries(importPatterns).forEach(([file, imports]) => {
  const filePath = path.join(EXTENSION_DIR, file);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  imports.forEach((imp) => {
    // Match both with and without .js extension
    const pattern = new RegExp(`from\\s+['"]${imp.replace("/", "\\/")}(\\.js)?['"]`);
    if (pattern.test(content)) {
      log(`${file} imports: ${imp}`, "✅");
    } else {
      log(`${file} missing import: ${imp}`, "❌");
    }
  });
});

// Check file sizes
console.log("\n📊 Checking file sizes...");
expectedFiles.filter(f => f.endsWith('.ts')).forEach((file) => {
  const filePath = path.join(EXTENSION_DIR, file);
  if (!fs.existsSync(filePath)) return;

  const stats = fs.statSync(filePath);
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").length;

  if (file === "index.ts") {
    if (lines < 300) {
      log(`${file}: ${lines} lines (< 300 target)`, "✅");
    } else {
      log(`${file}: ${lines} lines (> 300 target)`, "⚠️");
    }
  } else if (lines < 400) {
    log(`${file}: ${lines} lines`, "✅");
  } else {
    log(`${file}: ${lines} lines (large)`, "⚠️");
  }
});

// Check for circular dependencies
console.log("\n🔄 Checking for circular dependencies...");
const visited = new Set();
const visiting = new Set();

function checkCircular(filePath, stack) {
  if (!fs.existsSync(filePath)) return false;

  const relativePath = path.relative(EXTENSION_DIR, filePath);
  if (visiting.has(relativePath)) {
    log(`Circular dependency detected: ${stack.join(" → ")} → ${relativePath}`, "❌");
    return true;
  }

  if (visited.has(relativePath)) return false;

  visiting.add(relativePath);
  visited.add(relativePath);

  const content = fs.readFileSync(filePath, "utf-8");
  const importRegex = /from\s+['"](\.\.\/[^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolvedPath = path.resolve(path.dirname(filePath), importPath + ".ts");
    if (checkCircular(resolvedPath, [...stack, relativePath])) {
      return true;
    }
  }

  visiting.delete(relativePath);
  return false;
}

const hasCircular = checkCircular(path.join(EXTENSION_DIR, "index.ts"), []);
if (!hasCircular) {
  log("No circular dependencies detected", "✅");
}

// Summary
console.log("\n" + "=".repeat(60));
console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\n✅ All checks passed! Refactoring verified.\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} check(s) failed. Please review.\n`);
  process.exit(1);
}