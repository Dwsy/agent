/** cron tool — manage gateway scheduled tasks. */

import { Type } from "@sinclair/typebox";
import { cronOk, cronError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

export function createCronTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "cron",
    label: "Cron",
    description:
      "Manage gateway scheduled tasks (cron jobs) and send wake events. " +
      "Actions: list (show all jobs), add (create job), remove (delete job), " +
      "pause/resume (toggle job), run (trigger immediately), wake (inject system event), " +
      "update (modify existing job), runs (view execution history), status (engine stats).\n\n" +
      "SCHEDULE TYPES (schedule.kind):\n" +
      '- "cron": Standard cron expression, e.g. "0 */6 * * *"\n' +
      '- "every": Interval, e.g. "30m", "2h", "1d"\n' +
      '- "at": One-shot ISO 8601 datetime (fires once)\n\n' +
      "MODE:\n" +
      '- "isolated" (default): Runs in independent session\n' +
      '- "main": Injects as system event into main session\n\n' +
      "WAKE:\n" +
      "Inject a system event into the main session. " +
      'mode "next-heartbeat" (default) queues for next heartbeat; "now" triggers immediately.\n\n' +
      "EXAMPLES:\n" +
      '- List: { action: "list" }\n' +
      '- Add hourly task: { action: "add", id: "backup", schedule: { kind: "every", expr: "1h" }, task: "Run backup check" }\n' +
      '- Add cron: { action: "add", id: "morning", schedule: { kind: "cron", expr: "0 9 * * *" }, task: "Morning briefing" }\n' +
      '- One-shot reminder: { action: "add", id: "remind-1", schedule: { kind: "at", expr: "2026-02-13T10:00:00Z" }, task: "Remind user about meeting", deleteAfterRun: true }\n' +
      '- Remove: { action: "remove", id: "backup" }\n' +
      '- Pause: { action: "pause", id: "morning" }\n' +
      '- Run now: { action: "run", id: "backup" }\n' +
      '- Wake now: { action: "wake", text: "Check email for urgent items", wakeMode: "now" }\n' +
      '- Wake next: { action: "wake", text: "Review pending PRs" }',
    parameters: Type.Object({
      action: Type.String({
        enum: ["list", "add", "remove", "pause", "resume", "run", "wake", "update", "runs", "status"],
        description: "Action to perform",
      }),
      id: Type.Optional(
        Type.String({ description: "Job ID — required for add/remove/pause/resume/run" }),
      ),
      schedule: Type.Optional(
        Type.Object(
          {
            kind: Type.String({
              enum: ["cron", "every", "at"],
              description: "Schedule type",
            }),
            expr: Type.String({ description: 'Schedule expression (cron: "0 */6 * * *", every: "30m", at: ISO 8601)' }),
            timezone: Type.Optional(Type.String({ description: "Timezone for cron expressions (e.g. Asia/Shanghai)" })),
          },
          { description: "Schedule — required for add" },
        ),
      ),
      task: Type.Optional(
        Type.String({ description: "Task description text — required for add" }),
      ),
      mode: Type.Optional(
        Type.String({
          enum: ["isolated", "main"],
          description: 'Execution mode. Default: "isolated"',
        }),
      ),
      delivery: Type.Optional(
        Type.String({
          enum: ["announce", "direct", "silent"],
          description: 'Result delivery mode. "announce" (default) = retell via main session, "direct" = send raw to channel, "silent" = log only',
        }),
      ),
      deleteAfterRun: Type.Optional(
        Type.Boolean({ description: "Remove job after first execution. Default: false" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Number of run records to return (runs action, default: 20, max: 100)" }),
      ),
      wakeMode: Type.Optional(
        Type.String({
          enum: ["now", "next-heartbeat"],
          description: 'Wake mode — "now" triggers immediately, "next-heartbeat" (default) queues for next heartbeat. Only for wake action.',
        }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { action, id, schedule, task, mode, delivery, deleteAfterRun, wakeMode, limit } = params as {
        action: string;
        id?: string;
        schedule?: { kind: string; expr: string; timezone?: string };
        task?: string;
        mode?: string;
        delivery?: string;
        deleteAfterRun?: boolean;
        wakeMode?: string;
        limit?: number;
      };

      try {
        switch (action) {
          case "list": {
            const res = await fetch(`${gatewayUrl}/api/cron/jobs`, {
              headers: gatewayHeaders(authToken ?? internalToken),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(data.error || res.statusText);
            const jobs = data.jobs ?? [];
            return cronOk(
              jobs.length === 0
                ? "No scheduled jobs."
                : `${jobs.length} job(s):\n${JSON.stringify(jobs, null, 2)}`,
            );
          }

          case "add": {
            if (!id) return cronError("id is required for add");
            if (!schedule) return cronError("schedule is required for add");
            if (!task) return cronError("task is required for add");

            const res = await fetch(`${gatewayUrl}/api/cron/jobs`, {
              method: "POST",
              headers: gatewayHeaders(authToken ?? internalToken, true),
              body: JSON.stringify({
                id,
                schedule,
                task,
                mode: mode || "isolated",
                delivery: delivery || "announce",
                deleteAfterRun: deleteAfterRun ?? false,
              }),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Job "${id}" created (${schedule.kind}: ${schedule.expr})`);
          }

          case "remove": {
            if (!id) return cronError("id is required for remove");
            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
              method: "DELETE",
              headers: gatewayHeaders(authToken ?? internalToken),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Job "${id}" removed.`);
          }

          case "pause":
          case "resume": {
            if (!id) return cronError(`id is required for ${action}`);
            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
              method: "PATCH",
              headers: gatewayHeaders(authToken ?? internalToken, true),
              body: JSON.stringify({ action }),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Job "${id}" ${action}d.`);
          }

          case "run": {
            if (!id) return cronError("id is required for run");
            const res = await fetch(
              `${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}/run`,
              {
                method: "POST",
                headers: gatewayHeaders(authToken ?? internalToken),
              },
            );
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Job "${id}" triggered.`);
          }

          case "wake": {
            if (!task) return cronError("task (text) is required for wake");
            const res = await fetch(`${gatewayUrl}/api/wake`, {
              method: "POST",
              headers: gatewayHeaders(authToken ?? internalToken, true),
              body: JSON.stringify({
                text: task,
                mode: wakeMode || "next-heartbeat",
              }),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            const modeLabel = (data.mode || wakeMode || "next-heartbeat") as string;
            return cronOk(
              modeLabel === "now"
                ? `Wake event injected and heartbeat triggered.`
                : `Wake event queued for next heartbeat.`,
            );
          }

          case "update": {
            if (!id) return cronError("id is required for update");
            const patch: Record<string, unknown> = { action: "update" };
            if (schedule) patch.schedule = schedule;
            if (task) patch.task = task;
            if (mode) patch.mode = mode;
            if (delivery) patch.delivery = delivery;
            if (deleteAfterRun != null) patch.deleteAfterRun = deleteAfterRun;

            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
              method: "PATCH",
              headers: gatewayHeaders(authToken ?? internalToken, true),
              body: JSON.stringify(patch),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Job "${id}" updated.`);
          }

          case "runs": {
            if (!id) return cronError("id is required for runs");
            const l = Math.min(limit ?? 20, 100);
            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}/runs?limit=${l}`, {
              headers: gatewayHeaders(authToken ?? internalToken),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            const runs = (data.runs as unknown[]) ?? [];
            return cronOk(
              runs.length === 0
                ? `No run history for "${id}".`
                : `${runs.length} run(s) for "${id}":\n${JSON.stringify(runs, null, 2)}`,
            );
          }

          case "status": {
            const res = await fetch(`${gatewayUrl}/api/cron/status`, {
              headers: gatewayHeaders(authToken ?? internalToken),
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return cronError(String(data.error || res.statusText));
            return cronOk(`Cron engine: ${JSON.stringify(data, null, 2)}`);
          }

          default:
            return cronError(`Unknown action: ${action}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return cronError(message);
      }
    },
  };
}
