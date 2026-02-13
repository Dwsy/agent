/**
 * Cron Engine — scheduled task execution.
 *
 * Aligned with OpenClaw cron system:
 * - Jobs persisted in jobs.json
 * - Schedule kinds: "cron" (cron expression), "at" (one-shot), "every" (interval)
 * - Jobs dispatch messages to sessions via gateway.dispatch()
 * - Supports isolated sessions (cron:{jobId}) and main session
 */

import { Cron } from "croner";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createLogger, type Logger, type InboundMessage } from "./types.ts";
import type { CronJob, CronDelivery, Config } from "./config.ts";
import type { SystemEventsQueue } from "./system-events.ts";
import { resolveMainSessionKey } from "./session-router.ts";

/** Normalize delivery config — string shorthand or full object → CronDelivery */
function resolveDelivery(raw: CronJob["delivery"]): CronDelivery {
  if (!raw) return { mode: "announce" };
  if (typeof raw === "string") return { mode: raw };
  return raw;
}

// ============================================================================
// Types
// ============================================================================

export interface CronDispatcher {
  dispatch(msg: InboundMessage): Promise<unknown>;
}

export interface CronAnnouncer {
  /**
   * Deliver cron result to the user.
   * mode "announce" → inject into main session for agent retelling
   * mode "direct"   → send raw text to channel
   */
  deliver(agentId: string, text: string, delivery: import("./config.ts").CronDelivery, sessionKey: string): Promise<void>;
}

export interface CronRunRecord {
  jobId: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: "completed" | "timeout" | "error";
  resultPreview?: string;
  error?: string;
}

interface ActiveJob {
  job: CronJob;
  cron: Cron | null;
  timer: ReturnType<typeof setTimeout> | null;
}

// ============================================================================
// Cron Engine
// ============================================================================

export class CronEngine {
  private active = new Map<string, ActiveJob>();
  private jobsPath: string;
  private runsDir: string;
  private log: Logger;

  constructor(
    private dataDir: string,
    private dispatcher: CronDispatcher,
    private config?: Config,
    private announcer?: CronAnnouncer,
    private systemEvents?: SystemEventsQueue,
    private heartbeatWake?: (agentId: string) => void,
  ) {
    this.jobsPath = join(dataDir, "cron", "jobs.json");
    this.runsDir = join(dataDir, "cron", "runs");
    this.log = createLogger("cron");
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    const jobs = this.loadJobs();
    this.log.info(`Starting cron engine with ${jobs.length} job(s)`);

    for (const job of jobs) {
      if (job.enabled === false || job.paused) continue;
      this.scheduleJob(job);
    }
  }

  stop(): void {
    for (const [id, active] of this.active) {
      if (active.cron) active.cron.stop();
      if (active.timer) clearTimeout(active.timer);
    }
    this.active.clear();
    this.log.info("Cron engine stopped");
  }

  // ==========================================================================
  // Job Management
  // ==========================================================================

  addJob(job: CronJob): void {
    const jobs = this.loadJobs();

    // Replace if exists
    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx !== -1) {
      jobs[idx] = job;
    } else {
      jobs.push(job);
    }

    this.saveJobs(jobs);

    // Cancel existing schedule
    const existing = this.active.get(job.id);
    if (existing) {
      if (existing.cron) existing.cron.stop();
      if (existing.timer) clearTimeout(existing.timer);
      this.active.delete(job.id);
    }

    // Schedule new
    if (job.enabled !== false) {
      this.scheduleJob(job);
    }

    this.log.info(`Job added/updated: ${job.id}`);
  }

  removeJob(id: string): boolean {
    const jobs = this.loadJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;

    jobs.splice(idx, 1);
    this.saveJobs(jobs);

    const existing = this.active.get(id);
    if (existing) {
      if (existing.cron) existing.cron.stop();
      if (existing.timer) clearTimeout(existing.timer);
      this.active.delete(id);
    }

    this.log.info(`Job removed: ${id}`);
    return true;
  }

  updateJob(id: string, patch: Partial<Pick<CronJob, "schedule" | "payload" | "mode" | "delivery" | "deleteAfterRun" | "timeoutMs">>): CronJob | null {
    const jobs = this.loadJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;

    const job = { ...jobs[idx], ...patch, id } as CronJob;
    if (patch.payload?.text) job.payload = { ...jobs[idx].payload, ...patch.payload };
    jobs[idx] = job;
    this.saveJobs(jobs);

    // Reschedule
    const existing = this.active.get(id);
    if (existing) {
      if (existing.cron) existing.cron.stop();
      if (existing.timer) clearTimeout(existing.timer);
      this.active.delete(id);
    }
    if (job.enabled !== false && !job.paused) {
      this.scheduleJob(job);
    }

    this.log.info(`Job updated: ${id}`);
    return job;
  }

  listJobs(): CronJob[] {
    return this.loadJobs();
  }

  pauseJob(id: string): boolean {
    const jobs = this.loadJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job) return false;

    job.paused = true;
    this.saveJobs(jobs);

    // Stop active schedule
    const existing = this.active.get(id);
    if (existing) {
      if (existing.cron) existing.cron.stop();
      if (existing.timer) clearTimeout(existing.timer);
      this.active.delete(id);
    }

    this.log.info(`Job paused: ${id}`);
    return true;
  }

  resumeJob(id: string): boolean {
    const jobs = this.loadJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job || !job.paused) return false;

    job.paused = false;
    this.saveJobs(jobs);

    if (job.enabled !== false) {
      this.scheduleJob(job);
    }

    this.log.info(`Job resumed: ${id}`);
    return true;
  }

  runJob(id: string): boolean {
    const jobs = this.loadJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job) return false;

    this.log.info(`Manual trigger: ${id}`);
    this.triggerJob(job);
    return true;
  }

  // ==========================================================================
  // Scheduling
  // ==========================================================================

  private scheduleJob(job: CronJob): void {
    const { schedule } = job;

    if (schedule.kind === "cron") {
      // Recurring cron expression
      const cron = new Cron(schedule.expr, { timezone: schedule.timezone }, () => {
        this.triggerJob(job);
      });
      this.active.set(job.id, { job, cron, timer: null });
      this.log.info(`Scheduled cron job: ${job.id} (${schedule.expr})`);
    } else if (schedule.kind === "at") {
      // One-shot at specific time
      const targetTime = new Date(schedule.expr).getTime();
      const delay = targetTime - Date.now();

      if (delay <= 0) {
        // Already past, trigger immediately
        this.triggerJob(job);
        this.removeJob(job.id);
        return;
      }

      const timer = setTimeout(() => {
        this.triggerJob(job);
        this.removeJob(job.id); // One-shot: auto-remove after trigger
      }, delay);

      this.active.set(job.id, { job, cron: null, timer });
      this.log.info(`Scheduled one-shot job: ${job.id} (at ${schedule.expr}, in ${Math.round(delay / 1000)}s)`);
    } else if (schedule.kind === "every") {
      // Recurring interval (e.g. "30m", "1h", "5s")
      const intervalMs = parseInterval(schedule.expr);
      if (!intervalMs) {
        this.log.error(`Invalid interval for job ${job.id}: ${schedule.expr}`);
        return;
      }

      const tick = () => {
        this.triggerJob(job);
      };
      const timer = setInterval(tick, intervalMs);
      this.active.set(job.id, { job, cron: null, timer: timer as any });
      this.log.info(`Scheduled interval job: ${job.id} (every ${schedule.expr})`);
    }
  }

  private triggerJob(job: CronJob): void {
    const agentId = job.agentId ?? this.config?.agents?.default ?? "main";

    if (job.mode === "main") {
      this.triggerMainMode(job, agentId);
    } else {
      this.triggerIsolatedMode(job, agentId);
    }

    if (job.deleteAfterRun) {
      this.removeJob(job.id);
    }
  }

  /**
   * Main mode: inject system event into the agent's main session,
   * then wake heartbeat to process it.
   */
  private triggerMainMode(job: CronJob, agentId: string): void {
    const mainSessionKey = resolveMainSessionKey(agentId);
    const eventText = `[CRON:${job.id}] ${job.payload.text}`;

    if (!this.systemEvents) {
      this.log.warn(`[cron:${job.id}] main mode requires systemEvents queue — falling back to isolated`);
      this.triggerIsolatedMode(job, agentId);
      return;
    }

    this.systemEvents.inject(mainSessionKey, eventText);
    this.log.info(`[cron:${job.id}] Injected system event for main session ${mainSessionKey}`);

    if (this.heartbeatWake) {
      this.heartbeatWake(agentId);
    } else {
      this.log.warn(`[cron:${job.id}] main mode without heartbeatWake — falling back to isolated mode`);
      // Fallback: remove injected event and run as isolated
      this.systemEvents?.consume(mainSessionKey);
      this.triggerIsolatedMode(job, agentId);
      return;
    }

    this.recordRun({
      jobId: job.id,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      durationMs: 0,
      status: "completed",
      resultPreview: "(injected to main session via system event)",
    });
  }

  /**
   * Isolated mode: dispatch message to a dedicated cron session.
   */
  private triggerIsolatedMode(job: CronJob, agentId: string): void {
    const sessionKey = job.sessionKey ?? `cron:${job.id}`;
    const text = `[CRON:${job.id}] Execute this task now:\n${job.payload.text}\n\nIMPORTANT: If the task contains a shell command, run it with bash immediately. Do not just describe or acknowledge it.`;
    const startedAt = Date.now();

    this.log.info(`Triggering job: ${job.id} → agent ${agentId}, session ${sessionKey}`);

    let responseText = "";
    const respond = async (text: string) => { responseText = text; };

    const timeoutMs = job.timeoutMs ?? this.config?.delegation?.timeoutMs ?? 120_000;

    const run = async () => {
      try {
        await Promise.race([
          this.dispatcher.dispatch({
            source: {
              channel: "cron",
              chatType: "dm",
              chatId: job.id,
              senderId: "cron",
              senderName: "Cron Scheduler",
              agentId,
            },
            sessionKey,
            text,
            respond,
            setTyping: async () => {},
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("CRON_TIMEOUT")), timeoutMs),
          ),
        ]);

        const delivery = resolveDelivery(job.delivery);
        // Skip delivery for HEARTBEAT_OK-only responses (OpenClaw pattern:
        // strip token, check remaining length — short acks are not worth delivering)
        const stripped = responseText.replace(/HEARTBEAT_OK/gi, "").trim();
        const isAckOnly = stripped.length < 300;
        if (delivery.mode !== "silent" && responseText && !isAckOnly && this.announcer) {
          await this.announcer.deliver(agentId, `[CRON:${job.id}] ${responseText}`, delivery, sessionKey);
        }

        this.recordRun({ jobId: job.id, startedAt, finishedAt: Date.now(), durationMs: Date.now() - startedAt, status: "completed", resultPreview: responseText.slice(0, 200) });
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === "CRON_TIMEOUT";
        this.log.error(`Job ${job.id} ${isTimeout ? "timed out" : "failed"}: ${err}`);
        this.recordRun({ jobId: job.id, startedAt, finishedAt: Date.now(), durationMs: Date.now() - startedAt, status: isTimeout ? "timeout" : "error", error: String(err) });
      }
    };

    run();
  }

  // ==========================================================================
  // Run History
  // ==========================================================================

  private recordRun(record: CronRunRecord): void {
    try {
      if (!existsSync(this.runsDir)) mkdirSync(this.runsDir, { recursive: true });
      const filePath = join(this.runsDir, `${record.jobId}.jsonl`);
      appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
    } catch (err) {
      this.log.warn(`Failed to record run for ${record.jobId}: ${err}`);
    }
  }

  getRunHistory(jobId: string, limit = 20): CronRunRecord[] {
    const filePath = join(this.runsDir, `${jobId}.jsonl`);
    if (!existsSync(filePath)) return [];
    try {
      const lines = readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l));
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private loadJobs(): CronJob[] {
    if (!existsSync(this.jobsPath)) return [];
    try {
      return JSON.parse(readFileSync(this.jobsPath, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveJobs(jobs: CronJob[]): void {
    const dir = dirname(this.jobsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.jobsPath, JSON.stringify(jobs, null, 2), "utf-8");
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Parse interval string like "30s", "5m", "1h", "2d" to milliseconds. */
function parseInterval(expr: string): number | null {
  const match = expr.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}
