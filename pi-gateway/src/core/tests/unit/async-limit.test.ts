import { describe, expect, test } from "bun:test";
import { forEachLimit } from "../../async-limit.ts";

describe("forEachLimit", () => {
  test("runs tasks up to the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const releaseQueue: Array<() => void> = [];

    const waitForRelease = () => new Promise<void>((resolve) => {
      releaseQueue.push(resolve);
    });

    const tasks = [1, 2, 3, 4];
    const runPromise = forEachLimit(tasks, 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await waitForRelease();
      active -= 1;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(maxActive).toBe(2);
    expect(releaseQueue).toHaveLength(2);

    while (releaseQueue.length > 0) {
      const release = releaseQueue.shift();
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    }

    await runPromise;
    expect(maxActive).toBe(2);
  });

  test("does nothing for an empty task list", async () => {
    let called = false;
    await forEachLimit([], 3, async () => {
      called = true;
    });
    expect(called).toBe(false);
  });
});
