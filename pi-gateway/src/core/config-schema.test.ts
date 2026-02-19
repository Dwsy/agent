/**
 * Config Schema Validation Tests
 *
 * Tests for TypeBox schema validation via ConfigValidator.
 */

import { describe, it, expect } from "bun:test";
import {
  ConfigValidator,
  SchemaValidationRule,
  type ValidationResult,
} from "./config-validator.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import type { Config } from "./config.ts";

// ============================================================================
// Test Helpers
// ============================================================================

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  } as Config;
}

async function validateSchemaOnly(config: Config): Promise<ValidationResult> {
  const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
  // Remove all rules except schema
  const rules = validator.getRegisteredRules();
  // Register just the schema rule by creating a new validator
  const schemaValidator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
  return schemaValidator.validate(config);
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe("config-schema", () => {
  describe("CV-SCHEMA-1: valid config passes validation", () => {
    it("returns valid for default config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const result = await validator.validate(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.stats.error).toBe(0);
    });

    it("returns valid for custom valid config", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 8080,
          bind: "lan",
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("CV-SCHEMA-2: type validation", () => {
    it("errors when port is string", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: "8080" as unknown as number,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      const portError = result.issues.find((i) => i.path.includes("port"));
      expect(portError).toBeDefined();
    });

    it("errors when bind is number", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          bind: 123 as unknown as "loopback" | "lan" | "auto",
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it("errors when auth.mode is invalid type", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            ...DEFAULT_CONFIG.gateway.auth,
            mode: null as unknown as "off" | "token" | "password",
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("CV-SCHEMA-3: enum validation", () => {
    it("errors on invalid bind value", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          bind: "invalid" as "loopback" | "lan" | "auto",
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      const bindError = result.issues.find((i) => i.path.includes("bind"));
      expect(bindError?.suggestion).toBeTruthy();
    });

    it("errors on invalid auth.mode value", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            ...DEFAULT_CONFIG.gateway.auth,
            mode: "oauth" as "off" | "token" | "password",
          },
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it("accepts valid enum values", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const configs: Config["gateway"]["bind"][] = ["loopback", "lan", "auto"];
      for (const bind of configs) {
        const config = createConfig({
          gateway: { ...DEFAULT_CONFIG.gateway, bind },
        });
        const result = await validator.validate(config);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("CV-SCHEMA-4: range validation", () => {
    it("errors when port is 0", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 0,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it("errors when port is 65536", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 65536,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it("accepts port 1", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 1,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it("accepts port 65535", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 65535,
        },
      });
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("CV-SCHEMA-5: telegram token format", () => {
    it("accepts valid token format", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        channels: {
          ...DEFAULT_CONFIG.channels,
          telegram: {
            enabled: true,
            botToken: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789",
          },
        },
      });
      const result = await validator.validate(config);
      // Should pass schema validation (token format rule may catch other issues)
      const tokenErrors = result.issues.filter((e) => e.path.includes("botToken") && e.severity === "error");
      // TypeBox schema accepts string, token format is checked by TokenFormatRule
      expect(tokenErrors).toHaveLength(0);
    });
  });

  describe("CV-SCHEMA-6: required field validation", () => {
    it("errors when required fields are missing", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = { ...DEFAULT_CONFIG } as Record<string, unknown>;
      delete (config.gateway as Record<string, unknown>).port;
      const result = await validator.validate(config as Config);
      expect(result.issues.some((e) => e.path.includes("port"))).toBe(true);
    });
  });

  describe("CV-SCHEMA-7: result structure", () => {
    it("returns correct result structure", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const result = await validator.validate(DEFAULT_CONFIG);
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("stats");
      expect(result).toHaveProperty("autoFixableCount");
      expect(typeof result.valid).toBe("boolean");
      expect(typeof result.stats.error).toBe("number");
      expect(typeof result.stats.warning).toBe("number");
      expect(typeof result.stats.info).toBe("number");
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it("categorizes errors correctly", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: -1,
        },
      });
      const result = await validator.validate(config);
      expect(result.stats.error).toBeGreaterThan(0);
      expect(result.issues.filter((i) => i.severity === "error").length).toBe(result.stats.error);
    });

    it("stats sum matches total issues", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        channels: {
          discord: { enabled: true },
          webchat: { enabled: true },
        },
      });
      const result = await validator.validate(config);
      const totalFromStats = result.stats.error + result.stats.warning + result.stats.info;
      expect(result.issues.length).toBe(totalFromStats);
    });
  });

  describe("CV-SCHEMA-8: error message quality", () => {
    it("includes path in error messages", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: "invalid" as unknown as number,
        },
      });
      const result = await validator.validate(config);
      const error = result.issues.find((i) => i.severity === "error");
      expect(error?.path).toBeTruthy();
    });

    it("includes helpful suggestion for errors", async () => {
      const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 0,
        },
      });
      const result = await validator.validate(config);
      const error = result.issues.find((i) => i.path.includes("port"));
      expect(error?.suggestion).toBeTruthy();
    });
  });
});
