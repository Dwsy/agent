import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = resolve(import.meta.dir, "models.ts");

function createHome(config: unknown): string {
  const home = mkdtempSync(join(tmpdir(), "pi-models-config-"));
  const agentDir = join(home, ".pi", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
  return home;
}

function runCli(args: string[], home: string) {
  return spawnSync("bun", [SCRIPT_PATH, ...args], {
    cwd: import.meta.dir,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
}

function readConfig(home: string) {
  return JSON.parse(readFileSync(join(home, ".pi", "agent", "models.json"), "utf8")) as {
    providers: Record<string, { baseUrl?: string; api?: string; models?: Array<Record<string, unknown>> }>;
  };
}

describe("models-config thinking commands", () => {
  test("add model can apply a named thinking preset", () => {
    const home = createHome({
      providers: {
        pox: {
          baseUrl: "https://api.example.com/v1",
          api: "openai-responses",
          models: [],
        },
      },
    });

    const result = runCli([
      "add",
      "model",
      "pox",
      "gpt-5.4",
      "--reasoning",
      "--preset",
      "openai-xhigh",
    ], home);

    expect(result.status).toBe(0);
    const config = readConfig(home);
    expect(config.providers.pox.models).toHaveLength(1);
    expect(config.providers.pox.models?.[0]?.thinkingLevelMap).toEqual({
      xhigh: "xhigh",
    });
  });

  test("thinking sync-known updates supported built-in presets only where safe", () => {
    const home = createHome({
      providers: {
        local: {
          baseUrl: "http://localhost:3838/v1",
          api: "openai-responses",
          models: [
            { id: "gpt-5.4", reasoning: true },
            { id: "gpt-5.5", reasoning: true },
          ],
        },
        deepseek: {
          baseUrl: "https://api.deepseek.com/v1",
          api: "openai-completions",
          models: [
            { id: "deepseek-v4-flash", reasoning: true },
            { id: "deepseek-v4-pro", reasoning: true },
          ],
        },
        proxy: {
          baseUrl: "https://api.b.ai/v1",
          api: "openai-completions",
          models: [{ id: "deepseek-v4-pro", reasoning: true }],
        },
        anthropicProxy: {
          baseUrl: "https://example.com/v1",
          api: "anthropic-messages",
          models: [{ id: "gpt-5.5", reasoning: true }],
        },
      },
    });

    const result = runCli(["thinking", "sync-known"], home);

    expect(result.status).toBe(0);
    const config = readConfig(home);

    expect(config.providers.local.models?.[0]?.thinkingLevelMap).toEqual({ xhigh: "xhigh" });
    expect(config.providers.local.models?.[1]?.thinkingLevelMap).toEqual({ xhigh: "xhigh" });
    expect(config.providers.deepseek.models?.[0]?.thinkingLevelMap).toEqual({
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    });
    expect(config.providers.deepseek.models?.[1]?.thinkingLevelMap).toEqual({
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    });
    expect(config.providers.proxy.models?.[0]?.thinkingLevelMap).toBeUndefined();
    expect(config.providers.anthropicProxy.models?.[0]?.thinkingLevelMap).toBeUndefined();
  });
});
