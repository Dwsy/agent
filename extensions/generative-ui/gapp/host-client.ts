/**
 * HTTP client for the shared GAPP hub on :54888 (when this process is not the hub,
 * or for uniform multipath access).
 */

import { GAPP_HOST_BASE, GAPP_PATHS } from "./constants.js";
import type { GappInstances, GappLease, GappTool } from "./protocol.js";

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 8_000,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${GAPP_HOST_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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

export async function hostHealth(): Promise<any | null> {
  try {
    const { status, data } = await req("GET", GAPP_PATHS.health, undefined, 400);
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

export async function hostReleaseLease(appId: string, sessionId: string): Promise<boolean> {
  try {
    const { data } = await req("DELETE", GAPP_PATHS.lease(appId), { sessionId });
    return data?.ok === true;
  } catch {
    return false;
  }
}

export async function hostListTools(appId: string, cwd?: string): Promise<GappTool[]> {
  try {
    const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    const { status, data } = await req("GET", GAPP_PATHS.tools(appId) + q);
    if (status === 200 && Array.isArray(data?.tools)) return data.tools;
  } catch {
    // ignore
  }
  return [];
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
