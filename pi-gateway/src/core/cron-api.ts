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

export function handleCronApi(
  req: Request,
  url: URL,
  cron: CronEngine,
  config?: Config,
): Response | Promise<Response> | null {
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
    return handleAddJob(req, cron, config);
  }

  // DELETE /api/cron/jobs/:id
  const deleteMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const id = decodeURIComponent(deleteMatch[1]);
    const removed = cron.removeJob(id);
    if (!removed) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  // PATCH /api/cron/jobs/:id
  const patchMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (patchMatch && req.method === "PATCH") {
    return handlePatchJob(req, patchMatch[1], cron);
  }

  // POST /api/cron/jobs/:id/run
  const runMatch = path.match(/^\/api\/cron\/jobs\/([^/]+)\/run$/);
  if (runMatch && req.method === "POST") {
    const id = decodeURIComponent(runMatch[1]);
    const triggered = cron.runJob(id);
    if (!triggered) return Response.json({ ok: false, error: "not found" }, { status: 404 });
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
  config?: Config,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const err = validateAddJob(body, config);
  if (err) return Response.json(err, { status: 400 });

  const b = body as AddJobInput;

  // Check duplicate
  const existing = cron.listJobs().find((j) => j.id === b.id);
  if (existing) {
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
  return Response.json({ ok: true, job }, { status: 201 });
}

async function handlePatchJob(
  req: Request,
  rawId: string,
  cron: CronEngine,
): Promise<Response> {
  const id = decodeURIComponent(rawId);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  if (action === "pause") {
    const ok = cron.pauseJob(id);
    if (!ok) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true, status: "paused" });
  }
  if (action === "resume") {
    const ok = cron.resumeJob(id);
    if (!ok) return Response.json({ ok: false, error: "not found or not paused" }, { status: 404 });
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
      return Response.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const updated = cron.updateJob(id, patch as any);
    if (!updated) return Response.json({ ok: false, error: "not found" }, { status: 404 });
    return Response.json({ ok: true, job: updated });
  }

  return Response.json({ ok: false, error: 'action: must be "pause" or "resume"' }, { status: 400 });
}
