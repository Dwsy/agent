import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { LocalOAuthProvider, McpInspectorHost, buildHeaders, redactSensitive, sanitizeConnectionConfig, validateConnectConfig } from "./mcp-inspector.js";
import { dispatchHostRpc, notifyHostRpcWindowClosed, registerHostRpcHandler } from "./host-rpc.js";

const context = {
  appId: "mcp-url-playground",
  cwd: import.meta.dir,
  sessionId: "test-session",
};

describe("MCP Inspector validation", () => {
  test("rejects shell-shaped stdio args and invalid URLs", () => {
    expect(() => validateConnectConfig({ transport: "stdio", command: "node", args: "server.js; touch /tmp/pwn" })).toThrow();
    expect(() => validateConnectConfig({ transport: "streamable-http", url: "file:///tmp/server" })).toThrow();
  });

  test("redacts nested secrets and env values", () => {
    expect(redactSensitive({ token: "abc", env: { API_KEY: "value" }, nested: { password: "pw", safe: "ok" } })).toEqual({
      token: "[REDACTED]",
      env: { API_KEY: "[REDACTED]" },
      nested: { password: "[REDACTED]", safe: "ok" },
    });
  });

  test("builds bearer, basic, API key, and custom headers safely", () => {
    expect(buildHeaders({ type: "bearer", token: "abc" })).toEqual({ Authorization: "Bearer abc" });
    expect(buildHeaders({ type: "basic", username: "user", password: "pw" })).toEqual({ Authorization: "Basic dXNlcjpwdw==" });
    expect(buildHeaders({ type: "api-key", headerName: "X-Test-Key", apiKey: "secret" })).toEqual({ "X-Test-Key": "secret" });
    expect(buildHeaders({ type: "custom", headers: { "X-Custom": "value" } })).toEqual({ "X-Custom": "value" });
    expect(() => buildHeaders({ type: "custom", headers: { Host: "evil" } })).toThrow();
  });

  test("OAuth callback validates state and keeps credentials out of snapshots", async () => {
    const config = validateConnectConfig({
      transport: "streamable-http",
      url: "https://example.test/mcp",
      auth: { type: "oauth", clientId: "client-id", clientSecret: "client-secret", scope: "mcp:tools" },
    });
    expect(JSON.stringify(sanitizeConnectionConfig(config))).not.toContain("client-secret");

    const provider = await LocalOAuthProvider.create(config.auth!);
    provider.redirectToAuthorization(new URL("https://auth.example.test/authorize"));
    const callback = new URL(provider.redirectUrl!);
    callback.searchParams.set("code", "authorization-code");
    callback.searchParams.set("state", await provider.state());
    const codePromise = provider.waitForAuthorization();
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    expect(await codePromise).toBe("authorization-code");
    await provider.close();
  });
});

describe("native host RPC", () => {
  test("dispatches only registered app handlers and closes", async () => {
    let closed = false;
    const unregister = registerHostRpcHandler("rpc-test", async (method, args) => ({ method, args }), async () => { closed = true; });
    const rpcContext = { ...context, appId: "rpc-test" };
    expect(await dispatchHostRpc("echo", { value: 1 }, rpcContext)).toEqual({ method: "echo", args: { value: 1 } });
    await notifyHostRpcWindowClosed(rpcContext);
    expect(closed).toBe(true);
    unregister();
    await expect(dispatchHostRpc("echo", {}, rpcContext)).rejects.toThrow();
  });
});

describe("streamable HTTP authentication", () => {
  test("sends API key headers to a real MCP server", async () => {
    let observedHeader = "";
    const httpServer = createServer(async (req, res) => {
      if (req.url !== "/mcp" || req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      observedHeader = String(req.headers["x-test-key"] || "");
      if (observedHeader !== "secret-value") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const server = new Server(
        { name: "http-auth-fixture", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{ name: "secure_echo", description: "Authenticated tool", inputSchema: { type: "object" } }],
      }));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, body);
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = httpServer.address() as AddressInfo;
    const host = new McpInspectorHost();
    const httpContext = { ...context, appId: "http-auth-test" };
    try {
      const status = await host.handle("mcp.connect", {
        config: {
          transport: "streamable-http",
          url: `http://127.0.0.1:${address.port}/mcp`,
          auth: { type: "api-key", headerName: "X-Test-Key", apiKey: "secret-value" },
          timeoutMs: 10_000,
        },
      }, httpContext) as any;
      expect(status.connected).toBe(true);
      expect(JSON.stringify(status)).not.toContain("secret-value");

      const tools = await host.handle("mcp.request", { operation: "tools/list", params: {} }, httpContext) as any;
      expect(tools.result.tools[0].name).toBe("secure_echo");
      expect(observedHeader).toBe("secret-value");
      expect(JSON.stringify(tools.history)).not.toContain("secret-value");
    } finally {
      await host.closeApp(httpContext.appId);
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 20_000);
});

describe("stdio MCP integration", () => {
  test("connects, inspects capabilities, calls operations, and closes", async () => {
    const host = new McpInspectorHost();
    const fixture = join(import.meta.dir, "test-fixtures", "mcp-stdio-server.mjs");
    const status = await host.handle("mcp.connect", {
      config: {
        transport: "stdio",
        command: process.execPath,
        args: [fixture],
        env: { TEST_SECRET: "never-persist" },
        timeoutMs: 10_000,
      },
    }, context) as any;

    expect(status.connected).toBe(true);
    expect(status.transport).toBe("stdio");
    expect(status.serverImplementation.name).toBe("fixture-mcp");
    expect(status.config.envKeys).toEqual(["TEST_SECRET"]);
    expect(JSON.stringify(status)).not.toContain("never-persist");

    const tools = await host.handle("mcp.request", { operation: "tools/list", params: {} }, context) as any;
    expect(tools.result.tools[0].name).toBe("echo");

    const called = await host.handle("mcp.request", {
      operation: "tools/call",
      params: { name: "echo", arguments: { text: "hello" } },
    }, context) as any;
    expect(called.result.structuredContent.echoed).toBe("hello");

    const resources = await host.handle("mcp.request", { operation: "resources/list", params: {} }, context) as any;
    expect(resources.result.resources[0].uri).toBe("fixture://hello");

    const prompt = await host.handle("mcp.request", {
      operation: "prompts/get",
      params: { name: "greet", arguments: { name: "Pi" } },
    }, context) as any;
    expect(prompt.result.messages[0].content.text).toBe("Hello Pi");

    const history = await host.handle("mcp.history", {}, context) as any;
    expect(history.history.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(history)).not.toContain("never-persist");

    await host.closeApp(context.appId);
    expect(await host.handle("mcp.status", {}, context)).toEqual({ connected: false, connectionState: "disconnected" });
  }, 20_000);
});
