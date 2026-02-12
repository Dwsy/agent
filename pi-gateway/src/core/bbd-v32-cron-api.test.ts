/**
 * v3.2 Cron CLI Management Tests — CR-1 ~ CR-11
 *
 * Tests handleCronApi() HTTP routes and CronEngine CRUD methods.
 * Spec: docs/PRD-GATEWAY-V32.md §4.2
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { handleCronApi } from "./cron-api.ts";

// ── Minimal CronEngine mock ────────────────────────────────────────────

class MockCronEngine {
  jobs: Map<string, any> = new Map();
  runs: Map<string, any[]> = new Map();
  manualTriggers: string[] = [];

  addJob(job: any): void {
    this.jobs.set(job.id, { ...job, paused: false });
  }

  removeJob(id: string): boolean {
    return this.jobs.delete(id);
  }

  listJobs(): any[] {
    return [...this.jobs.values()];
  }

  pauseJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.paused = true;
    return true;
  }

  resumeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || !job.paused) return false;
    job.paused = false;
    return true;
  }

  runJob(id: string): boolean {
    if (!this.jobs.has(id)) return false;
    this.manualTriggers.push(id);
    return true;
  }

  getRunHistory(jobId: string, limit = 20): any[] {
    return (this.runs.get(jobId) ?? []).slice(0, limit);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
  const base = "http://localhost:18789";
  const url = new URL(path, base);
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return { req: new Request(url.toString(), init), url };
}

async function callApi(cron: MockCronEngine, method: string, path: string, body?: unknown, config?: any): Promise<{ status: number; data: any }> {
  const { req, url } = makeReq(method, path, body);
  const res = handleCronApi(req, url, cron as any, config);
  const response = res instanceof Promise ? await res : res;
  if (!response) return { status: 0, data: null };
  const data = await response.json();
  return { status: response.status, data };
}

const VALID_JOB = {
  id: "test-job-1",
  schedule: { kind: "every", expr: "30m" },
  task: "Run health check",
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("v3.2 Cron API — CR-1 ~ CR-11", () => {
  let cron: MockCronEngine;

  beforeEach(() => {
    cron = new MockCronEngine();
  });

  test("CR-1: list with 0 jobs returns empty array", async () => {
    const { status, data } = await callApi(cron, "GET", "/api/cron/jobs");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.jobs).toHaveLength(0);
  });

  test("CR-2: add valid every job succeeds", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", VALID_JOB);
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.job.id).toBe("test-job-1");
    expect(cron.jobs.has("test-job-1")).toBe(true);
  });

  test("CR-3: add with invalid schedule returns 400", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", {
      id: "bad-sched",
      schedule: { kind: "invalid", expr: "???" },
      task: "nope",
    });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("schedule.kind");
  });

  test("CR-3b: add with missing task returns 400", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", {
      id: "no-task",
      schedule: { kind: "every", expr: "1h" },
      task: "",
    });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("task");
  });

  test("CR-3c: add with invalid id returns 400", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", {
      id: "has spaces!",
      schedule: { kind: "cron", expr: "0 * * * *" },
      task: "test",
    });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("id");
  });

  test("CR-4: add duplicate id returns 409", async () => {
    await callApi(cron, "POST", "/api/cron/jobs", VALID_JOB);
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", VALID_JOB);
    expect(status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("already exists");
  });

  test("CR-5: remove existing job succeeds", async () => {
    cron.addJob({ id: "rm-me", schedule: { kind: "every", expr: "1h" }, payload: { text: "x" } });
    const { status, data } = await callApi(cron, "DELETE", "/api/cron/jobs/rm-me");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(cron.jobs.has("rm-me")).toBe(false);
  });

  test("CR-6: remove non-existent returns 404", async () => {
    const { status, data } = await callApi(cron, "DELETE", "/api/cron/jobs/ghost");
    expect(status).toBe(404);
    expect(data.ok).toBe(false);
  });

  test("CR-7: pause active job sets paused flag", async () => {
    cron.addJob({ id: "pausable", schedule: { kind: "every", expr: "5m" }, payload: { text: "x" } });
    const { status, data } = await callApi(cron, "PATCH", "/api/cron/jobs/pausable", { action: "pause" });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("paused");
    expect(cron.jobs.get("pausable").paused).toBe(true);
  });

  test("CR-8: resume paused job clears paused flag", async () => {
    cron.addJob({ id: "resumable", schedule: { kind: "every", expr: "5m" }, payload: { text: "x" } });
    cron.pauseJob("resumable");
    const { status, data } = await callApi(cron, "PATCH", "/api/cron/jobs/resumable", { action: "resume" });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("active");
    expect(cron.jobs.get("resumable").paused).toBe(false);
  });

  test("CR-9: add with deleteAfterRun flag persists", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", {
      ...VALID_JOB,
      id: "one-shot",
      deleteAfterRun: true,
    });
    expect(status).toBe(201);
    expect(data.job.deleteAfterRun).toBe(true);
  });

  test("CR-10: list shows job status and last run", async () => {
    cron.addJob({ id: "with-history", schedule: { kind: "every", expr: "1h" }, payload: { text: "x" } });
    cron.runs.set("with-history", [{ ts: Date.now(), status: "ok", durationMs: 120 }]);
    const { status, data } = await callApi(cron, "GET", "/api/cron/jobs");
    expect(status).toBe(200);
    const job = data.jobs.find((j: any) => j.id === "with-history");
    expect(job.status).toBe("active");
    expect(job.lastRun).toBeTruthy();
    expect(job.lastRun.status).toBe("ok");
  });

  test("CR-11: manual trigger via POST /run", async () => {
    cron.addJob({ id: "manual", schedule: { kind: "every", expr: "6h" }, payload: { text: "x" } });
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs/manual/run");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(cron.manualTriggers).toContain("manual");
  });

  test("CR-11b: manual trigger non-existent returns 404", async () => {
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs/nope/run");
    expect(status).toBe(404);
    expect(data.ok).toBe(false);
  });

  // Validation edge cases
  test("CR-edge: PATCH with invalid action returns 400", async () => {
    cron.addJob({ id: "edge", schedule: { kind: "every", expr: "1h" }, payload: { text: "x" } });
    const { status, data } = await callApi(cron, "PATCH", "/api/cron/jobs/edge", { action: "restart" });
    expect(status).toBe(400);
    expect(data.error).toContain("action");
  });

  test("CR-edge: POST with invalid JSON returns 400", async () => {
    const { req, url } = makeReq("POST", "/api/cron/jobs");
    // Override body with invalid JSON
    const badReq = new Request(req.url, {
      method: "POST",
      body: "not json{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await handleCronApi(badReq, url, cron as any);
    expect(res).toBeTruthy();
    expect(res!.status).toBe(400);
  });

  test("CR-edge: non-cron route returns null", () => {
    const { req, url } = makeReq("GET", "/api/metrics");
    const res = handleCronApi(req, url, cron as any);
    expect(res).toBeNull();
  });

  test("CR-edge: agentId validation against config", async () => {
    const config = { agents: { list: [{ id: "main" }, { id: "helper" }] } };
    const { status, data } = await callApi(cron, "POST", "/api/cron/jobs", {
      id: "agent-check",
      schedule: { kind: "every", expr: "1h" },
      task: "test",
      agentId: "nonexistent",
    }, config);
    expect(status).toBe(400);
    expect(data.error).toContain("nonexistent");
  });

  test("CR-edge: all three schedule kinds accepted", async () => {
    for (const [kind, expr] of [["cron", "0 */6 * * *"], ["every", "2h"], ["at", "2026-12-01T00:00:00Z"]]) {
      const { status } = await callApi(cron, "POST", "/api/cron/jobs", {
        id: `sched-${kind}`,
        schedule: { kind, expr },
        task: "test",
      });
      expect(status).toBe(201);
    }
    expect(cron.jobs.size).toBe(3);
  });
});
