/**
 * BBD tests for cron tool (v3.6)
 *
 * Tests the cron tool registered in gateway-tools extension.
 * Since the tool makes HTTP calls to /api/cron/jobs, we test the
 * HTTP API layer directly (which the tool calls).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronEngine } from "./cron.ts";
import { handleCronApi } from "./cron-api.ts";
import type { Config, CronJob } from "./config.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ============================================================================
// Test helpers
// ============================================================================

let dataDir: string;
let cron: CronEngine;

const mockDispatcher = {
  dispatch: async () => {},
  getSessionKey: () => "test-session",
};

const testConfig: Partial<Config> = {
  agents: { default: "main", list: [{ id: "main", role: "default" }] },
};

function makeRequest(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function makeUrl(path: string): URL {
  return new URL(`http://localhost${path}`);
}

async function callCronApi(method: string, path: string, body?: unknown) {
  const req = makeRequest(method, path, body);
  const url = makeUrl(path);
  const result = handleCronApi(req, url, cron, testConfig as Config);
  if (result instanceof Promise) return await result;
  return result;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "cron-tool-test-"));
  cron = new CronEngine(dataDir, mockDispatcher as any, testConfig as Config);
});

afterEach(() => {
  cron.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

// ============================================================================
// CT-1: List jobs (empty)
// ============================================================================

describe("cron tool [v3.6]", () => {
  describe("CT-1: list", () => {
    it("returns empty array when no jobs exist", async () => {
      const res = await callCronApi("GET", "/api/cron/jobs");
      expect(res).not.toBeNull();
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.jobs).toEqual([]);
    });

    it("returns jobs with status field", async () => {
      cron.addJob({
        id: "test-1",
        schedule: { kind: "every", expr: "1h" },
        payload: { text: "test task" },
      });
      const res = await callCronApi("GET", "/api/cron/jobs");
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.jobs.length).toBe(1);
      expect(data.jobs[0].id).toBe("test-1");
      expect(data.jobs[0].status).toBe("active");
    });
  });

  // ==========================================================================
  // CT-2: Add job
  // ==========================================================================

  describe("CT-2: add", () => {
    it("creates a job with valid params", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "backup",
        schedule: { kind: "every", expr: "1h" },
        task: "Run backup check",
      });
      expect(res).not.toBeNull();
      expect(res!.status).toBe(201);
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.job.id).toBe("backup");

      // Verify persisted
      const jobs = cron.listJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].id).toBe("backup");
    });

    it("creates a cron-expression job", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "morning",
        schedule: { kind: "cron", expr: "0 9 * * *" },
        task: "Morning briefing",
      });
      expect(res!.status).toBe(201);
      const data = await res!.json();
      expect(data.job.schedule.kind).toBe("cron");
    });

    it("creates an at (one-shot) job", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "remind-1",
        schedule: { kind: "at", expr: "2026-12-31T23:59:59Z" },
        task: "New year reminder",
        deleteAfterRun: true,
      });
      expect(res!.status).toBe(201);
      const data = await res!.json();
      expect(data.job.deleteAfterRun).toBe(true);
    });

    it("rejects duplicate id", async () => {
      await callCronApi("POST", "/api/cron/jobs", {
        id: "dup",
        schedule: { kind: "every", expr: "1h" },
        task: "first",
      });
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "dup",
        schedule: { kind: "every", expr: "2h" },
        task: "second",
      });
      expect(res!.status).toBe(409);
    });

    it("rejects missing id", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        schedule: { kind: "every", expr: "1h" },
        task: "no id",
      });
      expect(res!.status).toBe(400);
    });

    it("rejects missing schedule", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "no-sched",
        task: "no schedule",
      });
      expect(res!.status).toBe(400);
    });

    it("rejects missing task", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs", {
        id: "no-task",
        schedule: { kind: "every", expr: "1h" },
      });
      expect(res!.status).toBe(400);
    });
  });

  // ==========================================================================
  // CT-3: Remove job
  // ==========================================================================

  describe("CT-3: remove", () => {
    it("removes an existing job", async () => {
      cron.addJob({
        id: "to-remove",
        schedule: { kind: "every", expr: "1h" },
        payload: { text: "temp" },
      });
      const res = await callCronApi("DELETE", "/api/cron/jobs/to-remove");
      expect(res).not.toBeNull();
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(cron.listJobs().length).toBe(0);
    });

    it("returns 404 for non-existent job", async () => {
      const res = await callCronApi("DELETE", "/api/cron/jobs/ghost");
      expect(res!.status).toBe(404);
    });
  });

  // ==========================================================================
  // CT-4: Pause / Resume
  // ==========================================================================

  describe("CT-4: pause/resume", () => {
    it("pauses an active job", async () => {
      cron.addJob({
        id: "pausable",
        schedule: { kind: "every", expr: "1h" },
        payload: { text: "task" },
      });
      const res = await callCronApi("PATCH", "/api/cron/jobs/pausable", {
        action: "pause",
      });
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe("paused");

      // Verify in list
      const listRes = await callCronApi("GET", "/api/cron/jobs");
      const listData = await listRes!.json();
      expect(listData.jobs[0].status).toBe("paused");
    });

    it("resumes a paused job", async () => {
      cron.addJob({
        id: "resumable",
        schedule: { kind: "every", expr: "1h" },
        payload: { text: "task" },
      });
      await callCronApi("PATCH", "/api/cron/jobs/resumable", { action: "pause" });
      const res = await callCronApi("PATCH", "/api/cron/jobs/resumable", {
        action: "resume",
      });
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe("active");
    });

    it("returns 404 for non-existent job", async () => {
      const res = await callCronApi("PATCH", "/api/cron/jobs/ghost", {
        action: "pause",
      });
      expect(res!.status).toBe(404);
    });
  });

  // ==========================================================================
  // CT-5: Run (manual trigger)
  // ==========================================================================

  describe("CT-5: run", () => {
    it("triggers an existing job", async () => {
      cron.addJob({
        id: "runnable",
        schedule: { kind: "every", expr: "1h" },
        payload: { text: "task" },
      });
      const res = await callCronApi("POST", "/api/cron/jobs/runnable/run");
      const data = await res!.json();
      expect(data.ok).toBe(true);
      expect(data.message).toBe("triggered");
    });

    it("returns 404 for non-existent job", async () => {
      const res = await callCronApi("POST", "/api/cron/jobs/ghost/run");
      expect(res!.status).toBe(404);
    });
  });

  // ==========================================================================
  // CT-6: Wake (inject system event)
  // ==========================================================================

  describe("CT-6: wake", () => {
    it("injects event with next-heartbeat mode", async () => {
      const { SystemEventsQueue } = await import("./system-events.ts");
      const sysEvents = new SystemEventsQueue();
      const { routeHttp } = await import("../api/http-router.ts");

      const mockCtx = {
        config: {
          ...testConfig,
          agents: { default: "main", list: [{ id: "main", role: "default" }] },
          gateway: { auth: { mode: "off" } },
          hooks: { enabled: false },
          channels: {},
          cron: { enabled: false },
          queue: { priority: { webhook: 3 } },
        },
        systemEvents: sysEvents,
        heartbeat: null,
        cron: null,
        pool: { getStats: () => ({}) },
        queue: { getStats: () => ({}) },
        sessions: { size: 0 },
        registry: { channels: new Map() },
      } as any;

      const req = new Request("http://localhost/api/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Check pending PRs" }),
      });
      const url = new URL("http://localhost/api/wake");
      const res = await routeHttp(req, url, mockCtx);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe("next-heartbeat");

      // Verify event was injected
      const events = sysEvents.peek("agent:main:main");
      expect(events.length).toBe(1);
      expect(events[0]).toContain("Check pending PRs");
    });

    it("injects event with now mode and triggers heartbeat", async () => {
      const { SystemEventsQueue } = await import("./system-events.ts");
      const sysEvents = new SystemEventsQueue();
      let heartbeatTriggered = false;
      const mockHeartbeat = {
        requestNow: (_agentId: string) => { heartbeatTriggered = true; },
      };

      const { routeHttp } = await import("../api/http-router.ts");
      const mockCtx = {
        config: {
          agents: { default: "main", list: [{ id: "main", role: "default" }] },
          gateway: { auth: { mode: "off" } },
          hooks: { enabled: false },
          channels: {},
          cron: { enabled: false },
          queue: { priority: { webhook: 3 } },
        },
        systemEvents: sysEvents,
        heartbeat: mockHeartbeat,
        cron: null,
        pool: { getStats: () => ({}) },
        queue: { getStats: () => ({}) },
        sessions: { size: 0 },
        registry: { channels: new Map() },
      } as any;

      const req = new Request("http://localhost/api/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Urgent: check email", mode: "now" }),
      });
      const url = new URL("http://localhost/api/wake");
      const res = await routeHttp(req, url, mockCtx);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe("now");
      expect(heartbeatTriggered).toBe(true);
    });

    it("rejects empty text", async () => {
      const { SystemEventsQueue } = await import("./system-events.ts");
      const { routeHttp } = await import("../api/http-router.ts");
      const mockCtx = {
        config: {
          agents: { default: "main", list: [] },
          gateway: { auth: { mode: "off" } },
          hooks: { enabled: false },
          channels: {},
          cron: { enabled: false },
          queue: { priority: { webhook: 3 } },
        },
        systemEvents: new SystemEventsQueue(),
        heartbeat: null,
        cron: null,
        pool: { getStats: () => ({}) },
        queue: { getStats: () => ({}) },
        sessions: { size: 0 },
        registry: { channels: new Map() },
      } as any;

      const req = new Request("http://localhost/api/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      const url = new URL("http://localhost/api/wake");
      const res = await routeHttp(req, url, mockCtx);
      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // CT-7: System prompt includes cron tool mention
  // ==========================================================================

  describe("CT-7: system prompt", () => {
    it("CRON_SEGMENT mentions cron tool", async () => {
      const { CRON_PROMPT } = await import("./system-prompts.ts");
      expect(CRON_PROMPT).toContain("cron");
      expect(CRON_PROMPT).toContain("tool");
      expect(CRON_PROMPT).toContain("list, add, remove, pause, resume, run");
    });
  });
});
