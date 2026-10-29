import { open, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gappDaemonPaths, processIsAlive, resolveBunExecutable } from "./daemon-paths.js";

const paths = gappDaemonPaths();
const daemonEntry = fileURLToPath(new URL("./daemon.ts", import.meta.url));
const bun = resolveBunExecutable();
let child: ChildProcess | null = null;
let stopping = false;
let restartCount = 0;
let lastStartAt = 0;

function log(event: string, details: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ at: new Date().toISOString(), component: "gapp-supervisor", event, ...details }));
}

async function acquireSingleInstance(): Promise<boolean> {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const handle = await open(paths.supervisorLock, "wx", 0o600);
      try {
        await handle.writeFile(`${process.pid}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await writeFile(paths.supervisorPid, `${process.pid}\n`, { mode: 0o600 });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(
        (
          await readFile(paths.supervisorLock, "utf8").catch(() =>
            readFile(paths.supervisorPid, "utf8").catch(() => "0"),
          )
        ).trim(),
      );
      if (processIsAlive(pid)) return false;
      if (!pid) {
        const ageMs = Date.now() - (await stat(paths.supervisorLock).catch(() => ({ mtimeMs: 0 }))).mtimeMs;
        if (ageMs < 5_000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
      }
      await Promise.all([
        unlink(paths.supervisorLock).catch(() => {}),
        unlink(paths.supervisorPid).catch(() => {}),
      ]);
    }
  }
  return false;
}

async function cleanup() {
  const owner = Number((await readFile(paths.supervisorPid, "utf8").catch(() => "0")).trim());
  if (owner !== process.pid) return;
  await Promise.all([
    unlink(paths.supervisorLock).catch(() => {}),
    unlink(paths.supervisorPid).catch(() => {}),
    unlink(paths.daemonPid).catch(() => {}),
  ]);
}

function restartDelay(): number {
  const livedMs = Date.now() - lastStartAt;
  if (livedMs > 60_000) restartCount = 0;
  restartCount += 1;
  return Math.min(30_000, 250 * 2 ** Math.min(restartCount - 1, 7));
}

function startDaemon() {
  if (stopping) return;
  lastStartAt = Date.now();
  child = spawn(bun, [daemonEntry], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, GAPP_HOST_SUPERVISOR_PID: String(process.pid), GAPP_BUN_BIN: bun },
  });
  log("daemon_started", { pid: child.pid, restartCount });
  child.once("error", (error) => {
    log("daemon_spawn_error", { message: error.message });
  });
  child.once("close", (code, signal) => {
    const pid = child?.pid;
    child = null;
    void unlink(paths.daemonPid).catch(() => {});
    if (stopping) return;
    if (code === 0) {
      log("daemon_stopped_cleanly", { pid, signal });
      stopping = true;
      void cleanup().finally(() => process.exit(0));
      return;
    }
    const delayMs = restartDelay();
    log("daemon_restart_scheduled", { pid, code, signal, delayMs });
    setTimeout(startDaemon, delayMs);
  });
}

function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  const active = child;
  log("supervisor_stopping", { signal, childPid: active?.pid });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    void cleanup().finally(() => process.exit(0));
  };
  if (!active) {
    finish();
    return;
  }
  const force = setTimeout(() => active.kill("SIGKILL"), 5_000);
  const hardStop = setTimeout(finish, 5_500);
  active.once("close", () => {
    clearTimeout(force);
    clearTimeout(hardStop);
    finish();
  });
  active.kill("SIGTERM");
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => stop(signal));
}

if (!(await acquireSingleInstance())) process.exit(0);
log("supervisor_started", { pid: process.pid });
startDaemon();
