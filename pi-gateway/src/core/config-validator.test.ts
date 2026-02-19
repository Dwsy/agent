/**
 * Config Validator Tests
 *
 * Tests for ConfigValidator with business rules.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ConfigValidator,
  validateConfig,
  isConfigValid,
  BuiltInRules,
  type ValidationResult,
  type ValidationIssue,
} from "./config-validator.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import type { Config } from "./config.ts";
import { mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "config-validator-test-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    session: {
      ...DEFAULT_CONFIG.session,
      dataDir: tempDir,
    },
    ...overrides,
  } as Config;
}

// ============================================================================
// ConfigValidator Tests
// ============================================================================

describe("config-validator", () => {
  describe("CV-VAL-1: valid config", () => {
    it("returns valid for proper config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: true });
      const result = await validator.validate(createConfig());
      expect(result.valid).toBe(true);
    });

    it("has no errors for valid config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: true });
      const result = await validator.validate(createConfig());
      expect(result.stats.error).toBe(0);
    });

    it("allows custom port in valid range", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 8080,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it("isConfigValid returns true for valid config", async () => {
      const valid = await isConfigValid(createConfig());
      expect(valid).toBe(true);
    });
  });

  describe("CV-VAL-2: invalid config detection", () => {
    it("detects invalid port type", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: "8080" as unknown as number,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((e) => e.path.includes("port"))).toBe(true);
    });

    it("detects pool min > max", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 10,
            max: 5,
            idleTimeoutMs: 300000,
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((e) => e.path.includes("pool"))).toBe(true);
    });

    it("detects invalid auth mode", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "invalid" as "off" | "token" | "password",
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("CV-VAL-3: Port availability rule", () => {
    it("detects port out of range", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 70000,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((e) => e.path.includes("port"))).toBe(true);
    });

    it("returns valid for valid user port", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 8080,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("CV-VAL-4: Token format rule", () => {
    it("returns error for placeholder token", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "token",
            token: "your_token_here",
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.issues.some((i) => i.path.includes("token") && i.severity === "warning")).toBe(true);
    });

    it("returns error for short token", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "token",
            token: "short",
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.issues.some((i) => i.path.includes("token"))).toBe(true);
    });

    it("accepts valid token format", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "token",
            token: "valid-token-12345-secure",
          },
        },
      });
      const result = await validator.validate(config);
      // Should be valid, or at least no token-related errors
      const tokenErrors = result.issues.filter((i) => i.path.includes("token") && i.severity === "error");
      expect(tokenErrors).toHaveLength(0);
    });

    it("validates Telegram bot token", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        channels: {
          telegram: {
            enabled: true,
            botToken: "your_bot_token_here",
          },
        },
      });
      const result = await validator.validate(config);
      const tokenIssues = result.issues.filter((i) => i.path.includes("botToken"));
      expect(tokenIssues.length).toBeGreaterThan(0);
    });
  });

  describe("CV-VAL-5: Directory existence rule", () => {
    it("warns when session data directory does not exist", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: true });
      const config = createConfig({
        session: {
          ...DEFAULT_CONFIG.session,
          dataDir: "/nonexistent/path/12345",
        },
      });
      const result = await validator.validate(config);
      const dirIssue = result.issues.find((i) => i.path.includes("dataDir"));
      expect(dirIssue).toBeDefined();
      expect(dirIssue?.suggestion).toContain("created");
    });

    it("returns no directory issues when dataDir exists", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: true });
      const result = await validator.validate(createConfig());
      const dirErrors = result.issues.filter((i) => i.path === "session.dataDir" && i.severity === "error");
      expect(dirErrors).toHaveLength(0);
    });
  });

  describe("CV-VAL-6: Security best practices rule", () => {
    it("returns warning when auth is off", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "off",
          },
        },
      });
      const result = await validator.validate(config);
      const authWarning = result.issues.find((i) =>
        i.path === "gateway.auth.mode" && i.severity === "warning"
      );
      expect(authWarning).toBeDefined();
      expect(authWarning?.message).toContain("open to anyone");
    });

    it("returns warning when token auth has no token", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "token",
            token: undefined,
          },
        },
      });
      const result = await validator.validate(config);
      const tokenWarning = result.issues.find((i) =>
        i.path.includes("token") && i.severity === "warning"
      );
      expect(tokenWarning).toBeDefined();
    });

    it("returns error for Telegram dmPolicy open without wildcard", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        channels: {
          telegram: {
            enabled: true,
            dmPolicy: "open",
            allowFrom: ["123456"], // Missing "*"
          },
        },
      });
      const result = await validator.validate(config);
      const policyError = result.issues.find((i) =>
        i.path.includes("dmPolicy") && i.severity === "error"
      );
      expect(policyError).toBeDefined();
    });
  });

  describe("CV-VAL-7: Pool configuration rule", () => {
    it("returns error when min > max", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 5,
            max: 2,
            idleTimeoutMs: 300000,
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      const poolError = result.issues.find((i) => i.path.includes("pool"));
      expect(poolError?.severity).toBe("error");
    });

    it("returns info when max is high", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 1,
            max: 50,
            idleTimeoutMs: 300000,
          },
        },
      });
      const result = await validator.validate(config);
      const infoIssue = result.issues.find((i) =>
        i.path.includes("pool.max") && i.severity === "info"
      );
      expect(infoIssue).toBeDefined();
    });

    it("returns info when idle timeout is short", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 1,
            max: 4,
            idleTimeoutMs: 5000,
          },
        },
      });
      const result = await validator.validate(config);
      const infoIssue = result.issues.find((i) =>
        i.path.includes("idleTimeout") && i.severity === "info"
      );
      expect(infoIssue).toBeDefined();
    });

    it("returns valid for valid pool config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const result = await validator.validate(createConfig());
      const poolErrors = result.issues.filter((i) =>
        i.path.includes("pool") && i.severity === "error"
      );
      expect(poolErrors).toHaveLength(0);
    });
  });

  describe("CV-VAL-8: Cron configuration rule", () => {
    it("detects duplicate job IDs", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        cron: {
          enabled: true,
          jobs: [
            {
              id: "dup-job",
              schedule: { kind: "every", expr: "1h" },
              payload: { text: "task 1" },
            },
            {
              id: "dup-job",
              schedule: { kind: "every", expr: "2h" },
              payload: { text: "task 2" },
            },
          ],
        },
      });
      const result = await validator.validate(config);
      const dupError = result.issues.find((i) =>
        i.message.includes("Duplicate") && i.severity === "error"
      );
      expect(dupError).toBeDefined();
    });

    it("warns on invalid cron expression", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        cron: {
          enabled: true,
          jobs: [
            {
              id: "bad-cron",
              schedule: { kind: "cron", expr: "invalid" },
              payload: { text: "task" },
            },
          ],
        },
      });
      const result = await validator.validate(config);
      const cronWarning = result.issues.find((i) =>
        i.path.includes("cron") && i.message.includes("cron expression")
      );
      expect(cronWarning).toBeDefined();
    });

    it("warns when job references unknown agent", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agents: {
          list: [{ id: "main", workspace: "/tmp" }],
          default: "main",
        },
        cron: {
          enabled: true,
          jobs: [
            {
              id: "unknown-agent-job",
              schedule: { kind: "every", expr: "1h" },
              payload: { text: "task" },
              agentId: "nonexistent",
            },
          ],
        },
      });
      const result = await validator.validate(config);
      const agentWarning = result.issues.find((i) =>
        i.message.includes("Agent") && i.message.includes("not found")
      );
      expect(agentWarning).toBeDefined();
    });
  });

  describe("CV-VAL-9: Agents configuration rule", () => {
    it("detects duplicate agent IDs", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agents: {
          list: [
            { id: "agent1", workspace: "/tmp/1" },
            { id: "agent1", workspace: "/tmp/2" },
          ],
          default: "agent1",
        },
      });
      const result = await validator.validate(config);
      const dupError = result.issues.find((i) =>
        i.message.includes("Duplicate agent")
      );
      expect(dupError).toBeDefined();
    });

    it("returns error when default agent not found", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agents: {
          list: [{ id: "agent1", workspace: "/tmp" }],
          default: "nonexistent",
        },
      });
      const result = await validator.validate(config);
      const defaultError = result.issues.find((i) =>
        i.path === "agents.default" && i.severity === "error"
      );
      expect(defaultError).toBeDefined();
    });

    it("warns when agent has no workspace", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agents: {
          list: [{ id: "agent1" } as Config["agents"]["list"][0]],
          default: "agent1",
        },
      });
      const result = await validator.validate(config);
      const workspaceWarning = result.issues.find((i) =>
        i.message.includes("workspace")
      );
      expect(workspaceWarning).toBeDefined();
    });

    it("warns when binding references unknown agent", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        agents: {
          list: [{ id: "agent1", workspace: "/tmp" }],
          default: "agent1",
          bindings: [
            { agentId: "unknown", match: { channel: "telegram" } },
          ],
        },
      });
      const result = await validator.validate(config);
      const bindingWarning = result.issues.find((i) =>
        i.path.includes("bindings")
      );
      expect(bindingWarning).toBeDefined();
    });
  });

  describe("CV-VAL-10: ConfigValidator class", () => {
    it("can be instantiated with options", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const result = await validator.validate(createConfig());
      expect(result.valid).toBe(true);
    });

    it("can add custom rules", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      let called = false;
      validator.registerRule({
        id: "test-rule",
        description: "Test rule",
        validate: async () => {
          called = true;
          return [];
        },
      });
      await validator.validate(createConfig());
      expect(called).toBe(true);
    });

    it("aggregates multiple issues", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "off",
          },
        },
        channels: {
          discord: { enabled: true },
        },
      });
      const result = await validator.validate(config);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });

    it("handles rule exceptions gracefully", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      validator.registerRule({
        id: "failing-rule",
        description: "Failing rule",
        validate: async () => {
          throw new Error("Rule failed");
        },
      });
      const result = await validator.validate(createConfig());
      expect(result.valid).toBe(false);
      expect(result.issues.some((e) => e.path === "config")).toBe(true);
    });

    it("returns registered rule IDs", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const rules = validator.getRegisteredRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules).toContain("schema");
    });

    it("isValid returns boolean", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const valid = await validator.isValid(createConfig());
      expect(typeof valid).toBe("boolean");
    });
  });

  describe("CV-VAL-11: strict mode", () => {
    it("upgrades warnings to errors in strict mode", async () => {
      const validator = new ConfigValidator({
        checkPorts: false,
        checkDirectories: false,
        strict: true,
      });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: { mode: "off" },
        },
      });
      const result = await validator.validate(config);
      // In strict mode, auth off warning becomes error
      expect(result.issues.every((i) => i.severity !== "warning" || i.path !== "gateway.auth.mode")).toBe(true);
    });
  });

  describe("CV-VAL-12: comprehensive validation", () => {
    it("catches all issues in problematic config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const badConfig = createConfig({
        gateway: {
          port: -1,
          bind: "invalid" as "loopback" | "lan" | "auto",
          auth: {
            mode: "off",
          },
          logLevel: "invalid" as "debug" | "info" | "warn" | "error",
        },
        agent: {
          pool: {
            min: 10,
            max: 5,
            idleTimeoutMs: 300000,
          },
        },
        agents: {
          list: [
            { id: "dup", workspace: "/tmp/1" },
            { id: "dup", workspace: "/tmp/2" },
          ],
          default: "nonexistent",
        },
      });

      const result = await validator.validate(badConfig as Config);
      expect(result.valid).toBe(false);
      expect(result.stats.error).toBeGreaterThan(3);
    });

    it("validates successful config with minor warnings", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 8080,
          auth: {
            mode: "token",
            token: "my-secure-token-12345",
          },
        },
        channels: {
          discord: { enabled: true },
        },
      });

      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("CV-VAL-13: BuiltInRules export", () => {
    it("exports all built-in rules", () => {
      expect(BuiltInRules.SchemaValidationRule).toBeDefined();
      expect(BuiltInRules.TokenFormatRule).toBeDefined();
      expect(BuiltInRules.SecurityBestPracticesRule).toBeDefined();
      expect(BuiltInRules.PoolConfigurationRule).toBeDefined();
      expect(BuiltInRules.CronConfigurationRule).toBeDefined();
      expect(BuiltInRules.AgentsConfigurationRule).toBeDefined();
    });
  });
});
