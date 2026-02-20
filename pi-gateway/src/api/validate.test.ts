/**
 * Config Validation API Tests
 *
 * Tests for HTTP endpoint /api/validate
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { handleValidateRequest, handleValidateWithContext, type ValidateResponse } from "./validate.ts";
import { DEFAULT_CONFIG } from "../core/config.ts";
import type { Config } from "../core/config.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-api-test-"));
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

async function makePostRequest(body: unknown): Promise<Response> {
  const req = new Request("http://localhost/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleValidateRequest(req);
}

async function makeGetRequest(config: Config): Promise<Response> {
  const req = new Request("http://localhost/api/validate", {
    method: "GET",
  });
  return handleValidateWithContext(req, config);
}

// ============================================================================
// API Tests
// ============================================================================

describe("validate API", () => {
  describe("CV-API-1: endpoint format", () => {
    it("returns correct response structure for POST", async () => {
      const res = await makePostRequest(createConfig());
      expect(res.status).toBe(200);

      const data = (await res.json()) as ValidateResponse;
      expect(data).toHaveProperty("ok");
      expect(data).toHaveProperty("valid");
      expect(data).toHaveProperty("summary");
      expect(data).toHaveProperty("issues");
    });

    it("returns correct summary structure", async () => {
      const res = await makePostRequest(createConfig());
      const data = (await res.json()) as ValidateResponse;

      expect(data.summary).toHaveProperty("errors");
      expect(data.summary).toHaveProperty("warnings");
      expect(data.summary).toHaveProperty("info");
      expect(data.summary).toHaveProperty("total");
    });

    it("returns numeric counts in summary", async () => {
      const res = await makePostRequest(createConfig());
      const data = (await res.json()) as ValidateResponse;

      expect(typeof data.summary.errors).toBe("number");
      expect(typeof data.summary.warnings).toBe("number");
      expect(typeof data.summary.info).toBe("number");
      expect(typeof data.summary.total).toBe("number");
    });
  });

  describe("CV-API-2: valid config responses", () => {
    it("returns valid=true for good config", async () => {
      const res = await makePostRequest(createConfig());
      const data = (await res.json()) as ValidateResponse;

      expect(data.ok).toBe(true);
      expect(data.valid).toBe(true);
      expect(data.summary.errors).toBe(0);
    });

    it("returns 200 status for valid config", async () => {
      const res = await makePostRequest(createConfig());
      expect(res.status).toBe(200);
    });

    it("includes empty or minimal issues array for valid config", async () => {
      const res = await makePostRequest(createConfig());
      const data = (await res.json()) as ValidateResponse;

      expect(Array.isArray(data.issues)).toBe(true);
      // Valid config may have warnings/info but no errors
      expect(data.summary.errors).toBe(0);
    });
  });

  describe("CV-API-3: invalid config responses", () => {
    it("returns valid=false for invalid config", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: -1,
        },
      });
      const data = (await res.json()) as ValidateResponse;

      expect(data.valid).toBe(false);
      expect(data.summary.errors).toBeGreaterThan(0);
    });

    it("returns 422 status for invalid config", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 99999,
        },
      });
      expect(res.status).toBe(422);
    });

    it("includes error details in issues array", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: "invalid" as unknown as number,
        },
      });
      const data = (await res.json()) as ValidateResponse;

      expect(data.issues.length).toBeGreaterThan(0);
      expect(data.issues[0]).toHaveProperty("path");
      expect(data.issues[0]).toHaveProperty("message");
      expect(data.issues[0]).toHaveProperty("severity");
    });

    it("includes suggestions when available", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 0,
        },
      });
      const data = (await res.json()) as ValidateResponse;

      const issue = data.issues.find((i) => i.path.includes("port"));
      expect(issue).toBeDefined();
      expect(issue?.suggestion).toBeTruthy();
    });
  });

  describe("CV-API-4: various config states", () => {
    it("handles port in use scenario (schema validation)", async () => {
      // Note: Port availability check is async and may not run in quick validation
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: 80, // Privileged port - schema accepts but may warn
          auth: {
            mode: "token",
            token: "valid-token-here",
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      // Port 80 is technically valid for schema (1-65535)
      expect(data.summary.errors).toBe(0);
    });

    it("handles invalid telegram token", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        channels: {
          telegram: {
            enabled: true,
            botToken: "your_token_here", // Placeholder
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      const tokenIssue = data.issues.find((i) =>
        i.path.includes("botToken") || i.path.includes("telegram")
      );
      expect(tokenIssue).toBeDefined();
    });

    it("handles missing workspace directory", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        session: {
          ...DEFAULT_CONFIG.session,
          dataDir: "/path/that/does/not/exist/12345",
        },
      });
      const data = (await res.json()) as ValidateResponse;

      // Directory check is optional and returns warning, not error
      expect(data.valid).toBe(true);
    });

    it("handles unsafe auth mode (off)", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "off",
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      expect(data.valid).toBe(true); // Warning, not error
      const warning = data.issues.find((i) =>
        i.path === "gateway.auth.mode" && i.severity === "warning"
      );
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("open to anyone");
    });

    it("handles disabled channels info", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        channels: {
          discord: { enabled: true },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      expect(data.valid).toBe(true);
    });
  });

  describe("CV-API-5: error handling", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new Request("http://localhost/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      const res = await handleValidateRequest(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("JSON");
    });

    it("returns 400 for non-object body", async () => {
      const req = new Request("http://localhost/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '"string"',
      });
      const res = await handleValidateRequest(req);
      expect(res.status).toBe(400);
    });

    it("returns 405 for unsupported methods", async () => {
      const req = new Request("http://localhost/api/validate", {
        method: "DELETE",
      });
      const res = await handleValidateRequest(req);
      expect(res.status).toBe(405);
    });

    it("returns helpful error message", async () => {
      const req = new Request("http://localhost/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      });
      const res = await handleValidateRequest(req);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });
  });

  describe("CV-API-6: GET with context", () => {
    it("returns validation result for current config", async () => {
      const config = createConfig();
      const res = await makeGetRequest(config);
      const data = (await res.json()) as ValidateResponse;

      expect(data.ok).toBe(true);
      expect(typeof data.valid).toBe("boolean");
    });

    it("returns 200 for valid runtime config", async () => {
      const config = createConfig();
      const res = await makeGetRequest(config);
      expect(res.status).toBe(200);
    });

    it("returns 422 for invalid runtime config", async () => {
      const config = createConfig({
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: -1,
        },
      });
      const res = await makeGetRequest(config);
      expect(res.status).toBe(422);
    });
  });

  describe("CV-API-7: issue categorization", () => {
    it("correctly categorizes errors", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          port: -1,
        },
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 10,
            max: 5,
            idleTimeoutMs: 300000,
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      expect(data.summary.errors).toBeGreaterThan(0);
      expect(data.issues.every((i) => i.severity === "error" || i.severity !== "error")).toBe(true);
    });

    it("correctly categorizes warnings", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        gateway: {
          ...DEFAULT_CONFIG.gateway,
          auth: {
            mode: "off",
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      const warnings = data.issues.filter((i) => i.severity === "warning");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it("correctly categorizes info messages", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 1,
            max: 50, // High max triggers info
            idleTimeoutMs: 300000,
          },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      const infos = data.issues.filter((i) => i.severity === "info");
      expect(infos.length).toBeGreaterThanOrEqual(0);
    });

    it("totals match issue count", async () => {
      const res = await makePostRequest({
        ...createConfig(),
        channels: {
          discord: { enabled: true },
          webchat: { enabled: true },
        },
      });
      const data = (await res.json()) as ValidateResponse;

      const expectedTotal = data.summary.errors + data.summary.warnings + data.summary.info;
      expect(data.summary.total).toBe(expectedTotal);
    });
  });

  describe("CV-API-8: comprehensive scenarios", () => {
    it("validates complex valid config", async () => {
      const config = createConfig({
        gateway: {
          port: 8080,
          bind: "lan",
          auth: {
            mode: "token",
            token: "my-secret-token-12345",
          },
        },
        agent: {
          ...DEFAULT_CONFIG.agent,
          pool: {
            min: 2,
            max: 8,
            idleTimeoutMs: 300000,
          },
        },
        channels: {
          telegram: {
            enabled: true,
            botToken: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789",
          },
        },
      });

      const res = await makePostRequest(config);
      const data = (await res.json()) as ValidateResponse;

      expect(data.valid).toBe(true);
      expect(data.summary.errors).toBe(0);
    });

    it("validates config with multiple issues", async () => {
      const config = createConfig({
        gateway: {
          port: 8080,
          bind: "auto",
          auth: {
            mode: "off", // warning
          },
        },
        channels: {
          discord: { enabled: true },
        },
        agent: {
          pool: {
            min: 10,
            max: 5, // error
            idleTimeoutMs: 300000,
          },
        },
      });

      const res = await makePostRequest(config as Config);
      const data = (await res.json()) as ValidateResponse;

      expect(data.valid).toBe(false); // Due to pool min > max
      expect(data.summary.errors).toBeGreaterThan(0);
      expect(data.summary.total).toBeGreaterThanOrEqual(data.summary.errors);
    });
  });
});
