import { accessSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function gappDaemonRoot(): string {
  const globalRoot = process.env.GAPP_GLOBAL_DIR || join(homedir(), ".pi", "gapp");
  return process.env.GAPP_HOST_STATE_DIR || join(globalRoot, "_host");
}

export function gappDaemonPaths() {
  const root = gappDaemonRoot();
  return {
    root,
    log: join(root, "gapp-host.log"),
    supervisorLock: join(root, "supervisor.lock"),
    supervisorPid: join(root, "supervisor.pid"),
    daemonPid: join(root, "daemon.pid"),
    status: join(root, "status.json"),
    sessions: join(root, "sessions.json"),
  };
}

export function resolveBunExecutable(): string {
  const configured = process.env.GAPP_BUN_BIN?.trim();
  if (configured) return configured;

  if ((process.versions as Record<string, string | undefined>).bun) {
    return process.execPath;
  }

  const bunGlobal = (globalThis as { Bun?: { which?: (name: string) => string | null } }).Bun;
  const fromRuntime = bunGlobal?.which?.("bun");
  if (fromRuntime) return fromRuntime;

  try {
    const resolved = execFileSync("/usr/bin/which", ["bun"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolved) return resolved;
  } catch {
    // Fall through to Bun's conventional install path.
  }

  const conventional = join(homedir(), ".bun", "bin", "bun");
  try {
    accessSync(conventional);
    return conventional;
  } catch {
    throw new Error(
      "Unable to find Bun. Set GAPP_BUN_BIN so Pi can launch the persistent GAPP daemon.",
    );
  }
}

export function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
