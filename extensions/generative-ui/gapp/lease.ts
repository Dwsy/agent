/**
 * Cross-process live-connection leases (instances=single enforcement).
 * File-backed under ~/.pi/gapp/_leases/ plus in-memory for the hub process.
 */

import { t } from "./i18n.js";


import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
export type GappInstances = "single" | "multi";

export interface GappLease {
  appId: string;
  sessionId: string;
  pid: number;
  openedAt: string;
  host?: string;
  instances: GappInstances;
}

function normalizeInstances(raw: unknown): GappInstances {
  return raw === "multi" ? "multi" : "single";
}

function leasesDir(): string {
  const globalRoot = process.env.GAPP_GLOBAL_DIR || join(homedir(), ".pi", "gapp");
  return process.env.GAPP_LEASES_DIR || join(globalRoot, "_leases");
}

function leasePath(appId: string): string {
  return join(leasesDir(), `${appId}.json`);
}

function parsePsElapsed(raw: string): number | null {
  const match = raw.trim().match(/^(?:(\d+)-)?((?:\d{1,2}:)?\d{1,2}:\d{2})$/);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const parts = match[2].split(":").map(Number);
  const seconds = parts.pop() ?? 0;
  const minutes = parts.pop() ?? 0;
  const hours = parts.pop() ?? 0;
  if (minutes > 59 || seconds > 59) return null;
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function pidAlive(pid: number, openedAt?: string): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }

  // `kill(pid, 0)` also succeeds for zombies and for unrelated processes that
  // later reuse a stale lease PID. On POSIX, `ps` lets us reject both cases.
  if (process.platform === "win32") return true;
  try {
    const raw = execFileSync("ps", ["-o", "stat=", "-o", "etime=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!raw) return false;
    const [stat, elapsedRaw] = raw.split(/\s+/, 2);
    if (/^Z/i.test(stat)) return false;

    const openedAtMs = openedAt ? Date.parse(openedAt) : Number.NaN;
    const elapsedMs = parsePsElapsed(elapsedRaw || "");
    if (Number.isFinite(openedAtMs) && elapsedMs != null) {
      const processStartedAt = Date.now() - elapsedMs;
      if (processStartedAt > openedAtMs + 5_000) return false;
    }
  } catch {
    // If process metadata cannot be read, preserve the old conservative
    // behaviour instead of stealing a potentially valid live lease.
  }
  return true;
}

export async function readLease(appId: string): Promise<GappLease | null> {
  try {
    const raw = JSON.parse(await readFile(leasePath(appId), "utf-8")) as GappLease;
    if (!raw?.appId || !raw.sessionId) return null;
    if (!pidAlive(raw.pid, raw.openedAt)) {
      await unlink(leasePath(appId)).catch(() => {});
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export async function listLeases(): Promise<GappLease[]> {
  try {
    await mkdir(leasesDir(), { recursive: true });
    const names = await readdir(leasesDir());
    const out: GappLease[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      const lease = await readLease(id);
      if (lease) out.push(lease);
    }
    return out;
  } catch {
    return [];
  }
}

export type AcquireLeaseResult =
  | { ok: true; lease: GappLease; replaced?: boolean }
  | {
      ok: false;
      code: "already_connected";
      message: string;
      lease: GappLease;
    };

/**
 * Acquire live lease for an app.
 * - same sessionId: refresh / replace (ok)
 * - multi instances: always ok (still records lease for presence)
 * - single + other live session: fail already_connected
 */
export async function acquireLease(input: {
  appId: string;
  sessionId: string;
  instances?: GappInstances | string;
  host?: string;
  pid?: number;
}): Promise<AcquireLeaseResult> {
  const instances = normalizeInstances(input.instances);
  const pid = input.pid ?? process.pid;
  const existing = await readLease(input.appId);

  if (existing && existing.sessionId !== input.sessionId && instances === "single") {
    if (pidAlive(existing.pid, existing.openedAt)) {
      return {
        ok: false,
        code: "already_connected",
        message: t({
          zh: `GAPP「${input.appId}」已在另一个会话中打开。强状态应用同时只允许一个 live 连接。请先关闭另一窗口，或在该会话中继续操作。`,
          en: `GAPP "${input.appId}" is already live in another session. Strong-state apps allow only one live connection. Close the other window or continue in that session.`,
        }),
        lease: existing,
      };
    }
  }

  const lease: GappLease = {
    appId: input.appId,
    sessionId: input.sessionId,
    pid,
    openedAt: new Date().toISOString(),
    host: input.host,
    instances,
  };

  await mkdir(leasesDir(), { recursive: true });
  await writeFile(leasePath(input.appId), JSON.stringify(lease, null, 2) + "\n", "utf-8");
  return {
    ok: true,
    lease,
    replaced: !!(existing && existing.sessionId === input.sessionId),
  };
}

export async function releaseLease(
  appId: string,
  options?: { sessionId?: string; force?: boolean },
): Promise<boolean> {
  const existing = await readLease(appId);
  if (!existing) {
    await unlink(leasePath(appId)).catch(() => {});
    return false;
  }
  if (options?.sessionId && existing.sessionId !== options.sessionId && !options.force) {
    return false;
  }
  await unlink(leasePath(appId)).catch(() => {});
  return true;
}

export function alreadyConnectedUserMessage(appId: string, lease: GappLease): string {
  const sid = lease.sessionId.slice(0, 8);
  return t({
    zh: `GAPP「${appId}」已在另一个会话中打开（session=${sid}… pid=${lease.pid}）。\n强状态应用同时只允许一个 live 连接。请先关闭另一窗口，或在该会话中继续操作。`,
    en: `GAPP "${appId}" is already live in another session (session=${sid}… pid=${lease.pid}).\nStrong-state apps allow only one live connection. Close the other window or continue in that session.`,
  });
}
