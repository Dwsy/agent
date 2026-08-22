import { describe, expect, mock, test } from "bun:test";

// memory-tags.ts imports the pi-ai compat entrypoint, which only resolves
// inside pi's extension loader. Mock it for standalone bun test runs.
mock.module("@earendil-works/pi-ai/compat", () => ({
  completeSimple: async () => ({ stopReason: "end", content: [] }),
}));

const { calculateRetention, getAllTags } = await import("./memory-tags.ts");

describe("calculateRetention", () => {
  test("fresh memory retains ~100%", () => {
    expect(calculateRetention(0)).toBeCloseTo(1.0, 5);
  });

  test("retention decays monotonically with days", () => {
    const r1 = calculateRetention(1);
    const r30 = calculateRetention(30);
    const r365 = calculateRetention(365);
    expect(r1).toBeGreaterThan(r30);
    expect(r30).toBeGreaterThan(r365);
  });

  test("review count slows decay", () => {
    expect(calculateRetention(30, 5)).toBeGreaterThan(calculateRetention(30, 0));
  });

  test("never drops below the 10% floor and never returns NaN", () => {
    const r = calculateRetention(10000);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0.1);
  });
});

describe("getAllTags forgetting curve", () => {
  test("weights stay finite after decay (NaN regression)", () => {
    const registry = getAllTags({
      learnings: [
        {
          id: "abc123",
          text: "prefer guard clauses over nested ifs",
          used: 2,
          tags: ["code-style", "refactoring"],
          lastAccessed: "2020-01-01",
        },
      ],
      preferences: [],
    });

    expect(Object.keys(registry).sort()).toEqual(["code-style", "refactoring"]);
    for (const entry of Object.values(registry)) {
      expect(Number.isFinite(entry.weight)).toBe(true);
      expect(typeof entry.forgotten).toBe("boolean");
    }
    // 2020 is long past: retention should have decayed the weight below 0.3
    expect(registry["code-style"].forgotten).toBe(true);
  });
});
