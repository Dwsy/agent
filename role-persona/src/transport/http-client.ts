/**
 * HTTP Client — talks to daemon via HTTP when running, falls back to subprocess.
 */

import { isDaemonRunning, readPort } from "./daemon.ts";

const TIMEOUT_MS = 30000;

export interface HttpResult {
  ok: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Send a request to the daemon HTTP API.
 */
export async function daemonRequest(path: string, body?: Record<string, any>, opts?: { timeoutMs?: number }): Promise<HttpResult> {
  const port = readPort();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs || TIMEOUT_MS);

  try {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return await res.json();
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, error: err.message || "Connection failed" };
  }
}

/**
 * Check if daemon is available (running + responding).
 */
export async function isDaemonAvailable(): Promise<boolean> {
  if (!isDaemonRunning()) return false;
  try {
    const port = readPort();
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
