import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG, type Config } from "./config.ts";
import { getCwdForRole, resolveRoleForSession } from "./session-router.ts";

const tempDirs: string[] = [];

function mkConfig(): Config {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
}

function mkTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("session router role mapping", () => {
  test("writes role mapping under runtime agent dir when configured", () => {
    const runtimeRoot = mkTempDir("pi-gw-runtime-");
    const config = mkConfig();
    config.agent.runtime = { agentDir: runtimeRoot };

    const cwd = getCwdForRole("mentor", config);
    expect(existsSync(cwd)).toBeTrue();

    const roleConfigPath = join(runtimeRoot, "roles", "config.json");
    expect(existsSync(roleConfigPath)).toBeTrue();

    const roleConfig = JSON.parse(readFileSync(roleConfigPath, "utf-8")) as {
      mappings: Record<string, string>;
    };
    expect(roleConfig.mappings[cwd]).toBe("mentor");
  });

  test("uses configured workspace dir for role", () => {
    const runtimeRoot = mkTempDir("pi-gw-runtime-");
    const workspaceRoot = mkTempDir("pi-gw-workspace-");
    const config = mkConfig();
    config.agent.runtime = { agentDir: runtimeRoot };
    config.roles.workspaceDirs = { architect: workspaceRoot };

    const cwd = getCwdForRole("architect", config);
    expect(cwd).toBe(resolve(workspaceRoot));
  });
});

describe("resolveRoleForSession", () => {
  test("prefers telegram topic role over group role", () => {
    const config = mkConfig();
    config.channels.telegram = {
      ...(config.channels.telegram ?? {}),
      enabled: true,
      groups: {
        "-1001": {
          role: "group-role",
          topics: {
            "42": { role: "topic-role" },
          },
        },
      },
    } as any;

    const role = resolveRoleForSession({
      channel: "telegram",
      accountId: "default",
      chatType: "group",
      chatId: "-1001",
      topicId: "42",
      senderId: "u1",
    }, config);

    expect(role).toBe("topic-role");
  });

  test("falls back to wildcard topic role when group-specific topic role is missing", () => {
    const config = mkConfig();
    config.channels.telegram = {
      ...(config.channels.telegram ?? {}),
      enabled: true,
      groups: {
        "*": {
          topics: {
            "7": { role: "wildcard-topic-role" },
          },
        },
        "-1002": {
          role: "group-role",
        },
      },
    } as any;

    const role = resolveRoleForSession({
      channel: "telegram",
      accountId: "default",
      chatType: "group",
      chatId: "-1002",
      topicId: "7",
      senderId: "u2",
    }, config);

    expect(role).toBe("wildcard-topic-role");
  });
});
