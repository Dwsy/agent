import { describe, expect, test } from "bun:test";
import { buildCapabilityProfile } from "../../capability-profile.ts";

function createConfig() {
  return {
    gateway: {
      port: 52134,
      bind: "loopback",
      auth: { mode: "off" },
    },
    agent: {
      model: "openai/gpt-4.1",
      tools: { allow: ["read", "bash", "edit", "write"] },
      gatewayPrompts: { channel: true, identity: true },
    },
    roles: {
      mergeMode: "append",
      capabilities: {},
    },
    channels: {
      telegram: { enabled: true },
      wechat: { enabled: true },
    },
    plugins: { config: {} },
  } as any;
}

function getAppendSystemPrompt(args: string[]): string {
  const index = args.indexOf("--append-system-prompt");
  expect(index).toBeGreaterThanOrEqual(0);
  return args[index + 1] ?? "";
}

describe("buildCapabilityProfile wechat prompt injection", () => {
  test("wechat sessions inject mobile-friendly plain-text output rules", () => {
    const profile = buildCapabilityProfile({
      config: createConfig(),
      role: "default",
      cwd: process.cwd(),
      sessionKey: "agent:main:wechat:dm:user@im.wechat",
    });

    const prompt = getAppendSystemPrompt(profile.args);
    expect(prompt).toContain("WeChat");
    expect(prompt).toContain("不要输出大段文字墙");
    expect(prompt).toContain("不要使用 Markdown 语法");
    expect(prompt).toContain("不要使用 HTML 语法");
    expect(prompt).toContain("长任务或耗时操作时，应主动同步任务进度");
  });

  test("non-wechat sessions do not receive wechat-only formatting rules", () => {
    const profile = buildCapabilityProfile({
      config: createConfig(),
      role: "default",
      cwd: process.cwd(),
      sessionKey: "agent:main:telegram:account:default:main",
    });

    const prompt = getAppendSystemPrompt(profile.args);
    expect(prompt).not.toContain("不要输出大段文字墙");
    expect(prompt).not.toContain("不要使用 Markdown 语法");
    expect(prompt).not.toContain("不要使用 HTML 语法");
  });
});
