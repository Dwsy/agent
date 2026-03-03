import { describe, expect, test } from "bun:test";
import { RpcPool } from "../../rpc-pool.ts";

function createConfig(poolWaitTtlMs: number) {
  return {
    queue: {
      poolWaitTtlMs,
    },
    agent: {
      pool: {
        min: 0,
        max: 1,
      },
      timeoutMs: 2000,
      modelFailover: {
        primary: "model-a",
        fallbacks: [],
      },
    },
  } as any;
}

describe("rpc pool waiting-list ttl wiring", () => {
  test("uses queue.poolWaitTtlMs on enqueue", async () => {
    const pool = new RpcPool(createConfig(20));
    const waitingList = (pool as any).waitingList;

    let error: Error | null = null;
    try {
      await waitingList.enqueue("agent:main:test:1", 1);
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("queue timeout");
  });

  test("setConfig updates waiting-list ttl", async () => {
    const pool = new RpcPool(createConfig(1000));
    const waitingList = (pool as any).waitingList;

    pool.setConfig(createConfig(15));

    let error: Error | null = null;
    try {
      await waitingList.enqueue("agent:main:test:2", 1);
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("queue timeout");
  });
});
