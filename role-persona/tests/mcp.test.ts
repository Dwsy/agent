/**
 * MCP Server Integration Tests — tests Streamable HTTP transport.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_PATH = resolve(__dirname, "../src/transport/mcp-server.ts");
const PORT = 13939; // Use non-default port for testing

let serverProc: ReturnType<typeof spawn> | null = null;

async function waitForServer(maxMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function mcpPost(body: any, sessionId?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(`http://localhost:${PORT}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  // Parse SSE data line
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      return { status: res.status, headers: Object.fromEntries(res.headers), data: JSON.parse(line.slice(6)) };
    }
  }
  // Direct JSON response
  try {
    return { status: res.status, headers: Object.fromEntries(res.headers), data: JSON.parse(text) };
  } catch {
    return { status: res.status, headers: Object.fromEntries(res.headers), raw: text };
  }
}

describe("MCP Streamable HTTP", () => {
  beforeAll(async () => {
    serverProc = spawn("bun", [MCP_PATH], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const ready = await waitForServer();
    if (!ready) throw new Error("MCP server failed to start");
  });

  afterAll(() => {
    serverProc?.kill("SIGTERM");
  });

  test("health endpoint", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.name).toBe("role-persona-mcp");
    expect(data.transport).toBe("streamable-http");
  });

  test("initialize returns capabilities", async () => {
    const { status, data } = await mcpPost({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });

    expect(data.result).toBeTruthy();
    expect(data.result.protocolVersion).toBe("2025-03-26");
    expect(data.result.serverInfo.name).toBe("role-persona");
    expect(data.result.capabilities).toHaveProperty("tools");
  });

  test("tools/list returns 4 tools", async () => {
    // First initialize to get session
    const initRes = await mcpPost({
      jsonrpc: "2.0",
      id: 10,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });

    // Extract session ID from response headers
    const sessionId = initRes.headers["mcp-session-id"];
    expect(sessionId).toBeTruthy();

    const { data } = await mcpPost(
      { jsonrpc: "2.0", id: 11, method: "tools/list" },
      sessionId
    );

    expect(data.result.tools).toBeTruthy();
    expect(data.result.tools.length).toBe(4);

    const names = data.result.tools.map((t: any) => t.name);
    expect(names).toContain("memory");
    expect(names).toContain("knowledge");
    expect(names).toContain("role_info");
    expect(names).toContain("role_management");
  });

  test("tools/call memory search", async () => {
    const initRes = await mcpPost({
      jsonrpc: "2.0",
      id: 20,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });
    const sessionId = initRes.headers["mcp-session-id"];

    const { data } = await mcpPost(
      {
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: {
          name: "memory",
          arguments: { action: "search", query: "memory" },
        },
      },
      sessionId
    );

    expect(data.result).toBeTruthy();
    expect(data.result.content).toBeTruthy();
    expect(data.result.content[0].type).toBe("text");
  });

  test("tools/call role_info", async () => {
    const initRes = await mcpPost({
      jsonrpc: "2.0",
      id: 30,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });
    const sessionId = initRes.headers["mcp-session-id"];

    const { data } = await mcpPost(
      {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "role_info", arguments: {} },
      },
      sessionId
    );

    expect(data.result).toBeTruthy();
    expect(data.result.content[0].type).toBe("text");
    const parsed = JSON.parse(data.result.content[0].text);
    expect(parsed).toHaveProperty("name");
    expect(parsed).toHaveProperty("path");
  });

  test("session not found returns 404", async () => {
    const { status, data } = await mcpPost(
      { jsonrpc: "2.0", id: 40, method: "tools/list" },
      "nonexistent-session-id"
    );
    expect(status).toBe(404);
    expect(data.error.code).toBe(-32000);
  });

  test("CORS headers present", async () => {
    const res = await fetch(`http://localhost:${PORT}/mcp`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
