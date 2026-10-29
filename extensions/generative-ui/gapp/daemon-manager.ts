import { closeSync, mkdirSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GAPP_HOST_BIND, GAPP_HOST_PORT } from "./constants.js";
import { gappDaemonPaths, resolveBunExecutable } from "./daemon-paths.js";

export interface GappDaemonHealth {
  ok: boolean;
  service: string;
  role?: string;
  mode?: string;
  pid?: number;
  port?: number;
  [key: string]: unknown;
}

export interface EnsureGappDaemonOptions {
  bind?: string;
  port?: number;
  stateDir?: string;
  startupTimeoutMs?: number;
  env?: Record<string, string>;
}

let startupInFlight: Promise<GappDaemonHealth> | null = null;

function healthUrl(bind: string, port: number): string {
  return `http://${bind}:${port}/health`;
}

export async function probeGappDaemon(
  options: Pick<EnsureGappDaemonOptions, "bind" | "port"> = {},
  timeoutMs = 350,
): Promise<GappDaemonHealth | null> {
  const bind = options.bind ?? GAPP_HOST_BIND;
  const port = options.port ?? GAPP_HOST_PORT;
  try {
    const response = await fetch(healthUrl(bind, port), {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as GappDaemonHealth;
    return data?.ok === true && data.service === "gapp-host" ? data : null;
  } catch {
    return null;
  }
}

async function startAndWait(options: EnsureGappDaemonOptions): Promise<GappDaemonHealth> {
  const bind = options.bind ?? GAPP_HOST_BIND;
  const port = options.port ?? GAPP_HOST_PORT;
  const existing = await probeGappDaemon({ bind, port });
  if (existing) return existing;

  const paths = gappDaemonPaths();
  const stateDir = options.stateDir ?? paths.root;
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const logPath = options.stateDir ? `${stateDir}/gapp-host.log` : paths.log;
  const logFd = openSync(logPath, "a", 0o600);
  const bun = resolveBunExecutable();
  const supervisor = fileURLToPath(new URL("./daemon-supervisor.ts", import.meta.url));
  try {
    const child = spawn(bun, [supervisor], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        ...options.env,
        GAPP_HOST_BIND: bind,
        GAPP_HOST_PORT: String(port),
        GAPP_HOST_BASE: `http://${bind}:${port}`,
        GAPP_HOST_STATE_DIR: stateDir,
        GAPP_BUN_BIN: bun,
      },
    });
    // A failed detached spawn would otherwise emit an unhandled EventEmitter
    // error in Pi. The health wait below turns it into a normal startup error
    // with the log path attached.
    child.once("error", () => {});
    child.unref();
  } finally {
    closeSync(logFd);
  }

  const timeoutMs = options.startupTimeoutMs ?? 6_000;
  const deadline = Date.now() + timeoutMs;
  let lastHealth: GappDaemonHealth | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    lastHealth = await probeGappDaemon({ bind, port }, 500);
    if (lastHealth) return lastHealth;
  }
  throw new Error(
    `GAPP daemon did not become healthy on ${bind}:${port}${
      lastHealth ? ` (last role=${lastHealth.role ?? "unknown"})` : ""
    }. See ${logPath}`,
  );
}

/** Start the detached supervisor once. Every call probes first so an idle-exited daemon can be woken again. */
export async function ensureGappDaemon(
  options: EnsureGappDaemonOptions = {},
): Promise<GappDaemonHealth> {
  if (startupInFlight) return startupInFlight;
  startupInFlight = startAndWait(options);
  try {
    return await startupInFlight;
  } finally {
    startupInFlight = null;
  }
}
