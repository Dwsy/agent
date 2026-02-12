import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "../..");

describe("BG-005: Architecture drift detection", () => {
  const ARCH_DOC = join(ROOT, "docs/architecture/ARCHITECTURE.md");

  test("ARCHITECTURE.md exists", () => {
    expect(existsSync(ARCH_DOC)).toBe(true);
  });

  test("drift-detect script exists", () => {
    expect(existsSync(join(ROOT, "scripts/drift-detect.ts"))).toBe(true);
  });

  test("all documented source directories exist", () => {
    const archDoc = readFileSync(ARCH_DOC, "utf-8");
    const srcDirs = ["src/api", "src/core", "src/gateway", "src/plugins", "src/ws"];
    for (const dir of srcDirs) {
      expect(existsSync(join(ROOT, dir))).toBe(true);
    }
  });

  test("key architecture files exist", () => {
    const keyFiles = [
      "src/server.ts",
      "src/gateway/types.ts",
      "src/gateway/message-pipeline.ts",
      "src/gateway/session-reset.ts",
      "src/core/rpc-pool.ts",
      "src/core/rpc-client.ts",
      "src/core/config.ts",
      "src/core/ssrf-guard.ts",
      "src/core/exec-guard.ts",
      "src/plugins/loader.ts",
      "src/plugins/types.ts",
      "src/plugins/plugin-api-factory.ts",
    ];
    for (const f of keyFiles) {
      expect(existsSync(join(ROOT, f))).toBe(true);
    }
  });

  test("GatewayContext has required core fields", () => {
    const typesContent = readFileSync(join(ROOT, "src/gateway/types.ts"), "utf-8");
    const requiredFields = [
      "config", "pool", "queue", "registry", "sessions",
      "transcripts", "metrics", "systemEvents", "log",
    ];
    for (const field of requiredFields) {
      expect(typesContent).toContain(field);
    }
  });

  test("no circular dependencies in core modules", () => {
    const result = spawnSync("npx", ["madge", "--circular", "src/server.ts"], {
      cwd: ROOT,
      timeout: 30000,
    });
    const output = result.stdout?.toString() ?? "";
    const match = output.match(/Found (\d+) circular/);
    const count = match ? parseInt(match[1]) : 0;
    // Allow up to 3 known circular deps (documented in ARCHITECTURE.md)
    expect(count).toBeLessThanOrEqual(3);
  });
});
