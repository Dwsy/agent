/**
 * BBD tests for gateway-tools extension tool layer (v3.6)
 *
 * Tests the tool execute functions in extensions/gateway-tools/index.ts
 * by mocking fetch and the pi ExtensionAPI. Covers send_media, send_message,
 * and cron tool response formatting and error handling.
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
    // Stubs for other ExtensionAPI methods
    registerCommand: () => {},
    registerKeybinding: () => {},
    onEvent: () => ({ dispose: () => {} }),
  };
}

async function loadExtension() {
  registeredTools.length = 0;
  // Set env vars before importing
  process.env.PI_GATEWAY_URL = "http://localhost:18789";
  process.env.PI_GATEWAY_INTERNAL_TOKEN = "test-token-123";
  process.env.PI_GATEWAY_SESSION_KEY = "agent:main:telegram:dm:123";

  // Dynamic import to pick up env vars
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
// GT-1: Tool registration
// ============================================================================

describe("gateway-tools extension [v3.6]", () => {
  describe("GT-1: registration", () => {
    it("registers all 3 tools", () => {
      const names = registeredTools.map((t) => t.name);
      expect(names).toContain("send_media");
      expect(names).toContain("send_message");
      expect(names).toContain("cron");
    });

    it("skips registration when env vars missing", async () => {
      delete process.env.PI_GATEWAY_URL;
      delete process.env.PI_GATEWAY_INTERNAL_TOKEN;
      const tools: ToolDef[] = [];
      const mockPi = { registerTool: (t: ToolDef) => tools.push(t) };
      const mod = await import("../../extensions/gateway-tools/index.ts");
      mod.default(mockPi as any);
      expect(tools.length).toBe(0);
    });
  });

  // ==========================================================================
  // GT-2: send_media tool
  // ==========================================================================

  describe("GT-2: send_media", () => {
    it("sends media and returns success summary", async () => {
      mockFetchResponse(200, {
        ok: true, delivered: true, type: "photo",
        messageId: "msg-42", path: "./output.png", channel: "telegram",
      });
      const tool = getTool("send_media");
      const result = await tool.execute("call-1", { path: "./output.png" });
      expect(result.content[0].text).toContain("Media sent");
      expect(result.content[0].text).toContain("msg-42");
      expect(result.details?.ok).toBe(true);
    });

    it("returns success without messageId", async () => {
      mockFetchResponse(200, {
        ok: true, delivered: true, type: "document", channel: "discord",
      });
      const tool = getTool("send_media");
      const result = await tool.execute("call-2", { path: "./report.pdf" });
      expect(result.content[0].text).toBe("Media sent (document)");
    });

    it("handles fallback directive (delivered=false)", async () => {
      mockFetchResponse(200, {
        ok: true, delivered: false, directive: "MEDIA:./output.png",
        path: "./output.png", type: "photo", channel: "webchat",
      });
      const tool = getTool("send_media");
      const result = await tool.execute("call-3", { path: "./output.png" });
      expect(result.content[0].text).toContain("MEDIA:");
      expect(result.details?.delivered).toBe(false);
    });

    it("prepends caption to fallback directive", async () => {
      mockFetchResponse(200, {
        ok: true, delivered: false, directive: "MEDIA:./chart.png",
        path: "./chart.png", type: "photo",
      });
      const tool = getTool("send_media");
      const result = await tool.execute("call-4", {
        path: "./chart.png", caption: "Sales chart",
      });
      expect(result.content[0].text).toContain("Sales chart");
      expect(result.content[0].text).toContain("MEDIA:");
    });

    it("handles HTTP error response", async () => {
      mockFetchResponse(400, { error: "Path not found" });
      const tool = getTool("send_media");
      const result = await tool.execute("call-5", { path: "./missing.png" });
      expect(result.content[0].text).toContain("Failed to send media");
      expect(result.content[0].text).toContain("Path not found");
      expect(result.details?.error).toBe(true);
    });

    it("handles network error", async () => {
      mockFetchError("Connection refused");
      const tool = getTool("send_media");
      const result = await tool.execute("call-6", { path: "./output.png" });
      expect(result.content[0].text).toContain("send_media error");
      expect(result.content[0].text).toContain("Connection refused");
    });

    it("sends correct request body", async () => {
      mockFetchResponse(200, { ok: true, delivered: true, type: "audio" });
      const tool = getTool("send_media");
      await tool.execute("call-7", {
        path: "./song.mp3", caption: "My song", type: "audio",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.path).toBe("./song.mp3");
      expect(body.caption).toBe("My song");
      expect(body.type).toBe("audio");
      expect(body.token).toBe("test-token-123");
    });
  });

  // ==========================================================================
  // GT-3: send_message tool
  // ==========================================================================

  describe("GT-3: send_message", () => {
    it("sends text and returns success", async () => {
      mockFetchResponse(200, {
        ok: true, channel: "telegram", textLength: 15,
      });
      const tool = getTool("send_message");
      const result = await tool.execute("call-1", { text: "Hello, world!" });
      expect(result.content[0].text).toContain("Message sent");
      expect(result.content[0].text).toContain("15 chars");
      expect(result.details?.ok).toBe(true);
    });

    it("includes replyTo in summary", async () => {
      mockFetchResponse(200, {
        ok: true, channel: "telegram", textLength: 10, replyTo: "msg-99",
      });
      const tool = getTool("send_message");
      const result = await tool.execute("call-2", {
        text: "Got it", replyTo: "msg-99",
      });
      expect(result.content[0].text).toContain("reply to msg-99");
    });

    it("handles HTTP error", async () => {
      mockFetchResponse(403, { error: "Unauthorized" });
      const tool = getTool("send_message");
      const result = await tool.execute("call-3", { text: "test" });
      expect(result.content[0].text).toContain("Failed to send message");
      expect(result.details?.error).toBe(true);
    });

    it("handles network error", async () => {
      mockFetchError("ECONNREFUSED");
      const tool = getTool("send_message");
      const result = await tool.execute("call-4", { text: "test" });
      expect(result.content[0].text).toContain("send_message error");
    });

    it("sends correct request body with parseMode", async () => {
      mockFetchResponse(200, { ok: true, textLength: 5 });
      const tool = getTool("send_message");
      await tool.execute("call-5", {
        text: "hello", replyTo: "123", parseMode: "HTML",
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toBe("hello");
      expect(body.replyTo).toBe("123");
      expect(body.parseMode).toBe("HTML");
      expect(body.token).toBe("test-token-123");
    });
  });

  // ==========================================================================
  // GT-4: cron tool (tool-layer tests, complementing CT-* API tests)
  // ==========================================================================

  describe("GT-4: cron tool layer", () => {
    it("list formats empty result", async () => {
      mockFetchResponse(200, { ok: true, jobs: [] });
      const tool = getTool("cron");
      const result = await tool.execute("call-1", { action: "list" });
      expect(result.content[0].text).toBe("No scheduled jobs.");
    });

    it("list formats jobs as JSON", async () => {
      mockFetchResponse(200, {
        ok: true,
        jobs: [{ id: "backup", status: "active" }],
      });
      const tool = getTool("cron");
      const result = await tool.execute("call-2", { action: "list" });
      expect(result.content[0].text).toContain("1 job(s)");
      expect(result.content[0].text).toContain("backup");
    });

    it("add returns confirmation with schedule info", async () => {
      mockFetchResponse(201, { ok: true, job: { id: "test" } });
      const tool = getTool("cron");
      const result = await tool.execute("call-3", {
        action: "add", id: "test",
        schedule: { kind: "every", expr: "1h" },
        task: "Run test",
      });
      expect(result.content[0].text).toContain('Job "test" created');
      expect(result.content[0].text).toContain("every: 1h");
    });

    it("add validates required fields", async () => {
      const tool = getTool("cron");
      const r1 = await tool.execute("c", { action: "add" });
      expect(r1.content[0].text).toContain("id is required");

      const r2 = await tool.execute("c", { action: "add", id: "x" });
      expect(r2.content[0].text).toContain("schedule is required");

      const r3 = await tool.execute("c", {
        action: "add", id: "x", schedule: { kind: "every", expr: "1h" },
      });
      expect(r3.content[0].text).toContain("task is required");
    });

    it("remove/pause/resume/run validate id", async () => {
      const tool = getTool("cron");
      for (const action of ["remove", "pause", "resume", "run"]) {
        const result = await tool.execute("c", { action });
        expect(result.content[0].text).toContain("id is required");
      }
    });

    it("wake validates text", async () => {
      const tool = getTool("cron");
      const result = await tool.execute("c", { action: "wake" });
      expect(result.content[0].text).toContain("task (text) is required");
    });

    it("wake sends correct request", async () => {
      mockFetchResponse(200, { ok: true, mode: "now" });
      const tool = getTool("cron");
      const result = await tool.execute("c", {
        action: "wake", task: "Check email", wakeMode: "now",
      });
      expect(result.content[0].text).toContain("heartbeat triggered");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toBe("Check email");
      expect(body.mode).toBe("now");
    });

    it("handles unknown action", async () => {
      const tool = getTool("cron");
      const result = await tool.execute("c", { action: "unknown" });
      expect(result.content[0].text).toContain("Unknown action");
    });

    it("handles network error", async () => {
      mockFetchError("Gateway down");
      const tool = getTool("cron");
      const result = await tool.execute("c", { action: "list" });
      expect(result.content[0].text).toContain("Cron error");
      expect(result.content[0].text).toContain("Gateway down");
    });
  });
});
