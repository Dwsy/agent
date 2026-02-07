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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createLogger, type Logger, type InboundMessage } from "./types.ts";
import type { CronJob } from "./config.ts";

// ============================================================================
// Types
// ============================================================================

export interface CronDispatcher {
  dispatch(msg: InboundMessage): Promise<void>;
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
  private log: Logger;

  constructor(
    private dataDir: string,
    private dispatcher: CronDispatcher,
  ) {
    this.jobsPath = join(dataDir, "cron", "jobs.json");
    this.log = createLogger("cron");
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    const jobs = this.loadJobs();
    this.log.info(`Starting cron engine with ${jobs.length} job(s)`);

    for (const job of jobs) {
      if (job.enabled === false) continue;
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

  listJobs(): CronJob[] {
    return this.loadJobs();
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
    const sessionKey = job.sessionKey ?? `cron:${job.id}`;
    const text = `[CRON:${job.id}] ${job.payload.text}`;

    this.log.info(`Triggering job: ${job.id} → session ${sessionKey}`);

    this.dispatcher.dispatch({
      source: {
        channel: "cron",
        chatType: "dm",
        chatId: job.id,
        senderId: "cron",
        senderName: "Cron Scheduler",
      },
      sessionKey,
      text,
      respond: async () => {},      // Cron jobs don't need a reply target
      setTyping: async () => {},
    }).catch((err) => {
      this.log.error(`Job ${job.id} dispatch failed:`, err);
    });
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
