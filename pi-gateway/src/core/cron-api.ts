/**
 * Cron API — HTTP route handlers for cron job management.
 *
 * Routes:
 *   GET    /api/cron/jobs          → list all jobs
 *   POST   /api/cron/jobs          → add new job
 *   DELETE /api/cron/jobs/:id      → remove job
 *   PATCH  /api/cron/jobs/:id      → pause/resume
 *   POST   /api/cron/jobs/:id/run  → manual trigger
 */

import type { CronEngine } from "./cron.ts";
import type { CronJob, Config } from "./config.ts";
import type { GatewayContext } from "../gateway/types.ts";
import type { ObservabilityCategory, ObservabilityLevel } from "./gateway-observability.ts";

// ============================================================================
// Validation
// ============================================================================

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

interface ValidationError {
  ok: false;
  error: string;
}

interface AddJobInput {
  id: string;
  schedule: CronJob["schedule"];
  task: string;
  agentId?: string;
  delivery?: CronJob["delivery"];
  deleteAfterRun?: boolean;
  timeoutMs?: number;
}

function validateAddJob(body: unknown, config?: Config): ValidationError | null {
  const b = body as Record<string, unknown>;

  if (!b.id || typeof b.id !== "string" || !ID_RE.test(b.id)) {
    return { ok: false, error: "id: alphanumeric/hyphens/underscores, 1-64 chars" };
  }

  if (!b.schedule || typeof b.schedule !== "object") {
    return { ok: false, error: "schedule: required object with kind + expr" };
  }
  const sched = b.schedule as Record<string, unknown>;
  if (!["cron", "every", "at"].includes(sched.kind as string)) {
    return { ok: false, error: 'schedule.kind: must be "cron", "every", or "at"' };
  }
  if (!sched.expr || typeof sched.expr !== "string") {
    return { ok: false, error: "schedule.expr: required string" };
  }

  if (!b.task || typeof b.task !== "string" || (b.task as string).length > 2000) {
    return { ok: false, error: "task: non-empty string, max 2000 chars" };
  }

  if (b.agentId != null) {
    const agents = config?.agents?.list ?? [];
    if (agents.length > 0 && !agents.some((a) => a.id === b.agentId)) {
      return { ok: false, error: `agentId: "${b.agentId}" not found in agents.list` };
    }
  }

  return null;
}

// ============================================================================
// Route Handler
// ============================================================================

type ObservabilityRecorder = {
  record: (
    level: ObservabilityLevel,
    category: ObservabilityCategory,
    action: string,
    message: string,
    meta?: Record<string, unknown>,
  ) => unknown;
};

const NOOP_OBSERVABILITY: ObservabilityRecorder = {
  record: () => undefined,
};

function resolveCronApiDeps(
  cronOrCtx: CronEngine | GatewayContext,
  configMaybe?: Config,
): { cron: CronEngine; config: Config | undefined; obs: ObservabilityRecorder } {
  if ("pool" in cronOrCtx) {
    const cron = cronOrCtx.cron;
    if (!cron) throw new Error("Cron not enabled");
    return {
      cron,
      config: cronOrCtx.config,
      obs: cronOrCtx.observability ?? NOOP_OBSERVABILITY,
    };
  }

  return {
    cron: cronOrCtx,
    config: configMaybe,
    obs: NOOP_OBSERVABILITY,
  };
}

export function handleCronApi(
  req: Request,
  url: URL,
  cronOrCtx: CronEngine | GatewayContext,
  configMaybe?: Config,
): Response | Promise<Response> | null {
  const { cron, config, obs } = resolveCronApiDeps(cronOrCtx, configMaybe);
  const path = url.pathname;

  // GET /api/cron/jobs
  if (path === "/api/cron/jobs" && req.method === "GET") {
    const jobs = cron.listJobs();
    const result = jobs.map((j) => ({
      ...j,
      status: j.paused ? "paused" : j.enabled === false ? "disabled" : "active",
      lastRun: cron.getRunHistory(j.id, 1)[0] ?? null,
    }));
    return Response.json({ ok: true, jobs: result });
  }

  // POST /api/cron/jobs
  if (path === "/api/cron/jobs" && req.method === "POST") {
    return handleAddJob(req, cron, config, obs);
  }

  // DELETE /api/cron/jobs/:id
  const deleteMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const id = decodeURIComponent(deleteMatch[1]);
    const removed = cron.removeJob(id);
    if (!removed) {
      obs.record("warn", "cron", "remove", `Failed to remove job: ${id} not found`);
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    obs.record("info", "cron", "remove", `Job removed: ${id}`);
    return Response.json({ ok: true });
  }

  // PATCH /api/cron/jobs/:id
  const patchMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (patchMatch && req.method === "PATCH") {
    return handlePatchJob(req, patchMatch[1], cron, obs);
  }

  // POST /api/cron/jobs/:id/run
  const runMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)\/run$/);
  if (runMatch && req.method === "POST") {
    const id = decodeURIComponent(runMatch[1]);
    const triggered = cron.runJob(id);
    if (!triggered) {
      obs.record("warn", "cron", "run", `Failed to trigger job: ${id} not found`);
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    obs.record("info", "cron", "run", `Job triggered: ${id}`);
    return Response.json({ ok: true, message: "triggered" });
  }

  // GET /api/cron/jobs/:id/runs
  const runsMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)\/runs$/);
  if (runsMatch && req.method === "GET") {
    const id = decodeURIComponent(runsMatch[1]);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const runs = cron.getRunHistory(id, Math.min(limit, 100));
    return Response.json({ ok: true, runs });
  }

  // GET /api/cron/status
  if (path === "/api/cron/status" && req.method === "GET") {
    const jobs = cron.listJobs();
    const active = jobs.filter((j) => !j.paused && j.enabled !== false).length;
    const paused = jobs.filter((j) => j.paused).length;
    return Response.json({
      ok: true,
      total: jobs.length,
      active,
      paused,
      disabled: jobs.length - active - paused,
    });
  }

  return null; // not a cron route
}

// ============================================================================
// Helpers
// ============================================================================

async function handleAddJob(
  req: Request,
  cron: CronEngine,
  config: Config | undefined,
  obs: ObservabilityRecorder,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    obs.record("warn", "cron", "add", "Invalid JSON in add job request");
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const err = validateAddJob(body, config);
  if (err) {
    obs.record("warn", "cron", "add", `Validation failed: ${err.error}`);
    return Response.json(err, { status: 400 });
  }

  const b = body as AddJobInput;

  // Check duplicate
  const existing = cron.listJobs().find((j) => j.id === b.id);
  if (existing) {
    obs.record("warn", "cron", "add", `Job already exists: ${b.id}`);
    return Response.json({ ok: false, error: `job "${b.id}" already exists` }, { status: 409 });
  }

  const job: CronJob = {
    id: b.id,
    schedule: b.schedule,
    payload: { text: b.task },
    agentId: b.agentId,
    delivery: b.delivery,
    deleteAfterRun: b.deleteAfterRun,
    timeoutMs: b.timeoutMs,
  };

  cron.addJob(job);
  obs.record("info", "cron", "add", `Job added: ${b.id}`);
  return Response.json({ ok: true, job }, { status: 201 });
}

async function handlePatchJob(
  req: Request,
  rawId: string,
  cron: CronEngine,
  obs: ObservabilityRecorder,
): Promise<Response> {
  const id = decodeURIComponent(rawId);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    obs.record("warn", "cron", "patch", "Invalid JSON in patch job request");
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  if (action === "pause") {
    const ok = cron.pauseJob(id);
    if (!ok) {
      obs.record("warn", "cron", "pause", `Failed to pause job: ${id} not found`);
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    obs.record("info", "cron", "pause", `Job paused: ${id}`);
    return Response.json({ ok: true, status: "paused" });
  }
  if (action === "resume") {
    const ok = cron.resumeJob(id);
    if (!ok) {
      obs.record("warn", "cron", "resume", `Failed to resume job: ${id} not found or not paused`);
      return Response.json({ ok: false, error: "not found or not paused" }, { status: 404 });
    }
    obs.record("info", "cron", "resume", `Job resumed: ${id}`);
    return Response.json({ ok: true, status: "active" });
  }

  if (action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.schedule) patch.schedule = body.schedule;
    if (body.task) patch.payload = { text: body.task };
    if (body.delivery) patch.delivery = body.delivery;
    if (body.deleteAfterRun != null) patch.deleteAfterRun = body.deleteAfterRun;
    if (body.timeoutMs != null) patch.timeoutMs = body.timeoutMs;

    if (Object.keys(patch).length === 0) {
      obs.record("warn", "cron", "update", "No fields to update");
      return Response.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const updated = cron.updateJob(id, patch as Record<string, unknown>);
    if (!updated) {
      obs.record("warn", "cron", "update", `Failed to update job: ${id} not found`);
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    obs.record("info", "cron", "update", `Job updated: ${id}`);
    return Response.json({ ok: true, job: updated });
  }

  obs.record("warn", "cron", "patch", `Invalid action: ${action}`);
  return Response.json({ ok: false, error: 'action: must be "pause", "resume", or "update"' }, { status: 400 });
}
