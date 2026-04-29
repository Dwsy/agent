/**
 * Core Layer Tests — types, config, memory extraction rules.
 */

import { describe, test, expect } from "bun:test";
import { ok, err } from "../src/core/types.ts";

describe("Core Types", () => {
  test("ok() creates success result", () => {
    const r = ok("hello", { count: 5 });
    expect(r.content[0].text).toBe("hello");
    expect(r.details?.count).toBe(5);
    expect(r.isError).toBeUndefined();
  });

  test("err() creates error result", () => {
    const r = err("failed");
    expect(r.content[0].text).toBe("failed");
    expect(r.isError).toBe(true);
  });
});

describe("Memory Extraction Rules", () => {
  test("filters ephemeral task observations", async () => {
    const { isEphemeralTaskObservation } = await import("../src/core/memory-extraction-rules.ts");
    expect(isEphemeralTaskObservation("已修复登录页面的样式问题")).toBe(true);
    expect(isEphemeralTaskObservation("Clean Architecture separates concerns into layers")).toBe(false);
  });

  test("filters derivable memory candidates", async () => {
    const { isDerivableMemoryCandidate } = await import("../src/core/memory-extraction-rules.ts");
    expect(isDerivableMemoryCandidate("config.ts 中的 export function")).toBe(true);
    expect(isDerivableMemoryCandidate("Use dependency injection for loose coupling")).toBe(false);
  });

  test("filters auto-extracted learnings", async () => {
    const { filterAutoExtractedLearnings } = await import("../src/core/memory-extraction-rules.ts");
    const filtered = filterAutoExtractedLearnings([
      "config.ts 的 export default 在第 42 行",
      "Use dependency injection for loose coupling",
    ]);
    expect(filtered).not.toContain("config.ts 的 export default 在第 42 行");
    expect(filtered).toContain("Use dependency injection for loose coupling");
  });
});

describe("Config", () => {
  test("loadConfig returns valid config object", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const config = loadConfig();
    expect(config).toBeTruthy();
    expect(config.autoMemory).toBeTruthy();
    expect(config.memory).toBeTruthy();
    expect(config.logging).toBeTruthy();
  });
});
