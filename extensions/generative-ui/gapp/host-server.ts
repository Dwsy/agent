/**
 * GAPP host control plane — single port (default 54888), multipath routes.
 *
 *   GET  /health
 *   GET  /v1/gapp
 *   GET|POST /v1/gapp/sessions
 *   GET|PUT|DELETE /v1/gapp/leases/:appId
 *   POST /v1/gapp/apps/:appId/open   (host-owned window: open/run a GAPP)
 *   POST /v1/gapp/apps/:appId/window (focus | close)
 *   GET|PUT /v1/gapp/apps/:appId/tools
 *   POST /v1/gapp/apps/:appId/call
 *   POST /v1/gapp/apps/:appId/rpc (private, no browser CORS)
 *   GET|PUT /v1/gapp/apps/:appId/state
 *   POST /v1/gapp/apps/:appId/events
 *   POST /v1/gapp/apps/:appId/generate
 *   GET  /v1/gapp/apps/:appId/generate/:requestId
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAPP_HOST_BIND, GAPP_HOST_PORT, GAPP_HTTP_PREFIX, GAPP_PATHS } from "./constants.js";
import { ensureHostToken, verifyHostToken } from "./auth.js";
import { acquireLease, listLeases, readLease, releaseLease } from "./lease.js";
import { gappDaemonPaths } from "./daemon-paths.js";
import {
  dispatchToolCallToWindow,
  getGenerateJob,
  getHostSessionId,
  getLiveApp,
  getMergedTools,
  listLiveApps,
  clearLiveTools,
  setLiveTools,
  getAgentBridge,
  pushStateToWindow,
} from "./registry.js";
import { dispatchGenerate } from "./generate.js";
import { loadGappToolsFile, setGappState, resolveGapp, loadGappBundle, gappProjectScanCwds, importGappSdk } from "./storage.js";
import { applyStateOps } from "./stateops.js";
import { executeGappToolModule } from "./tool-module.js";
import { dispatchHostRpc } from "./host-rpc.js";
import {
  defaultEventPrompt,
  mergeToolLists,
  normalizeInstances,
  validateToolDescriptor,
  type GappInstances,
  type GappTool,
} from "./protocol.js";

export type HostRole = "daemon" | "hub" | "client" | "stopped";
export type HostMode = "daemon" | "embedded";

interface HostSession {
  sessionId: string;
  pid: number;
  cwd?: string;
  bridgeBase?: string;
  joinedAt: string;
  lastSeenAt: string;
}

interface RemoteLiveApp {
  appId: string;
  sessionId: string;
  cwd?: string;
  scope?: string;
  instances: GappInstances;
  tools: GappTool[];
  revision: number;
  updatedAt: string;
  hasWindow?: boolean;
}

let server: Server | null = null;
let role: HostRole = "stopped";
let mode: HostMode = "embedded";
let boundPort = GAPP_HOST_PORT;
let hostToken: string | null = null;
let lastActivityAt = Date.now();
let activeRequests = 0;
let lifecycleDetailsProvider: (() => Record<string, unknown>) | null = null;

const MAX_HOST_RPC_BODY_BYTES = 24 * 1024 * 1024;
const sessions = new Map<string, HostSession>();
const remoteApps = new Map<string, RemoteLiveApp>();
let sessionsLoaded = false;
let persistSessionsTail: Promise<void> = Promise.resolve();
let persistSessionsRevision = 0;

function sessionStorePath(): string {
  return gappDaemonPaths().sessions;
}

async function loadPersistedSessions(): Promise<void> {
  if (sessionsLoaded) return;
  sessionsLoaded = true;
  try {
    const rows = JSON.parse(await readFile(sessionStorePath(), "utf8"));
    if (!Array.isArray(rows)) return;
    for (const value of rows) {
      if (!value || typeof value !== "object") continue;
      const sessionId = String(value.sessionId || "");
      const pid = Number(value.pid);
      if (!sessionId || !Number.isInteger(pid) || pid <= 0) continue;
      sessions.set(sessionId, {
        sessionId,
        pid,
        cwd: typeof value.cwd === "string" ? value.cwd : undefined,
        bridgeBase: normalizeBridgeBase(value.bridgeBase),
        joinedAt: typeof value.joinedAt === "string" ? value.joinedAt : new Date().toISOString(),
        lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : new Date().toISOString(),
      });
    }
  } catch {
    // First start, or a previous partial file. Heartbeats repopulate it.
  }
}

function persistSessions(): Promise<void> {
  const path = sessionStorePath();
  const revision = ++persistSessionsRevision;
  const temporary = `${path}.${process.pid}.${revision}.tmp`;
  const snapshot = `${JSON.stringify([...sessions.values()], null, 2)}\n`;
  persistSessionsTail = persistSessionsTail
    .catch(() => {})
    .then(async () => {
      await mkdir(gappDaemonPaths().root, { recursive: true, mode: 0o700 });
      try {
        await writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
  return persistSessionsTail;
}

function normalizeBridgeBase(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return undefined;
    if (url.hostname !== "127.0.0.1" && url.hostname !== "::1" && url.hostname !== "localhost") {
      return undefined;
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function setHostLifecycleDetailsProvider(
  provider: (() => Record<string, unknown>) | null,
): void {
  lifecycleDetailsProvider = provider;
}

export function getHostRuntimeState(): {
  mode: HostMode;
  role: HostRole;
  lastActivityAt: number;
  activeRequests: number;
} {
  return { mode, role, lastActivityAt, activeRequests };
}

function markActivity() {
  lastActivityAt = Date.now();
}

function isSessionLifecycleRequest(method: string | undefined, path: string): boolean {
  return (
    (method === "POST" && path === GAPP_PATHS.sessions) ||
    (method === "DELETE" && path.startsWith(`${GAPP_PATHS.sessions}/`))
  );
}

function isPassiveLifecycleRequest(req: IncomingMessage): boolean {
  try {
    const path = new URL(req.url || "/", `http://${GAPP_HOST_BIND}:${boundPort}`).pathname;
    return (
      (req.method === "GET" && (path === "/health" || path === GAPP_PATHS.health)) ||
      isSessionLifecycleRequest(req.method, path)
    );
  } catch {
    return false;
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    // Null-origin WebViews need CORS; actual access control is the bearer token,
    // which browser pages cannot read from disk.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(data);
}

function isAuthorized(req: IncomingMessage): boolean {
  return hostToken !== null && verifyHostToken(req.headers.authorization, hostToken);
}

/**
 * Callers may only point `cwd` at the process cwd, a registered gapp project,
 * or a live app's cwd — never an arbitrary directory (tools.mjs executes from there).
 */
async function assertAllowedCwd(cwd: unknown): Promise<string | undefined> {
  if (cwd === undefined || cwd === null || cwd === "") return undefined;
  if (typeof cwd !== "string") throw new Error("cwd must be a string");
  const requested = resolve(cwd);
  const known = new Set(
    [
      ...(await gappProjectScanCwds(process.cwd())),
      ...listLiveApps().map((a) => a.cwd),
      ...[...sessions.values()].map((session) => session.cwd),
      ...[...remoteApps.values()].map((app) => app.cwd),
    ]
      .filter((c): c is string => typeof c === "string" && c.length > 0)
      .map((c) => resolve(c)),
  );
  if (!known.has(requested)) {
    throw new Error(`cwd not allowed: ${cwd}. Register the project first (open a gapp from it).`);
  }
  return requested;
}

function privateJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req: IncomingMessage, maxBytes = Number.POSITIVE_INFINITY): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on("data", (value) => {
      if (failed) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.byteLength;
      if (size > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!failed) resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", reject);
  });
}

async function parseJson(req: IncomingMessage, maxBytes?: number): Promise<any> {
  const raw = await readBody(req, maxBytes);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function matchPath(urlPath: string, pattern: string): Record<string, string> | null {
  const a = urlPath.split("/").filter(Boolean);
  const b = pattern.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(":")) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

class SessionDispatchError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "SessionDispatchError";
    this.code = code;
    this.status = status;
  }
}

async function sessionForApp(appId: string): Promise<HostSession | null> {
  const cached = remoteApps.get(appId);
  if (cached) {
    const session = sessions.get(cached.sessionId);
    if (session?.bridgeBase) return session;
  }
  const lease = await readLease(appId);
  if (!lease) return null;
  const session = sessions.get(lease.sessionId);
  return session?.bridgeBase ? session : null;
}

async function dispatchToSession<T = unknown>(
  appId: string,
  operation: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<T> {
  const session = await sessionForApp(appId);
  if (!session?.bridgeBase) {
    throw new SessionDispatchError(
      "needs_live_handler",
      `No live Pi session bridge is available for ${appId}`,
    );
  }
  if (!hostToken) throw new SessionDispatchError("host_unavailable", "Host token unavailable", 503);

  let response: Response;
  try {
    response = await fetch(`${session.bridgeBase}/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({ operation, appId, ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SessionDispatchError(
      "needs_live_handler",
      `Pi session ${session.sessionId} is unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: { code: "invalid_response", message: text || "empty response" } };
  }
  if (!response.ok || data?.ok !== true) {
    throw new SessionDispatchError(
      String(data?.error?.code || "handler_error"),
      String(data?.error?.message || `Pi bridge HTTP ${response.status}`),
      response.status,
    );
  }
  return data.result as T;
}

function selfHostBase(): string {
  return `http://${GAPP_HOST_BIND}:${boundPort}`;
}

/**
 * Open a GAPP window owned by this host process. External launchers (Raycast,
 * CLI) go through this route so the window outlives the caller and stays
 * reachable through the control plane.
 */
async function openHostWindow(
  appId: string,
  options: { cwd?: string; scope?: "project" | "global"; sessionId?: string; versionId?: string; source?: string },
): Promise<{ ok: true; appId: string; sessionId: string; scope: string; versionId?: string }> {
  const [{ loadGlimpseui }, open, sdk] = await Promise.all([
    import("../html-helpers.js"),
    import("./open.js"),
    importGappSdk(),
  ]);

  const versionId = options.versionId?.trim() || undefined;
  let bundle: any = null;
  if (versionId) {
    const snap = sdk?.loadVersion
      ? await sdk.loadVersion(appId, versionId, { cwd: options.cwd })
      : null;
    if (!snap) throw new open.GappOpenError("not_found", `Version not found: ${versionId}`);
    bundle = { meta: snap.meta, state: snap.state, html: snap.html, dir: snap.dir };
  } else {
    bundle = options.scope
      ? await loadGappBundle(options.scope, appId, options.cwd ?? process.cwd())
      : await resolveGapp(appId, options.cwd ?? process.cwd());
    if (!bundle) throw new open.GappOpenError("not_found", `GAPP not found: ${appId}`);
  }

  // Native window support is only needed once the app is known to exist.
  await loadGlimpseui();

  const sessionId = options.sessionId || getHostSessionId();
  await open.openGappBundle(bundle, undefined, {
    cwd: bundle.meta.cwd || options.cwd || process.cwd(),
    sessionId,
    hostBase: selfHostBase(),
  });

  // Version previews are not real runs; keep "Run Last GAPP" honest.
  if (!versionId && sdk?.recordRun) {
    await sdk
      .recordRun(appId, {
        scope: bundle.meta.scope,
        cwd: bundle.meta.cwd || options.cwd,
        source: options.source || "host-open",
      })
      .catch(() => {});
  }

  return {
    ok: true,
    appId,
    sessionId,
    scope: bundle.meta.scope,
    ...(versionId ? { versionId } : {}),
  };
}

/** Focus/close a live GAPP window: local when this process owns it, else via the owning Pi session bridge. */
async function controlHostWindow(
  appId: string,
  action: "focus" | "close",
): Promise<{ ok: true; appId: string; action: string; via: string }> {
  const open = await import("./open.js");
  const win = open.getOpenGappWindow(appId);
  if (win) {
    if (action === "focus") win.show();
    else open.closeGappWindow(appId);
    return { ok: true, appId, action, via: "host" };
  }
  try {
    await dispatchToSession(appId, "window", { action }, 10_000);
    return { ok: true, appId, action, via: "session" };
  } catch (error) {
    if (error instanceof SessionDispatchError) throw error;
    throw new SessionDispatchError(
      "window_unavailable",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function getRemoteSnapshot(appId: string): Promise<RemoteLiveApp | null> {
  const cached = remoteApps.get(appId);
  try {
    const snapshot = await dispatchToSession<any>(appId, "snapshot", {}, 2_000);
    if (!snapshot || !Array.isArray(snapshot.tools)) return cached ?? null;
    const entry: RemoteLiveApp = {
      appId,
      sessionId: String(snapshot.sessionId || cached?.sessionId || ""),
      cwd: typeof snapshot.cwd === "string" ? snapshot.cwd : cached?.cwd,
      scope: typeof snapshot.scope === "string" ? snapshot.scope : cached?.scope,
      instances: normalizeInstances(snapshot.instances ?? cached?.instances),
      tools: snapshot.tools.filter(validateToolDescriptor),
      revision: Number(snapshot.revision) || cached?.revision || 0,
      updatedAt: new Date().toISOString(),
      hasWindow: snapshot.hasWindow === true,
    };
    if (entry.sessionId) remoteApps.set(appId, entry);
    return entry;
  } catch {
    return cached ?? null;
  }
}

async function pushStateToLiveOwner(appId: string, state: unknown, reason: string): Promise<void> {
  const local = getLiveApp(appId);
  if (local?.win) {
    pushStateToWindow(appId, state, reason);
    return;
  }
  await dispatchToSession(appId, "state_push", { state, reason }, 3_000).catch(() => {});
}

async function handleCall(appId: string, body: any) {
  const toolName = String(body.tool || body.name || "");
  const args = (body.arguments || body.args || {}) as Record<string, unknown>;
  if (!toolName) return { status: 400, body: { ok: false, error: { code: "invalid_args", message: "tool required" } } };

  const live = getLiveApp(appId);
  const remote = live ? null : await getRemoteSnapshot(appId);
  const cwd = body.cwd || live?.cwd || remote?.cwd || process.cwd();
  const diskTools = live?.diskTools ?? (await loadGappToolsFile(appId, cwd));
  const tools = live
    ? getMergedTools(appId)
    : mergeToolLists(diskTools, remote?.tools ?? []);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      status: 404,
      body: { ok: false, error: { code: "not_found", message: `tool ${toolName} not found on ${appId}` } },
    };
  }

  // v2: execute the app-owned shared module before live/stateOps fallbacks.
  // This keeps browser, TUI, agent and HTTP host calls on one implementation.
  const bundle = await resolveGapp(appId, cwd);
  if (bundle) {
    try {
      const moduleOutput = await executeGappToolModule(bundle, toolName, args);
      if (moduleOutput) {
        await setGappState(appId, moduleOutput.state, {
          scope: bundle.meta.scope,
          cwd: bundle.meta.cwd || cwd,
          merge: false,
        });
        await pushStateToLiveOwner(appId, moduleOutput.state, "tools.mjs");
        return { status: 200, body: { ok: true, result: moduleOutput.result, via: "module" } };
      }
    } catch (e) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "handler_error", message: e instanceof Error ? e.message : String(e) },
        },
      };
    }
  }

  // Prefer live window handler for legacy/live-only tools.
  if (live?.win) {
    const result = await dispatchToolCallToWindow(appId, toolName, args);
    return { status: result.ok ? 200 : 400, body: result };
  }

  if (remote || (await sessionForApp(appId))) {
    try {
      const result = await dispatchToSession(appId, "tool_call", {
        tool: toolName,
        arguments: args,
      });
      return { status: 200, body: { ok: true, result, via: "live" } };
    } catch (error) {
      if (!(error instanceof SessionDispatchError) || error.code !== "needs_live_handler") {
        return {
          status: error instanceof SessionDispatchError ? error.status : 400,
          body: {
            ok: false,
            error: {
              code: error instanceof SessionDispatchError ? error.code : "handler_error",
              message: error instanceof Error ? error.message : String(error),
            },
          },
        };
      }
    }
  }

  // Fallback: stateOps on disk
  if (tool.stateOps?.length) {
    const bundle = await resolveGapp(appId, cwd);
    if (!bundle) {
      return { status: 404, body: { ok: false, error: { code: "not_found", message: `app ${appId}` } } };
    }
    try {
      const applied = applyStateOps(bundle.state, tool.stateOps, args);
      await setGappState(appId, applied.state, { scope: bundle.meta.scope, cwd: bundle.meta.cwd || cwd, merge: false });
      await pushStateToLiveOwner(appId, applied.state, "stateOps");
      return { status: 200, body: { ok: true, result: applied.result, via: "stateOps" } };
    } catch (e) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "handler_error", message: e instanceof Error ? e.message : String(e) },
        },
      };
    }
  }

  return {
    status: 409,
    body: {
      ok: false,
      error: {
        code: "needs_live_handler",
        message: `Tool ${toolName} requires an open window with onToolCall handler`,
      },
    },
  };
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const u = new URL(req.url || "/", `http://${GAPP_HOST_BIND}:${boundPort}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";

  // Everything except the hub probe requires the local bearer token.
  const isHealthProbe = method === "GET" && (path === "/health" || path === GAPP_PATHS.health);
  if (!isHealthProbe && !isAuthorized(req)) {
    return json(res, 401, { ok: false, error: { code: "unauthorized", message: "Missing or invalid host token" } });
  }
  // Session registration/heartbeats/unregister keep daemon↔Pi routing fresh,
  // but are not user activity and must not prevent idle shutdown.
  if (!isHealthProbe && !isSessionLifecycleRequest(method, path)) markActivity();

  try {
    // GET /health
    if (method === "GET" && (path === "/health" || path === GAPP_PATHS.health)) {
      return json(res, 200, {
        ok: true,
        service: "gapp-host",
        role,
        mode,
        port: boundPort,
        sessionId: getHostSessionId(),
        pid: process.pid,
        liveApps: [...new Set([...listLiveApps().map((a) => a.appId), ...remoteApps.keys()])],
        prefix: GAPP_HTTP_PREFIX,
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        lastActivityAt: new Date(lastActivityAt).toISOString(),
        idleForMs: Math.max(0, Date.now() - lastActivityAt),
        activeRequests,
        ...(lifecycleDetailsProvider?.() ?? {}),
      });
    }

    // GET /v1/gapp — catalog
    if (method === "GET" && path === GAPP_HTTP_PREFIX) {
      const leases = await listLeases();
      return json(res, 200, {
        ok: true,
        port: boundPort,
        paths: GAPP_PATHS,
        sessions: [...sessions.values()],
        leases,
        live: [
          ...listLiveApps().map((a) => ({
            appId: a.appId,
            sessionId: a.sessionId,
            cwd: a.cwd,
            scope: a.scope,
            instances: a.instances,
            tools: getMergedTools(a.appId).map((t) => t.name),
            hasWindow: !!a.win,
            source: "local" as const,
          })),
          ...[...remoteApps.values()]
            .filter((remote) => !getLiveApp(remote.appId))
            .map((remote) => ({
              appId: remote.appId,
              sessionId: remote.sessionId,
              cwd: remote.cwd,
              scope: remote.scope,
              instances: remote.instances,
              tools: remote.tools.map((tool) => tool.name),
              hasWindow: remote.hasWindow !== false,
              source: "pi-bridge" as const,
            })),
        ],
      });
    }

    // Sessions
    if (method === "GET" && path === GAPP_PATHS.sessions) {
      return json(res, 200, { ok: true, sessions: [...sessions.values()] });
    }
    if (method === "POST" && path === GAPP_PATHS.sessions) {
      const body = await parseJson(req);
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return json(res, 400, { ok: false, error: "sessionId required" });
      const bridgeBase = normalizeBridgeBase(body.bridgeBase);
      if (body.bridgeBase && !bridgeBase) {
        return json(res, 400, {
          ok: false,
          error: { code: "invalid_bridge", message: "bridgeBase must be an HTTP loopback URL" },
        });
      }
      const previous = sessions.get(sessionId);
      const now = new Date().toISOString();
      sessions.set(sessionId, {
        sessionId,
        pid: Number(body.pid) || process.pid,
        cwd: typeof body.cwd === "string" ? body.cwd : previous?.cwd,
        bridgeBase: bridgeBase ?? previous?.bridgeBase,
        joinedAt: previous?.joinedAt ?? now,
        lastSeenAt: now,
      });
      await persistSessions().catch(() => {});
      return json(res, 200, { ok: true, sessionId, role, mode });
    }
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/sessions/:sessionId`);
      if (m && method === "DELETE") {
        sessions.delete(m.sessionId);
        for (const [appId, remote] of remoteApps) {
          if (remote.sessionId === m.sessionId) remoteApps.delete(appId);
        }
        await persistSessions().catch(() => {});
        return json(res, 200, { ok: true, sessionId: m.sessionId });
      }
    }

    // Leases collection
    if (method === "GET" && path === GAPP_PATHS.leases) {
      return json(res, 200, { ok: true, leases: await listLeases() });
    }

    // Lease by app
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/leases/:appId`);
      if (m) {
        const appId = m.appId;
        if (method === "GET") {
          const lease = await readLease(appId);
          return json(res, lease ? 200 : 404, lease ? { ok: true, lease } : { ok: false, error: "not found" });
        }
        if (method === "PUT" || method === "POST") {
          const body = await parseJson(req);
          const sessionId = String(body.sessionId || "");
          if (!sessionId) {
            return json(res, 400, {
              ok: false,
              error: { code: "invalid_args", message: "sessionId required" },
            });
          }
          const result = await acquireLease({
            appId,
            sessionId,
            instances: body.instances,
            host: body.host,
            pid: body.pid,
          });
          if (!result.ok) return json(res, 409, result);
          const previous = remoteApps.get(appId);
          remoteApps.set(appId, {
            appId,
            sessionId,
            cwd: typeof body.cwd === "string" ? body.cwd : previous?.cwd,
            scope: typeof body.scope === "string" ? body.scope : previous?.scope,
            instances: normalizeInstances(body.instances),
            tools: previous?.sessionId === sessionId ? previous.tools : [],
            revision: previous?.sessionId === sessionId ? previous.revision : 0,
            updatedAt: new Date().toISOString(),
            hasWindow: body.hasWindow !== false,
          });
          return json(res, 200, result);
        }
        if (method === "DELETE") {
          const body = method === "DELETE" ? await parseJson(req).catch(() => ({})) : {};
          const ok = await releaseLease(appId, {
            sessionId: body.sessionId,
            force: body.force === true,
          });
          if (ok) remoteApps.delete(appId);
          return json(res, 200, { ok });
        }
      }
    }

    // Private Host RPC for native isolated runners. No CORS headers by design.
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/rpc`);
      if (m && method === "POST") {
        try {
          const body = await parseJson(req, MAX_HOST_RPC_BODY_BYTES);
          const rpcMethod = String(body.method || "").trim();
          const args = body.arguments ?? {};
          if (!rpcMethod) throw new Error("RPC method required");
          if (!args || typeof args !== "object" || Array.isArray(args)) {
            throw new Error("RPC arguments must be an object");
          }
          const localLive = getLiveApp(m.appId);
          const remote = localLive ? null : await getRemoteSnapshot(m.appId);
          const remoteSession = localLive ? null : await sessionForApp(m.appId);
          const cwd =
            (await assertAllowedCwd(body.cwd)) ||
            localLive?.cwd ||
            remote?.cwd ||
            process.cwd();
          const result = remoteSession
            ? await dispatchToSession(
                m.appId,
                "rpc",
                { method: rpcMethod, arguments: args, cwd },
                360_000,
              )
            : await dispatchHostRpc(rpcMethod, args, {
                appId: m.appId,
                cwd,
                sessionId:
                  typeof body.sessionId === "string" && body.sessionId
                    ? body.sessionId
                    : "isolated-http",
              });
          return privateJson(res, 200, { ok: true, result });
        } catch (error) {
          return privateJson(res, 400, {
            ok: false,
            error: {
              code: error instanceof SessionDispatchError ? error.code : "handler_error",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }

    // Tools
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/tools`);
      if (m) {
        const appId = m.appId;
        if (method === "GET") {
          let toolsCwd: string | undefined;
          try {
            toolsCwd = await assertAllowedCwd(u.searchParams.get("cwd"));
          } catch (e) {
            return json(res, 403, { ok: false, error: { code: "cwd_forbidden", message: e instanceof Error ? e.message : String(e) } });
          }
          const live = getLiveApp(appId);
          const remote = live ? null : await getRemoteSnapshot(appId);
          const effectiveCwd = toolsCwd || live?.cwd || remote?.cwd;
          const disk = live?.diskTools ?? (await loadGappToolsFile(appId, effectiveCwd));
          const tools = live
            ? getMergedTools(appId)
            : mergeToolLists(disk, remote?.tools ?? []);
          return json(res, 200, {
            ok: true,
            appId,
            live: !!live || !!remote,
            revision: live?.liveRevision ?? remote?.revision ?? 0,
            tools,
          });
        }
        if (method === "PUT" || method === "POST") {
          const body = await parseJson(req);
          const tools = (Array.isArray(body.tools) ? body.tools : []).filter(validateToolDescriptor) as GappTool[];
          const revision = Number(body.revision) || Date.now();
          const localOk = setLiveTools(appId, tools, revision);
          const lease = await readLease(appId);
          const sessionId = String(body.sessionId || lease?.sessionId || "");
          const previous = remoteApps.get(appId);
          if (sessionId && (!previous || previous.sessionId !== sessionId || revision >= previous.revision)) {
            remoteApps.set(appId, {
              appId,
              sessionId,
              cwd: typeof body.cwd === "string" ? body.cwd : previous?.cwd,
              scope: typeof body.scope === "string" ? body.scope : previous?.scope,
              instances: normalizeInstances(body.instances ?? lease?.instances ?? previous?.instances),
              tools,
              revision,
              updatedAt: new Date().toISOString(),
              hasWindow: true,
            });
          }
          const ok = localOk || !!sessionId;
          return json(res, ok ? 200 : 404, { ok, revision, count: tools.length });
        }
        if (method === "DELETE") {
          const body = await parseJson(req).catch(() => ({}));
          clearLiveTools(appId);
          const remote = remoteApps.get(appId);
          if (!body.sessionId || remote?.sessionId === body.sessionId) remoteApps.delete(appId);
          return json(res, 200, { ok: true });
        }
      }
    }

    // Call
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/call`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        try {
          body.cwd = await assertAllowedCwd(body.cwd);
        } catch (e) {
          return json(res, 403, { ok: false, error: { code: "cwd_forbidden", message: e instanceof Error ? e.message : String(e) } });
        }
        const result = await handleCall(m.appId, body);
        return json(res, result.status, result.body);
      }
    }

    // State
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/state`);
      if (m) {
        const appId = m.appId;
        const live = getLiveApp(appId);
        const remote = live ? null : await getRemoteSnapshot(appId);
        let cwd: string;
        try {
          cwd =
            (await assertAllowedCwd(u.searchParams.get("cwd"))) ||
            live?.cwd ||
            remote?.cwd ||
            process.cwd();
        } catch (e) {
          return json(res, 403, { ok: false, error: { code: "cwd_forbidden", message: e instanceof Error ? e.message : String(e) } });
        }
        if (method === "GET") {
          const bundle = await resolveGapp(appId, cwd);
          if (!bundle) return json(res, 404, { ok: false, error: "not found" });
          return json(res, 200, { ok: true, id: appId, state: bundle.state, scope: bundle.meta.scope });
        }
        if (method === "PUT" || method === "POST") {
          const body = await parseJson(req);
          let bodyCwd: string | undefined;
          try {
            bodyCwd = await assertAllowedCwd(body.cwd);
          } catch (e) {
            return json(res, 403, { ok: false, error: { code: "cwd_forbidden", message: e instanceof Error ? e.message : String(e) } });
          }
          const bundle = await resolveGapp(appId, bodyCwd || cwd);
          if (!bundle) return json(res, 404, { ok: false, error: "not found" });
          const result = await setGappState(appId, body.state, {
            scope: bundle.meta.scope,
            cwd: bundle.meta.cwd || bodyCwd || cwd,
            merge: body.merge === true,
          });
          await pushStateToLiveOwner(appId, result.state, "http-state");
          return json(res, 200, { ok: true, id: appId, state: result.state });
        }
      }
    }

    // Events → main session notify
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/events`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        const appId = m.appId;
        const event = String(body.event || "event");
        const notify = body.notifyAgent === true;
        const prompt =
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : defaultEventPrompt(appId, event, body.payload);
        if (notify) {
          const bridge = getAgentBridge();
          if (bridge.notifyAgent) {
            const busy = bridge.isAgentBusy();
            bridge.notifyAgent(prompt, busy ? { deliverAs: "followUp" } : undefined);
          } else {
            try {
              await dispatchToSession(appId, "event", {
                event,
                payload: body.payload,
                notifyAgent: true,
                prompt,
              });
            } catch (error) {
              return json(res, error instanceof SessionDispatchError ? error.status : 503, {
                ok: false,
                error: {
                  code: error instanceof SessionDispatchError ? error.code : "host_unavailable",
                  message: error instanceof Error ? error.message : String(error),
                },
              });
            }
          }
        }
        return json(res, 200, { ok: true, notified: notify });
      }
    }

    // Generate (main session sendUserMessage)
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/generate/:requestId`);
      if (m && method === "GET") {
        const job = getGenerateJob(m.requestId);
        if (!job) {
          try {
            const remote = await dispatchToSession<any>(
              m.appId,
              "generate_status",
              { requestId: m.requestId },
              3_000,
            );
            if (!remote) return json(res, 404, { ok: false, error: "not found" });
            return json(res, 200, { ok: true, ...remote });
          } catch {
            return json(res, 404, { ok: false, error: "not found" });
          }
        }
        return json(res, 200, {
          ok: true,
          requestId: job.requestId,
          status: job.status,
          text: job.text,
          error: job.error,
        });
      }
    }
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/generate`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        const appId = m.appId;
        const requestId =
          String(body.requestId || `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return json(res, 400, { ok: false, error: { code: "invalid_args", message: "prompt required" } });

        const requestedMode = body.mode === "agent" ? "agent" : "subagent";
        const live = getLiveApp(appId);
        const remote = remoteApps.get(appId);
        const session = live ? null : await sessionForApp(appId);
        let cwd: string | undefined;
        try {
          cwd =
            (await assertAllowedCwd(body.cwd)) ||
            live?.cwd ||
            remote?.cwd ||
            session?.cwd;
        } catch (error) {
          return json(res, 403, {
            ok: false,
            error: { code: "cwd_forbidden", message: error instanceof Error ? error.message : String(error) },
          });
        }

        let result: any;
        // The default subagent path deliberately runs inside the persistent
        // daemon. It must keep working after the Pi process or its bridge has
        // disappeared. Only mode:"agent" needs the live main-session bridge.
        if (requestedMode === "agent" && session && !getAgentBridge().notifyAgent) {
          try {
            result = await dispatchToSession(appId, "generate", {
              requestId,
              prompt,
              system: body.system,
              format: body.format === "json" ? "json" : "text",
              mode: "agent",
            });
          } catch (error) {
            return json(res, error instanceof SessionDispatchError ? error.status : 503, {
              ok: false,
              error: {
                code: error instanceof SessionDispatchError ? error.code : "host_unavailable",
                message: error instanceof Error ? error.message : String(error),
              },
            });
          }
        } else {
          result = dispatchGenerate({
            appId,
            requestId,
            prompt,
            system: body.system,
            format: body.format === "json" ? "json" : "text",
            mode: requestedMode,
            cwd,
          });
          if (!result.ok) return json(res, 503, result);
        }

        return json(res, 202, {
          ok: true,
          requestId,
          via: result.via,
          status: result.created ? "queued" : "already_queued",
        });
      }
    }

    // Open a host-owned window (Raycast / CLI launchers).
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/open`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        let cwd: string | undefined;
        try {
          cwd = await assertAllowedCwd(body.cwd);
        } catch (e) {
          return json(res, 403, {
            ok: false,
            error: { code: "cwd_forbidden", message: e instanceof Error ? e.message : String(e) },
          });
        }
        try {
          const result = await openHostWindow(m.appId, {
            cwd,
            sessionId:
              typeof body.sessionId === "string" && body.sessionId.trim()
                ? body.sessionId.trim()
                : undefined,
            versionId:
              typeof body.versionId === "string" && body.versionId.trim()
                ? body.versionId.trim()
                : undefined,
            scope: body.scope === "project" || body.scope === "global" ? body.scope : undefined,
            source:
              typeof body.source === "string" && body.source.trim() ? body.source.trim() : undefined,
          });
          return json(res, 200, result);
        } catch (error) {
          const code =
            typeof (error as { code?: unknown })?.code === "string"
              ? ((error as { code: string }).code)
              : "open_failed";
          const status = code === "already_connected" ? 409 : code === "not_found" ? 404 : 500;
          const details = (error as { details?: unknown })?.details;
          return json(res, status, {
            ok: false,
            error: {
              code,
              message: error instanceof Error ? error.message : String(error),
              ...(details !== undefined ? { details } : {}),
            },
          });
        }
      }
    }

    // Window control (focus | close) for a live GAPP.
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/window`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        const action = String(body.action || "");
        if (action !== "focus" && action !== "close") {
          return json(res, 400, {
            ok: false,
            error: { code: "invalid_args", message: "action must be focus or close" },
          });
        }
        const known = getLiveApp(m.appId) || remoteApps.get(m.appId) || (await readLease(m.appId));
        if (!known) {
          return json(res, 404, {
            ok: false,
            error: { code: "not_open", message: `No live window for ${m.appId}` },
          });
        }
        try {
          return json(res, 200, await controlHostWindow(m.appId, action));
        } catch (error) {
          return json(res, error instanceof SessionDispatchError ? error.status : 500, {
            ok: false,
            error: {
              code: error instanceof SessionDispatchError ? error.code : "window_unavailable",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }

    // App summary
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId`);
      if (m && method === "GET") {
        const live = getLiveApp(m.appId);
        const remote = live ? null : await getRemoteSnapshot(m.appId);
        const lease = await readLease(m.appId);
        return json(res, 200, {
          ok: true,
          appId: m.appId,
          live: live
            ? {
                sessionId: live.sessionId,
                hasWindow: !!live.win,
                tools: getMergedTools(m.appId),
                instances: live.instances,
              }
            : remote
              ? {
                  sessionId: remote.sessionId,
                  hasWindow: remote.hasWindow !== false,
                  tools: remote.tools,
                  instances: remote.instances,
                }
              : null,
          lease,
        });
      }
    }

    json(res, 404, { ok: false, error: "not found", path, hint: GAPP_PATHS });
  } catch (e) {
    json(res, 500, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export function getHostRole(): HostRole {
  return role;
}

export function getBoundPort(): number {
  return boundPort;
}

export function isHub(): boolean {
  return role === "hub";
}

async function registerClientSession(
  port: number,
  options: { sessionId?: string; cwd?: string; bridgeBase?: string },
): Promise<void> {
  if (!options.sessionId || !hostToken) return;
  const response = await fetch(`http://${GAPP_HOST_BIND}:${port}${GAPP_PATHS.sessions}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hostToken}`,
    },
    body: JSON.stringify({
      sessionId: options.sessionId,
      pid: process.pid,
      cwd: options.cwd,
      bridgeBase: options.bridgeBase,
    }),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Unable to register Pi session with GAPP host: HTTP ${response.status} ${text}`);
  }
}

/** Start a daemon/embedded hub, or register this Pi process as a client of one. */
export async function startGappHostServer(options?: {
  port?: number;
  sessionId?: string;
  cwd?: string;
  bridgeBase?: string;
  clientOnly?: boolean;
  mode?: HostMode;
}): Promise<{ role: HostRole; port: number; base: string }> {
  const port = options?.port ?? GAPP_HOST_PORT;
  boundPort = port;
  const requestedMode = options?.mode ?? "embedded";

  // Both roles need the token: hub verifies it, and creating it up front means
  // the file exists before any client or WebView asks for it.
  hostToken = await ensureHostToken();

  if (server?.listening) {
    return { role, port: boundPort, base: `http://${GAPP_HOST_BIND}:${boundPort}` };
  }

  // Probe existing hub
  try {
    const res = await fetch(`http://${GAPP_HOST_BIND}:${port}/health`, {
      signal: AbortSignal.timeout(400),
    });
    if (res.ok) {
      const health = await res.json().catch(() => null) as any;
      if (health?.service !== "gapp-host") throw new Error("port is occupied by a non-GAPP service");
      role = "client";
      mode = health?.mode === "daemon" ? "daemon" : "embedded";
      await registerClientSession(port, options ?? {});
      return { role: "client", port, base: `http://${GAPP_HOST_BIND}:${port}` };
    }
  } catch {
    // nothing listening — try bind
  }

  if (options?.clientOnly) {
    throw new Error(`GAPP daemon is unavailable on ${GAPP_HOST_BIND}:${port}`);
  }

  mode = requestedMode;
  lastActivityAt = Date.now();
  await loadPersistedSessions();

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const countsAsActive = !isPassiveLifecycleRequest(req);
      if (countsAsActive) activeRequests += 1;
      void route(req, res)
        .catch((error) => {
          if (!res.headersSent) {
            json(res, 500, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          } else if (!res.writableEnded) {
            res.end();
          }
        })
        .finally(() => {
          if (countsAsActive) activeRequests = Math.max(0, activeRequests - 1);
        });
    });
    server.once("error", async (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        role = "client";
        await registerClientSession(port, options ?? {}).catch(() => {});
        resolve({ role: "client", port, base: `http://${GAPP_HOST_BIND}:${port}` });
        return;
      }
      reject(err);
    });
    server.listen(port, GAPP_HOST_BIND, () => {
      role = requestedMode === "daemon" ? "daemon" : "hub";
      if (options?.sessionId) {
        const now = new Date().toISOString();
        sessions.set(options.sessionId, {
          sessionId: options.sessionId,
          pid: process.pid,
          cwd: options.cwd,
          bridgeBase: normalizeBridgeBase(options.bridgeBase),
          joinedAt: now,
          lastSeenAt: now,
        });
        void persistSessions().catch(() => {});
      }
      resolve({ role, port, base: `http://${GAPP_HOST_BIND}:${port}` });
    });
  });
}

export async function stopGappHostServer(): Promise<void> {
  const s = server;
  server = null;
  role = "stopped";
  activeRequests = 0;
  if (!s) return;
  const closable = s as Server & {
    closeIdleConnections?: () => void;
    closeAllConnections?: () => void;
  };
  closable.closeIdleConnections?.();
  await new Promise<void>((resolve) => {
    let settled = false;
    let force: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (force) clearTimeout(force);
      resolve();
    };
    force = setTimeout(() => {
      closable.closeAllConnections?.();
      finish();
    }, 5_000);
    force.unref?.();
    s.close(finish);
  });
}
