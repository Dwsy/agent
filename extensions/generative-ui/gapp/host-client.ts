/**
 * HTTP client for the persistent GAPP daemon on :54888.
 */

import { GAPP_HOST_BASE, GAPP_PATHS } from "./constants.js";
import { readHostToken } from "./auth.js";
import { ensureGappDaemon } from "./daemon-manager.js";
import type { GappInstances, GappLease, GappTool } from "./protocol.js";

async function requestOnce<T = any>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 8_000,
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = await readHostToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${GAPP_HOST_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function daemonIsUnreachable(error: unknown): boolean {
  const value = error as {
    name?: string;
    code?: string;
    cause?: { code?: string; name?: string };
  };
  if (value?.name === "AbortError" || value?.name === "TimeoutError") return false;
  const code = value?.code || value?.cause?.code;
  return (
    code === "ConnectionRefused" ||
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH"
  );
}

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 8_000,
  wakeOnFailure = true,
): Promise<{ status: number; data: T }> {
  try {
    return await requestOnce<T>(method, path, body, timeoutMs);
  } catch (error) {
    // Retry only when no daemon was listening. Retrying timeouts or reset
    // requests could duplicate a tool mutation that the server already began.
    if (!wakeOnFailure || !daemonIsUnreachable(error)) throw error;
    await ensureGappDaemon();
    return await requestOnce<T>(method, path, body, timeoutMs);
  }
}

export async function hostHealth(): Promise<any | null> {
  try {
    const { status, data } = await req("GET", GAPP_PATHS.health, undefined, 400, false);
    return status === 200 ? data : null;
  } catch {
    return null;
  }
}

export async function hostAcquireLease(input: {
  appId: string;
  sessionId: string;
  instances?: GappInstances;
  host?: string;
  cwd?: string;
  scope?: string;
  hasWindow?: boolean;
}): Promise<
  | { ok: true; lease: GappLease; replaced?: boolean }
  | { ok: false; code: "already_connected"; message: string; lease: GappLease }
  | { ok: false; code: "host_unavailable"; message: string }
> {
  try {
    const { status, data } = await req("PUT", GAPP_PATHS.lease(input.appId), {
      sessionId: input.sessionId,
      instances: input.instances ?? "single",
      host: input.host,
      pid: process.pid,
      cwd: input.cwd,
      scope: input.scope,
      hasWindow: input.hasWindow,
    });
    if (status === 200 && data?.ok) return data;
    if (status === 409) return data;
    return { ok: false, code: "host_unavailable", message: data?.error || `HTTP ${status}` };
  } catch (e) {
    return {
      ok: false,
      code: "host_unavailable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function hostRegisterSession(
  input: { sessionId: string; cwd?: string; bridgeBase?: string },
  wakeOnFailure = true,
): Promise<boolean> {
  try {
    const { status, data } = await req(
      "POST",
      GAPP_PATHS.sessions,
      { ...input, pid: process.pid },
      2_000,
      wakeOnFailure,
    );
    return status === 200 && data?.ok === true;
  } catch {
    return false;
  }
}

export async function hostUnregisterSession(sessionId: string): Promise<boolean> {
  try {
    const { status, data } = await req(
      "DELETE",
      GAPP_PATHS.session(sessionId),
      undefined,
      2_000,
      false,
    );
    return status === 200 && data?.ok === true;
  } catch {
    return false;
  }
}

export async function hostReleaseLease(appId: string, sessionId: string): Promise<boolean> {
  try {
    const { data } = await req("DELETE", GAPP_PATHS.lease(appId), { sessionId });
    return data?.ok === true;
  } catch {
    return false;
  }
}

export async function hostToolCatalog(
  appId: string,
  cwd?: string,
): Promise<{ live: boolean; tools: GappTool[] } | null> {
  try {
    const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    const { status, data } = await req("GET", GAPP_PATHS.tools(appId) + q);
    if (status === 200 && Array.isArray(data?.tools)) {
      return { live: data.live === true, tools: data.tools };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function hostListTools(appId: string, cwd?: string): Promise<GappTool[]> {
  return (await hostToolCatalog(appId, cwd))?.tools ?? [];
}

export async function hostCallTool(
  appId: string,
  tool: string,
  args?: Record<string, unknown>,
  cwd?: string,
): Promise<any> {
  const { data } = await req(
    "POST",
    GAPP_PATHS.call(appId),
    { tool, arguments: args ?? {}, cwd },
    20_000,
  );
  return data;
}

export async function hostCatalog(): Promise<any | null> {
  try {
    const { status, data } = await req("GET", GAPP_PATHS.root);
    return status === 200 ? data : null;
  } catch {
    return null;
  }
}

/** Open a daemon-owned window (CLI / external launchers). */
export async function hostOpenApp(
  appId: string,
  options: {
    cwd?: string;
    scope?: "project" | "global";
    versionId?: string;
    source?: string;
  } = {},
): Promise<any> {
  try {
    const { status, data } = await req("POST", GAPP_PATHS.open(appId), options, 20_000);
    return status === 200 ? data : { ok: false, error: data?.error || { message: `open failed (${status})` } };
  } catch (error) {
    return {
      ok: false,
      error: { code: "host_unavailable", message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** Write state through the daemon so live windows receive the push. */
export async function hostSetState(
  appId: string,
  state: unknown,
  options: { cwd?: string; merge?: boolean } = {},
): Promise<any> {
  const { status, data } = await req("PUT", GAPP_PATHS.state(appId), {
    state,
    merge: options.merge === true,
    cwd: options.cwd,
  }, 20_000);
  return status === 200 ? data : { ok: false, error: data?.error || { message: `set-state failed (${status})` } };
}

/** Hot reload: drop the daemon's cached tools.mjs (and optionally rebuild the window). */
export async function hostReloadApp(
  appId: string,
  options: { cwd?: string; window?: boolean } = {},
): Promise<{ ok: boolean; invalidated?: boolean; window?: string; warning?: string; error?: string }> {
  const { status, data } = await req("POST", GAPP_PATHS.reload(appId), options, 20_000);
  if (status !== 200 || !data?.ok) {
    return { ok: false, error: data?.error?.message || `reload failed (${status})` };
  }
  return data;
}
