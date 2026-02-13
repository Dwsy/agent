/**
 * BBD tests for gateway tool (config.get / reload / restart) — v3.8 T5
 *
 * Tests the gateway extension tool and HTTP endpoints.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ============================================================================
// Test harness — capture registered tools from the extension
// ============================================================================

type ToolDef = {
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[];
    details?: Record<string, unknown>;
  }>;
};

const registeredTools: ToolDef[] = [];

function createMockPi() {
  return {
    registerTool: (tool: ToolDef) => { registeredTools.push(tool); },
    registerCommand: () => {},
    registerKeybinding: () => {},
    onEvent: () => ({ dispose: () => {} }),
  };
}

async function loadExtension() {
  registeredTools.length = 0;
  process.env.PI_GATEWAY_URL = "http://localhost:18789";
  process.env.PI_GATEWAY_INTERNAL_TOKEN = "test-token-123";
  process.env.PI_GATEWAY_SESSION_KEY = "agent:main:telegram:dm:123";

  const mod = await import("../../extensions/gateway-tools/index.ts");
  mod.default(createMockPi() as any);
}

function getTool(name: string): ToolDef {
  const tool = registeredTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool;
}

// ============================================================================
// Mock fetch
// ============================================================================

let fetchMock: ReturnType<typeof mock>;
const originalFetch = globalThis.fetch;

function mockFetchResponse(status: number, body: Record<string, unknown>) {
  fetchMock = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })),
  );
  globalThis.fetch = fetchMock as any;
}

function mockFetchError(error: string) {
  fetchMock = mock(() => Promise.reject(new Error(error)));
  globalThis.fetch = fetchMock as any;
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(async () => {
  await loadExtension();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PI_GATEWAY_URL;
  delete process.env.PI_GATEWAY_INTERNAL_TOKEN;
  delete process.env.PI_GATEWAY_SESSION_KEY;
});

// ============================================================================
// GW-01 ~ GW-09: gateway tool tests
// ============================================================================

describe("gateway tool [v3.8 T5]", () => {
  it("GW-01: gateway tool is registered", () => {
    expect(registeredTools.find((t) => t.name === "gateway")).toBeTruthy();
  });

  it("GW-02: config.get returns redacted config JSON", async () => {
    const fakeConfig = { gateway: { port: 18789, auth: { mode: "token", token: "***" } } };
    mockFetchResponse(200, fakeConfig);
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "config.get" });
    expect(result.content[0].text).toContain("18789");
    expect(result.content[0].text).toContain("***");
    expect(result.details?.ok).toBe(true);
    // Verify correct endpoint
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("http://localhost:18789/api/gateway/config");
  });

  it("GW-03: config.get handles HTTP error", async () => {
    mockFetchResponse(500, { error: "Internal error" });
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "config.get" });
    expect(result.content[0].text).toContain("Error");
    expect(result.details?.error).toBe(true);
  });

  it("GW-04: reload returns success message", async () => {
    mockFetchResponse(200, { ok: true, message: "Config reloaded" });
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "reload" });
    expect(result.content[0].text).toContain("Config reloaded");
    expect(result.details?.ok).toBe(true);
    // Verify POST method
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("http://localhost:18789/api/gateway/reload");
    expect(call[1].method).toBe("POST");
  });

  it("GW-05: reload handles HTTP error", async () => {
    mockFetchResponse(500, { error: "Reload failed" });
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "reload" });
    expect(result.content[0].text).toContain("Reload failed");
    expect(result.details?.error).toBe(true);
  });

  it("GW-06: restart returns success when enabled", async () => {
    mockFetchResponse(200, { ok: true, message: "Gateway restarting..." });
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "restart" });
    expect(result.content[0].text).toContain("restarting");
    expect(result.details?.ok).toBe(true);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("http://localhost:18789/api/gateway/restart");
    expect(call[1].method).toBe("POST");
  });

  it("GW-07: restart returns error when disabled (403)", async () => {
    mockFetchResponse(403, { error: "Restart is disabled. Set gateway.commands.restart: true in config." });
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "restart" });
    expect(result.content[0].text).toContain("disabled");
    expect(result.details?.error).toBe(true);
  });

  it("GW-08: unknown action returns error", async () => {
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "unknown" });
    expect(result.content[0].text).toContain("Unknown action");
    expect(result.details?.error).toBe(true);
  });

  it("GW-09: network error is handled gracefully", async () => {
    mockFetchError("Connection refused");
    const tool = getTool("gateway");
    const result = await tool.execute("c", { action: "config.get" });
    expect(result.content[0].text).toContain("Connection refused");
    expect(result.details?.error).toBe(true);
  });

  it("GW-10: all requests include auth header", async () => {
    mockFetchResponse(200, { ok: true });
    const tool = getTool("gateway");
    for (const action of ["config.get", "reload", "restart"]) {
      await tool.execute("c", { action });
      const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(call[1]?.headers?.Authorization).toBe("Bearer test-token-123");
    }
  });
});
