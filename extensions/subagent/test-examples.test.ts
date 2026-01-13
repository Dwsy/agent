/**
 * Test examples for subagent modules
 *
 * This file demonstrates how to test each module independently
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { spawn } from "node:child_process";
import type { Message } from "@mariozechner/pi-ai";

// ============================================================================
// TEST: executor/parser.ts
// ============================================================================

import { parseEventLine, accumulateUsage, createInitialUsage } from "../executor/parser.js";

describe("JSON Event Parser", () => {
  it("parses message_end events", () => {
    const line = JSON.stringify({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "test" }] },
    });
    const event = parseEventLine(line);
    expect(event?.type).toBe("message_end");
    expect(event?.message?.role).toBe("assistant");
  });

  it("returns null for invalid JSON", () => {
    const event = parseEventLine("invalid json");
    expect(event).toBeNull();
  });

  it("returns null for empty lines", () => {
    const event = parseEventLine("  ");
    expect(event).toBeNull();
  });

  it("accumulates usage statistics", () => {
    const usage = createInitialUsage();
    accumulateUsage(usage, {
      usage: {
        input: 100,
        output: 50,
        cacheRead: 20,
        cacheWrite: 10,
        cost: { total: 0.001 },
        totalTokens: 150,
      },
    });
    expect(usage.input).toBe(100);
    expect(usage.output).toBe(50);
    expect(usage.cost).toBe(0.001);
  });

  it("handles missing usage fields", () => {
    const usage = createInitialUsage();
    accumulateUsage(usage, { usage: {} });
    expect(usage.input).toBe(0);
    expect(usage.cost).toBe(0);
  });
});

// ============================================================================
// TEST: utils/formatter.ts
// ============================================================================

import { formatTokens, formatUsageStats, shortenPath, getFinalOutput } from "../utils/formatter.js";

describe("Formatter Utilities", () => {
  it("formats small token counts", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands as k", () => {
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(10000)).toBe("10k");
  });

  it("formats millions as M", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });

  it("shortens home directory paths", () => {
    const home = require("node:os").homedir();
    expect(shortenPath(`${home}/project/file.ts`)).toBe("~/project/file.ts");
    expect(shortenPath("/var/log/app.log")).toBe("/var/log/app.log");
  });

  it("extracts final output from messages", () => {
    const messages: Message[] = [
      { role: "assistant", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "second" }] },
    ];
    expect(getFinalOutput(messages)).toBe("second");
  });

  it("returns empty string if no assistant messages", () => {
    const messages: Message[] = [{ role: "user", content: [{ type: "text", text: "test" }] }];
    expect(getFinalOutput(messages)).toBe("");
  });

  it("formats usage stats with model", () => {
    const stats = formatUsageStats(
      { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cost: 0.002, turns: 2 },
      "gpt-4",
    );
    expect(stats).toContain("2 turns");
    expect(stats).toContain("↑1.0k");
    expect(stats).toContain("↓500");
    expect(stats).toContain("$0.0020");
    expect(stats).toContain("gpt-4");
  });
});

// ============================================================================
// TEST: utils/concurrency.ts
// ============================================================================

import { mapWithConcurrencyLimit } from "../utils/concurrency.js";

describe("Concurrency Control", () => {
  it("processes items with concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrencyLimit(items, 2, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("handles empty arrays", async () => {
    const results = await mapWithConcurrencyLimit([], 2, async (item) => item);
    expect(results).toEqual([]);
  });

  it("maintains order despite async execution", async () => {
    const items = [100, 10, 50];
    const results = await mapWithConcurrencyLimit(items, 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 10 + item));
      return item;
    });
    expect(results).toEqual([100, 10, 50]);
  });
});

// ============================================================================
// TEST: utils/tempfiles.ts
// ============================================================================

import { writePromptToTempFile, cleanupTempFiles } from "../utils/tempfiles.js";
import * as fs from "node:fs";

describe("Temporary File Management", () => {
  it("writes prompt to temp file", () => {
    const result = writePromptToTempFile("test-agent", "Test prompt content");
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, "utf-8")).toBe("Test prompt content");
    cleanupTempFiles(result.filePath, result.dir);
  });

  it("sanitizes agent names", () => {
    const result = writePromptToTempFile("test/agent:123", "content");
    expect(result.filePath).toContain("prompt-test_agent_123.md");
    cleanupTempFiles(result.filePath, result.dir);
  });

  it("cleans up files safely", () => {
    const result = writePromptToTempFile("test", "content");
    cleanupTempFiles(result.filePath, result.dir);
    expect(fs.existsSync(result.filePath)).toBe(false);
  });

  it("handles cleanup of non-existent files", () => {
    expect(() => cleanupTempFiles("/nonexistent/file", "/nonexistent/dir")).not.toThrow();
  });
});

// ============================================================================
// TEST: ui/formatter.ts
// ============================================================================

import { formatToolCall, getDisplayItems, aggregateUsage } from "../ui/formatter.js";

describe("UI Formatter", () => {
  const mockThemeFg = (color: string, text: string) => `[${color}:${text}]`;

  it("formats bash tool calls", () => {
    const result = formatToolCall("bash", { command: "ls -la" }, mockThemeFg);
    expect(result).toContain("bash");
    expect(result).toContain("ls -la");
  });

  it("truncates long bash commands", () => {
    const longCmd = "a".repeat(100);
    const result = formatToolCall("bash", { command: longCmd }, mockThemeFg);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(100);
  });

  it("formats read tool calls with line ranges", () => {
    const result = formatToolCall("read", { path: "file.ts", offset: 10, limit: 20 }, mockThemeFg);
    expect(result).toContain("10-29");
  });

  it("extracts display items from messages", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "toolCall", name: "bash", arguments: { command: "echo" } },
        ],
      },
    ];
    const items = getDisplayItems(messages);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("text");
    expect(items[1].type).toBe("toolCall");
  });

  it("aggregates usage across results", () => {
    const results = [
      { usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.001, turns: 1 } },
      { usage: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.002, turns: 2 } },
    ] as any;
    const total = aggregateUsage(results);
    expect(total.input).toBe(300);
    expect(total.output).toBe(150);
    expect(total.cost).toBe(0.003);
    expect(total.turns).toBe(3);
  });
});

// ============================================================================
// TEST: modes/single.ts (Integration test example)
// ============================================================================

import { SingleMode } from "../modes/single.js";

describe("Single Mode Integration", () => {
  let mode: SingleMode;
  let mockContext: any;

  beforeEach(() => {
    mode = new SingleMode();
    mockContext = {
      defaultCwd: "/test",
      agents: [
        {
          name: "test-agent",
          description: "Test agent",
          systemPrompt: "You are helpful",
          source: "user",
          filePath: "/test.md",
        },
      ],
      signal: undefined,
      onUpdate: undefined,
    };
  });

  it("executes single agent task", async () => {
    // This would require mocking spawn in real tests
    // For demonstration, we show the structure
    const params = { agent: "test-agent", task: "Test task" };
    // const result = await mode.execute(mockContext, params);
    // expect(result.details.mode).toBe("single");
    // expect(result.details.results).toHaveLength(1);
  });
});

// ============================================================================
// MOCK HELPERS
// ============================================================================

export class MockProcess {
  static create(exitCode: number, stdout: string[], stderr: string = "") {
    const proc = {
      stdout: {
        on: (event: string, handler: (data: Buffer) => void) => {
          if (event === "data") {
            stdout.forEach((line) => handler(Buffer.from(line + "\n")));
          }
        },
      },
      stderr: {
        on: (event: string, handler: (data: Buffer) => void) => {
          if (event === "data" && stderr) {
            handler(Buffer.from(stderr));
          }
        },
      },
      on: (event: string, handler: (code: number) => void) => {
        if (event === "close") {
          setTimeout(() => handler(exitCode), 10);
        }
      },
      kill: vi.fn(),
      killed: false,
    } as any;
    return proc;
  }

  static mockSpawn(proc: any) {
    vi.spyOn(require("node:child_process"), "spawn").mockReturnValue(proc);
  }

  static restoreSpawn() {
    vi.restoreAllMocks();
  }
}

// Example usage of MockProcess:
/*
describe("Agent Runner with Mocks", () => {
  beforeEach(() => {
    const mockProc = MockProcess.create(0, [
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "test" }] } })
    ]);
    MockProcess.mockSpawn(mockProc);
  });

  afterEach(() => {
    MockProcess.restoreSpawn();
  });

  it("runs agent successfully", async () => {
    // test code here
  });
});
*/