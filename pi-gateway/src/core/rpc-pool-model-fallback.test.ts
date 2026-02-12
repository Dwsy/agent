import { describe, test, expect } from "bun:test";
import { stripModelArgs } from "./rpc-pool.ts";

describe("stripModelArgs", () => {
  test("strips --provider and --model with values", () => {
    const args = ["--provider", "anthropic", "--model", "claude-sonnet-4-20250514", "--thinking", "high"];
    expect(stripModelArgs(args)).toEqual(["--thinking", "high"]);
  });

  test("strips only --provider when --model absent", () => {
    const args = ["--provider", "openai", "--skill", "/path/to/skill"];
    expect(stripModelArgs(args)).toEqual(["--skill", "/path/to/skill"]);
  });

  test("returns all args when no model flags present", () => {
    const args = ["--thinking", "high", "--extension", "/path/ext"];
    expect(stripModelArgs(args)).toEqual(["--thinking", "high", "--extension", "/path/ext"]);
  });

  test("handles empty args", () => {
    expect(stripModelArgs([])).toEqual([]);
  });

  test("handles --provider/--model at end of args", () => {
    const args = ["--skill", "foo", "--provider", "google", "--model", "gemini-2.5-pro"];
    expect(stripModelArgs(args)).toEqual(["--skill", "foo"]);
  });
});
