import { mkdir, unlink, writeFile } from "node:fs/promises";
import { GAPP_HOST_PORT } from "./constants.js";
import { MemoryGuard, envNumber } from "./daemon-health.js";
import { gappDaemonPaths } from "./daemon-paths.js";
import {
  getHostRuntimeState,
  setHostLifecycleDetailsProvider,
  startGappHostServer,
  stopGappHostServer,
} from "./host-server.js";
import { setHostSessionId, listGenerateJobs, listLiveApps } from "./registry.js";
import { stopAllSubagents, subagentPoolStatus } from "./subagent.js";

const MIB = 1024 * 1024;
const paths = gappDaemonPaths();
const idleMs = envNumber("GAPP_HOST_IDLE_MS", 3 * 60 * 60 * 1000, 100);
const checkMs = envNumber("GAPP_HOST_MONITOR_MS", 60_000, 50);
const maxRssBytes = envNumber("GAPP_HOST_MAX_RSS_MB", 768, 16) * MIB;
const guard = new MemoryGuard({
  maxRssBytes,
  maxRssConsecutive: envNumber("GAPP_HOST_MAX_RSS_SAMPLES", 3, 1),
  leakWindow: envNumber("GAPP_HOST_LEAK_WINDOW", 12, 4),
  leakGrowthBytes: envNumber("GAPP_HOST_LEAK_GROWTH_MB", 192, 1) * MIB,
  leakHeapGrowthBytes: envNumber("GAPP_HOST_LEAK_HEAP_GROWTH_MB", 96, 1) * MIB,
  leakMinimumRssBytes: envNumber("GAPP_HOST_LEAK_MIN_RSS_MB", 256, 1) * MIB,
  monotonicRatio: Math.min(1, envNumber("GAPP_HOST_LEAK_MONOTONIC_RATIO", 0.75, 0)),
});

let shuttingDown = false;
let lastMemory = process.memoryUsage();

function log(event: string, details: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ at: new Date().toISOString(), component: "gapp-daemon", event, ...details }));
}

async function writeStatus(state: string, details: Record<string, unknown> = {}) {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await writeFile(
    paths.status,
    `${JSON.stringify({ at: new Date().toISOString(), state, pid: process.pid, ...details }, null, 2)}\n`,
    { mode: 0o600 },
  ).catch(() => {});
}

function hasBackgroundWork(): boolean {
  const jobs = listGenerateJobs().some((job) => job.status === "queued" || job.status === "running");
  const pool = subagentPoolStatus();
  // GAPP windows opened through this daemon die with it (stdin EOF), so an idle
  // shutdown is only safe when no window is still on screen.
  return jobs || pool.active > 0 || pool.waiting > 0 || listLiveApps().length > 0;
}

async function shutdown(reason: string, exitCode: number, details: Record<string, unknown> = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown", { reason, exitCode, ...details });
  await writeStatus(reason, { exitCode, ...details });
  await stopAllSubagents();
  await stopGappHostServer().catch(() => {});
  await unlink(paths.daemonPid).catch(() => {});
  process.exit(exitCode);
}

setHostSessionId(`gapp-daemon-${process.pid}`);
await mkdir(paths.root, { recursive: true, mode: 0o700 });
await writeFile(paths.daemonPid, `${process.pid}\n`, { mode: 0o600 });

setHostLifecycleDetailsProvider(() => ({
  idleTimeoutMs: idleMs,
  monitorIntervalMs: checkMs,
  maxRssBytes,
  supervisorPid: Number(process.env.GAPP_HOST_SUPERVISOR_PID || 0) || undefined,
  memory: lastMemory,
  memorySamples: guard.snapshot().length,
  backgroundWork: hasBackgroundWork(),
}));

const info = await startGappHostServer({ port: GAPP_HOST_PORT, mode: "daemon" });
if (info.role !== "daemon") {
  log("existing_host_detected", { role: info.role, port: info.port });
  await unlink(paths.daemonPid).catch(() => {});
  process.exit(0);
}

log("ready", { pid: process.pid, port: info.port, idleMs, maxRssBytes });
await writeStatus("running", { port: info.port, idleMs, maxRssBytes });

const monitor = setInterval(() => {
  void (async () => {
    if (shuttingDown) return;
    const now = Date.now();
    const runtime = getHostRuntimeState();
    lastMemory = process.memoryUsage();
    const decision = guard.observe({
      at: now,
      rss: lastMemory.rss,
      heapUsed: lastMemory.heapUsed,
      external: lastMemory.external,
    });
    if (decision.restart) {
      await shutdown("memory_restart", 75, {
        message: decision.reason,
        ...(decision.details || {}),
      });
      return;
    }
    if (
      runtime.activeRequests === 0 &&
      !hasBackgroundWork() &&
      now - runtime.lastActivityAt >= idleMs
    ) {
      await shutdown("idle_timeout", 0, { idleForMs: now - runtime.lastActivityAt });
    }
  })().catch((error) => log("monitor_error", { message: error instanceof Error ? error.message : String(error) }));
}, checkMs);
monitor.unref?.();

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    // A signal sent directly to the daemon is treated as an abnormal stop so
    // the supervisor replaces it. When the supervisor itself is stopping its
    // local `stopping` flag suppresses that restart.
    void shutdown(`signal_${signal}`, 77);
  });
}

process.on("uncaughtException", (error) => {
  log("uncaught_exception", { message: error.message, stack: error.stack });
  void shutdown("uncaught_exception", 76);
});
process.on("unhandledRejection", (reason) => {
  log("unhandled_rejection", { message: reason instanceof Error ? reason.message : String(reason) });
  void shutdown("unhandled_rejection", 76);
});
