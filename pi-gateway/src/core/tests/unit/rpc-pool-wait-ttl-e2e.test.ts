import { describe, expect, test } from "bun:test";
import { RpcPool } from "../../rpc-pool.ts";

function createConfig(poolWaitTtlMs: number) {
  return {
    queue: {
      poolWaitTtlMs,
    },
    session: {
      dmScope: "main",
      dataDir: "/tmp/pi-gateway-test-sessions",
      continueOnRestart: false,
    },
    agent: {
      pool: {
        min: 0,
        max: 1,
      },
    },
  } as any;
}

function createProfile(signature: string) {
  return {
    cwd: process.cwd(),
    signature,
    hardSignature: signature,
    softResources: {
      skills: [],
      extensions: [],
      promptTemplates: [],
    },
    args: [],
    env: {},
  } as any;
}

function createPoolAtCapacity(poolWaitTtlMs: number): RpcPool {
  const pool = new RpcPool(createConfig(poolWaitTtlMs));
  const clients = (pool as any).clients as Map<string, any>;

  clients.set("rpc-busy-1", {
    id: "rpc-busy-1",
    isIdle: false,
    isAlive: true,
    lastActivity: Date.now(),
    sessionKey: "agent:main:test:occupied",
  });

  return pool;
}

describe("rpc pool waiting-list ttl e2e", () => {
  test("queue timeout follows configured poolWaitTtlMs under real acquire pressure", async () => {
    const pool = createPoolAtCapacity(25);

    const waitingPromise = pool.acquire("agent:main:test:e2e:wait-1", createProfile("sig-wait-1"), 1);

    let error: Error | null = null;
    try {
      await waitingPromise;
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("queue timeout");
  });

  test("setConfig updates waiting-list ttl for subsequent queued acquire", async () => {
    const pool = createPoolAtCapacity(1000);

    pool.setConfig(createConfig(15));

    const waitingPromise = pool.acquire("agent:main:test:e2e:wait-2", createProfile("sig-wait-2"), 1);

    let error: Error | null = null;
    try {
      await waitingPromise;
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("queue timeout");
  });
});
