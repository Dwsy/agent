import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleGatewayConfigRaw } from "../config-raw.ts";

const VALID_CONFIG = `{
  // JSONC comments are allowed
  "gateway": {
    "port": 52134,
    "bind": "loopback",
    "auth": { "mode": "token", "token": "test-token-123" },
  },
  "agent": {
    "pool": { "min": 1, "max": 1, "idleTimeoutMs": 1000 },
  },
  "session": { "dmScope": "main", "dataDir": "/tmp/pi-gateway-test-sessions" },
}`;

function createCtx(path?: string) {
  let reloads = 0;
  const events: Array<{ action: string; message: string }> = [];
  return {
    ctx: {
      configPath: path ?? process.env.PI_GATEWAY_CONFIG ?? "",
      reloadConfig: () => { reloads += 1; },
      observability: {
        record: (_level: string, _category: string, action: string, message: string) => {
          events.push({ action, message });
        },
      },
    } as any,
    get reloads() { return reloads; },
    events,
  };
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("raw gateway config API", () => {
  let previousConfigPath: string | undefined;
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    previousConfigPath = process.env.PI_GATEWAY_CONFIG;
    dir = mkdtempSync(join(tmpdir(), "pi-gateway-config-raw-"));
    configPath = join(dir, "pi-gateway.jsonc");
    writeFileSync(configPath, VALID_CONFIG, "utf-8");
    process.env.PI_GATEWAY_CONFIG = configPath;
  });

  afterEach(() => {
    if (previousConfigPath === undefined) {
      delete process.env.PI_GATEWAY_CONFIG;
    } else {
      process.env.PI_GATEWAY_CONFIG = previousConfigPath;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads raw config text with mtime", async () => {
    const { ctx } = createCtx();
    const res = await handleGatewayConfigRaw(jsonRequest("/api/gateway/config/raw", "GET"), new URL("http://localhost/api/gateway/config/raw"), ctx);
    const data = await res.json() as { ok: boolean; text: string; path: string; mtimeMs: number };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.path).toBe(configPath);
    expect(data.text).toContain("JSONC comments are allowed");
    expect(data.mtimeMs).toBeGreaterThan(0);
  });

  test("uses gateway context config path over environment fallback", async () => {
    const explicitPath = join(dir, "explicit.jsonc");
    writeFileSync(explicitPath, VALID_CONFIG.replace("52134", "52136"), "utf-8");
    const { ctx } = createCtx(explicitPath);

    const res = await handleGatewayConfigRaw(jsonRequest("/api/gateway/config/raw", "GET"), new URL("http://localhost/api/gateway/config/raw"), ctx);
    const data = await res.json() as { ok: boolean; text: string; path: string };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.path).toBe(explicitPath);
    expect(data.text).toContain("52136");
  });

  test("validates JSONC with comments and trailing commas", async () => {
    const { ctx } = createCtx();
    const res = await handleGatewayConfigRaw(
      jsonRequest("/api/gateway/config/raw/validate", "POST", { text: VALID_CONFIG }),
      new URL("http://localhost/api/gateway/config/raw/validate"),
      ctx,
    );
    const data = await res.json() as { ok: boolean; validation: { valid: boolean; stats: { error: number } } };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.validation.valid).toBe(true);
    expect(data.validation.stats.error).toBe(0);
  });

  test("rejects invalid config before writing", async () => {
    const { ctx } = createCtx();
    const original = readFileSync(configPath, "utf-8");
    const res = await handleGatewayConfigRaw(
      jsonRequest("/api/gateway/config/raw", "PUT", { text: "{ bad json", expectedMtimeMs: null }),
      new URL("http://localhost/api/gateway/config/raw"),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(readFileSync(configPath, "utf-8")).toBe(original);
  });

  test("saves valid config, creates backup, and reloads", async () => {
    const runtime = createCtx();
    const getRes = await handleGatewayConfigRaw(jsonRequest("/api/gateway/config/raw", "GET"), new URL("http://localhost/api/gateway/config/raw"), runtime.ctx);
    const current = await getRes.json() as { mtimeMs: number; text: string };
    const nextText = current.text.replace("52134", "52135");

    const saveRes = await handleGatewayConfigRaw(
      jsonRequest("/api/gateway/config/raw", "PUT", { text: nextText, expectedMtimeMs: current.mtimeMs }),
      new URL("http://localhost/api/gateway/config/raw"),
      runtime.ctx,
    );
    const data = await saveRes.json() as { ok: boolean; backupPath: string };

    expect(saveRes.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(existsSync(data.backupPath)).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toContain("52135");
    expect(runtime.reloads).toBe(1);
  });

  test("restores latest backup", async () => {
    const runtime = createCtx();
    const first = await handleGatewayConfigRaw(jsonRequest("/api/gateway/config/raw", "GET"), new URL("http://localhost/api/gateway/config/raw"), runtime.ctx);
    const current = await first.json() as { mtimeMs: number; text: string };
    await handleGatewayConfigRaw(
      jsonRequest("/api/gateway/config/raw", "PUT", { text: current.text.replace("52134", "52135"), expectedMtimeMs: current.mtimeMs }),
      new URL("http://localhost/api/gateway/config/raw"),
      runtime.ctx,
    );

    const restoreRes = await handleGatewayConfigRaw(
      jsonRequest("/api/gateway/config/raw/restore", "POST", {}),
      new URL("http://localhost/api/gateway/config/raw/restore"),
      runtime.ctx,
    );

    expect(restoreRes.status).toBe(200);
    expect(readFileSync(configPath, "utf-8")).toContain("52134");
    expect(runtime.reloads).toBe(2);
  });
});
