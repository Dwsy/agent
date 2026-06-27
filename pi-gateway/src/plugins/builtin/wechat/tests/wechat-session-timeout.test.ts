import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startWechatGateway } from "../gateway.ts";
import { resetSessionState } from "../session.ts";
import type { WechatAccountRuntime } from "../types.ts";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalPiStateDir = process.env.PI_STATE_DIR;

function createRuntime(): WechatAccountRuntime {
  return {
    api: {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    } as any,
    channelCfg: {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: [],
      textChunkLimit: 4000,
      streaming: { enabled: false },
    },
    accountId: "wx-bot",
    token: "expired-token",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    disposed: false,
    contextTokens: new Map(),
    dedup: new Map(),
    streamPlaceholders: new Map(),
    syncBuf: "",
    syncBufPath: "",
    pollTimer: null,
    reconnectTimer: null,
    dmPolicy: "pairing",
    allowFrom: [],
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  resetSessionState("wx-bot");
  if (originalPiStateDir === undefined) {
    delete process.env.PI_STATE_DIR;
  } else {
    process.env.PI_STATE_DIR = originalPiStateDir;
  }
});

describe("wechat session timeout handling", () => {
  test("startWechatGateway returns before the first long poll resolves", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-session-"));
    process.env.PI_STATE_DIR = stateDir;

    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = ((() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as unknown) as typeof fetch;

    const runtime = createRuntime();
    let resolved = false;
    const startPromise = startWechatGateway(runtime, async () => {}).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(true);

    runtime.disposed = true;
    resolveFetch(new Response(JSON.stringify({ msgs: [], get_updates_buf: "next" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await startPromise;
  });

  test("stopWechatGateway prevents an in-flight poll from scheduling the next timer", async () => {
    const { stopWechatGateway } = await import("../gateway.ts");
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-session-stop-"));
    process.env.PI_STATE_DIR = stateDir;

    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = ((() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as unknown) as typeof fetch;

    const scheduledDelays: number[] = [];
    globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number) => {
      if (Number(ms ?? 0) !== 70_000) scheduledDelays.push(Number(ms ?? 0));
      return { fn, ms } as any;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

    const runtime = createRuntime();
    await startWechatGateway(runtime, async () => {});
    await Promise.resolve();
    await stopWechatGateway(runtime);

    resolveFetch(new Response(JSON.stringify({ msgs: [], get_updates_buf: "next" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(scheduledDelays).toEqual([]);
  });

  test("startWechatGateway backs off 30s on first errcode -14", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-session-"));
    process.env.PI_STATE_DIR = stateDir;

    const scheduledDelays: number[] = [];
    globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number) => {
      scheduledDelays.push(Number(ms ?? 0));
      return { fn, ms } as any;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

    globalThis.fetch = ((async () => {
      return new Response(
        JSON.stringify({ errcode: -14, errmsg: "session timeout" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown) as typeof fetch;

    const runtime = createRuntime();

    await startWechatGateway(runtime, async () => {});
    for (let i = 0; i < 10 && !scheduledDelays.includes(30_000); i += 1) {
      await Promise.resolve();
    }

    expect(scheduledDelays).toContain(30_000);
    expect(scheduledDelays).not.toContain(5_000);
  });
});
