import { describe, it, expect } from "bun:test";
import { CronEngine } from "./cron.ts";
import type { Config, CronJob } from "./config.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cron completion sync [v3.7]", () => {
  it("marks completed only after respond callback", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cron-sync-test-"));

    try {
      const cron = new CronEngine(
        dataDir,
        {
          dispatch: async (msg: any) => {
            setTimeout(() => {
              void msg.respond("CRON_SYNC_OK");
            }, 60);
          },
        } as any,
        {
          agents: { default: "main", list: [{ id: "main", role: "default" as const }] },
          delegation: {
            timeoutMs: 1000,
            maxTimeoutMs: 2000,
            onTimeout: "abort",
            maxDepth: 1,
            maxConcurrent: 1,
          },
        } as Config,
      );

      const futureAt = new Date(Date.now() + 60_000).toISOString();
      const job: CronJob = {
        id: "sync-one-shot",
        schedule: { kind: "at", expr: futureAt },
        payload: { text: "sync check" },
      };

      cron.addJob(job);
      expect(cron.runJob(job.id)).toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      expect(cron.listJobs().some((j) => j.id === job.id)).toBe(true);

      await new Promise((r) => setTimeout(r, 120));
      expect(cron.listJobs().some((j) => j.id === job.id)).toBe(false);

      const runs = cron.getRunHistory(job.id, 1);
      expect(runs.length).toBe(1);
      expect(runs[0].status).toBe("completed");
      expect(runs[0].durationMs).toBeGreaterThanOrEqual(50);

      cron.stop();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
