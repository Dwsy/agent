#!/usr/bin/env bun

/**
 * MCP Server — Streamable HTTP transport (MCP spec 2025-03-26).
 *
 * Uses WebStandardStreamableHTTPServerTransport for native Bun.serve compatibility.
 * Delegates all operations to role-persona CLI via cli-runner.
 *
 * Endpoints:
 *   POST   /mcp  → JSON-RPC (initialize, tools/call, etc.)
 *   GET    /mcp  → SSE stream for server-initiated messages
 *   DELETE /mcp  → Session termination
 *   GET    /health → Health check
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { cli } from "./cli-runner.ts";

// ── Server Factory ──

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "role-persona",
    version: "1.0.0",
  });

  // ── Tool: memory ──
  server.registerTool("memory", {
    description: "Manage role memory (learnings, preferences, search, maintenance)",
    inputSchema: {
      action: z.enum([
        "add_learning", "add_preference", "update_learning", "update_preference",
        "delete_learning", "delete_preference", "reinforce", "search", "list",
        "consolidate", "repair", "llm_tidy", "vector_rebuild", "vector_stats",
      ] as const).describe("Memory action"),
      content: z.string().optional().describe("Memory text"),
      category: z.string().optional().describe("Preference category"),
      query: z.string().optional().describe("Search query or needle"),
      id: z.string().optional().describe("Memory entry ID"),
      model: z.string().optional().describe("LLM model override"),
    },
  }, async ({ action, content, category, query, id, model }) => {
    const args: string[] = [];
    switch (action) {
      case "add_learning":      args.push("memory", "add-learning", content!); break;
      case "add_preference":    args.push("memory", "add-preference", content!); if (category) args.push("--category", category); break;
      case "update_learning":   args.push("memory", "update-learning", id || query!, content!); break;
      case "update_preference": args.push("memory", "update-preference", id || query!, content!); if (category) args.push("--category", category); break;
      case "delete_learning":   args.push("memory", "delete-learning", id || query || content!); break;
      case "delete_preference": args.push("memory", "delete-preference", id || query || content!); break;
      case "reinforce":         args.push("memory", "reinforce", id || query || content!); break;
      case "search":            args.push("memory", "search", query || content || ""); break;
      case "list":              args.push("memory", "list"); break;
      case "consolidate":       args.push("memory", "consolidate"); break;
      case "repair":            args.push("memory", "repair", "--force"); break;
      case "llm_tidy":          args.push("memory", "tidy"); if (model) args.push("--model", model); break;
      case "vector_rebuild":    args.push("embedding", "rebuild"); break;
      case "vector_stats":      args.push("embedding", "stats"); break;
    }
    const result = await cli(args, { timeoutMs: action === "llm_tidy" ? 120000 : 30000 });
    const text = result.ok ? (result.message || JSON.stringify(result.data, null, 2)) : `Error: ${result.error}`;
    return { content: [{ type: "text" as const, text }], isError: !result.ok };
  });

  // ── Tool: knowledge ──
  server.registerTool("knowledge", {
    description: "Searchable knowledge base (design patterns, architecture, troubleshooting)",
    inputSchema: {
      action: z.enum(["list", "search", "read", "write"] as const),
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      path: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
    },
  }, async ({ action, query, tags, category, path, title, content }) => {
    const args: string[] = ["knowledge"];
    switch (action) {
      case "list":   args.push("list"); if (category) args.push(category); break;
      case "search": args.push("search", query || ""); if (tags) args.push("--tags", tags.join(",")); break;
      case "read":   args.push("read", path || ""); break;
      case "write":  args.push("write"); if (title) args.push("--title", title); if (content) args.push("--content", content); if (category) args.push("--category", category); if (tags) args.push("--tags", tags.join(",")); break;
    }
    const result = await cli(args, { timeoutMs: 10000 });
    const text = result.ok ? (result.message || JSON.stringify(result.data, null, 2)) : `Error: ${result.error}`;
    return { content: [{ type: "text" as const, text }], isError: !result.ok };
  });

  // ── Tool: role_info ──
  server.registerTool("role_info", {
    description: "Get active role info and directory structure",
    inputSchema: {},
  }, async () => {
    const result = await cli(["role", "info"], { timeoutMs: 5000 });
    const text = result.ok ? JSON.stringify(result.data, null, 2) : `Error: ${result.error}`;
    return { content: [{ type: "text" as const, text }], isError: !result.ok };
  });

  // ── Tool: role_management ──
  server.registerTool("role_management", {
    description: "Manage roles: list, create, map, unmap, info",
    inputSchema: {
      action: z.enum(["list", "create", "map", "unmap", "info"] as const),
      name: z.string().optional().describe("Role name"),
    },
  }, async ({ action, name }) => {
    const args: string[] = ["role", action];
    if (name && (action === "create" || action === "map")) args.push(name);
    const result = await cli(args, { timeoutMs: 5000 });
    const text = result.ok ? (result.message || JSON.stringify(result.data, null, 2)) : `Error: ${result.error}`;
    return { content: [{ type: "text" as const, text }], isError: !result.ok };
  });

  return server;
}

// ── Session Management ──

const sessions = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }>();

// ── Bun.serve ──

const PORT = parseInt(process.env.MCP_PORT || process.env.PORT || "3939", 10);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, name: "role-persona-mcp", version: "1.0.0", transport: "streamable-http", sessions: sessions.size, port: PORT });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const sessionId = req.headers.get("mcp-session-id") || undefined;
      const body = req.method === "POST" ? await req.json().catch(() => null) : undefined;

      // New session initialization
      if (req.method === "POST" && !sessionId && body && (Array.isArray(body) ? body.some(isInitializeRequest) : isInitializeRequest(body))) {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (id) => {
            sessions.set(id, { transport, server: mcpServer });
            console.log(`[mcp] session initialized: ${id}`);
          },
          onsessionclosed: async (id) => {
            sessions.delete(id);
            console.log(`[mcp] session closed: ${id}`);
          },
        });

        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);

        const response = await transport.handleRequest(req, { parsedBody: body });
        // Inject CORS headers
        for (const [k, v] of Object.entries(corsHeaders)) {
          response.headers.set(k, v);
        }
        return response;
      }

      // Existing session
      const session = sessionId ? sessions.get(sessionId) : undefined;

      if (req.method === "POST") {
        if (!session) {
          return Response.json(
            { jsonrpc: "2.0", error: { code: -32000, message: "Session not found" }, id: null },
            { status: 404, headers: corsHeaders }
          );
        }
        const response = await session.transport.handleRequest(req, { parsedBody: body });
        for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);
        return response;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        if (!session) {
          return new Response("Session not found", { status: 404, headers: corsHeaders });
        }
        const response = await session.transport.handleRequest(req);
        for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);
        return response;
      }

      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    } catch (err) {
      console.error("[mcp] error:", err);
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32603, message: String(err) }, id: null },
        { status: 500, headers: corsHeaders }
      );
    }
  },
});

console.log(`[role-persona] MCP Streamable HTTP → http://localhost:${PORT}/mcp`);
console.log(`[role-persona] Health → http://localhost:${PORT}/health`);
