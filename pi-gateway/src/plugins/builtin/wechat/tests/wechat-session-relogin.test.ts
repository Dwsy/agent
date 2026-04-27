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
const originalDateNow = Date.now;
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
  Date.now = originalDateNow;
  resetSessionState("wx-bot");
  if (originalPiStateDir === undefined) {
    delete process.env.PI_STATE_DIR;
  } else {
    process.env.PI_STATE_DIR = originalPiStateDir;
  }
});

describe("wechat session re-login trigger", () => {
  test("startWechatGateway triggers QR re-login callback after the session is marked expired", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-relogin-"));
    process.env.PI_STATE_DIR = stateDir;

    let now = 1_000;
    Date.now = () => now;

    const timers: Array<{ fn: () => Promise<void> | void; ms: number }> = [];
    globalThis.setTimeout = ((fn: (...args: any[]) => void, ms?: number) => {
      timers.push({ fn: fn as () => Promise<void> | void, ms: Number(ms ?? 0) });
      return { fn, ms } as any;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

    globalThis.fetch = ((async () => {
      return new Response(JSON.stringify({ errcode: -14, errmsg: "session timeout" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown) as typeof fetch;

    const expiredAccounts: string[] = [];
    const runtime = createRuntime();

    await startWechatGateway(runtime, async () => {}, {
      onSessionExpired: async (expiredRuntime) => {
        expiredAccounts.push(expiredRuntime.accountId);
      },
    });
    for (let i = 0; i < 10 && !timers.some((timer) => timer.ms === 30_000); i += 1) {
      await Promise.resolve();
    }

    for (const expectedDelay of [30_000, 120_000, 300_000]) {
      const timerIndex = timers.findIndex((timer) => timer.ms === expectedDelay);
      expect(timerIndex).toBeGreaterThanOrEqual(0);
      const [timer] = timers.splice(timerIndex, 1);
      now += expectedDelay;
      await timer.fn();
    }

    expect(expiredAccounts).toEqual(["wx-bot"]);
  });
});
