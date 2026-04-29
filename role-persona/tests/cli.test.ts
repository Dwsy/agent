/**
 * CLI Integration Tests — tests all commands against real role data.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { cli } from "../src/transport/cli-runner.ts";

const CWD = process.cwd();
const TEST_ROLE = "test-cli-integration";

async function run(args: string[]) {
  return cli(args, { cwd: CWD, timeoutMs: 30000 });
}

describe("CLI", () => {
  describe("help", () => {
    test("--help returns JSON usage", async () => {
      const r = await run(["--help"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("commands");
    });
  });

  describe("init", () => {
    test("init detects mapped role", async () => {
      const r = await run(["init"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("role");
    });
  });

  describe("role", () => {
    test("role list returns array", async () => {
      const r = await run(["role", "list"]);
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
      expect((r.data as any[]).length).toBeGreaterThan(0);
    });

    test("role info returns role details", async () => {
      const r = await run(["role", "info"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("name");
      expect(r.data).toHaveProperty("path");
    });
  });

  describe("memory", () => {
    test("memory list returns structured data", async () => {
      const r = await run(["memory", "list"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("learnings");
      expect(r.data).toHaveProperty("preferences");
      expect(typeof (r.data as any).learnings).toBe("number");
    });

    test("memory search returns scored matches", async () => {
      const r = await run(["memory", "search", "memory"]);
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
      if ((r.data as any[]).length > 0) {
        const first = (r.data as any[])[0];
        expect(first).toHaveProperty("kind");
        expect(first).toHaveProperty("text");
        expect(first).toHaveProperty("score");
      }
    });

    test("memory add-learning stores and returns id", async () => {
      const r = await run(["memory", "add-learning", `test-${Date.now()}`]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("stored");
    });

    test("memory add-preference stores with category", async () => {
      const r = await run(["memory", "add-preference", `test-pref-${Date.now()}`, "--category", "Test"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("stored");
    });

    test("memory consolidate returns counts", async () => {
      const r = await run(["memory", "consolidate"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("beforeLearnings");
      expect(r.data).toHaveProperty("afterLearnings");
    });

    test("memory repair returns result", async () => {
      const r = await run(["memory", "repair"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("repaired");
    });

    test("memory conflicts returns array", async () => {
      const r = await run(["memory", "conflicts"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("conflicts");
      expect(Array.isArray((r.data as any).conflicts)).toBe(true);
    });

    test("memory log returns array", async () => {
      const r = await run(["memory", "log"]);
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    });
  });

  describe("knowledge", () => {
    test("knowledge list returns sources", async () => {
      const r = await run(["knowledge", "list"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("sources");
      expect(r.data).toHaveProperty("totalEntries");
    });

    test("knowledge search returns scored results", async () => {
      const r = await run(["knowledge", "search", "architecture"]);
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
      if ((r.data as any[]).length > 0) {
        const first = (r.data as any[])[0];
        expect(first).toHaveProperty("entry");
        expect(first).toHaveProperty("relevance");
      }
    });
  });

  describe("embedding", () => {
    test("embedding stats returns status", async () => {
      const r = await run(["embedding", "stats"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("enabled");
    });
  });

  describe("prompt", () => {
    test("prompt returns system prompt string", async () => {
      const r = await run(["prompt"]);
      expect(r.ok).toBe(true);
      expect(r.data).toHaveProperty("prompt");
      expect(typeof (r.data as any).prompt).toBe("string");
      expect((r.data as any).prompt.length).toBeGreaterThan(100);
    });
  });

  describe("error handling", () => {
    test("unknown command returns error", async () => {
      const r = await run(["nonexistent"]);
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    });

    test("missing args returns error", async () => {
      const r = await run(["role", "create"]);
      expect(r.ok).toBe(false);
    });
  });
});
