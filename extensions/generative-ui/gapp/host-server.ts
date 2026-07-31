/**
 * GAPP host control plane — single port (default 54888), multipath routes.
 *
 *   GET  /health
 *   GET  /v1/gapp
 *   GET|POST /v1/gapp/sessions
 *   GET|PUT|DELETE /v1/gapp/leases/:appId
 *   GET|PUT /v1/gapp/apps/:appId/tools
 *   POST /v1/gapp/apps/:appId/call
 *   POST /v1/gapp/apps/:appId/rpc (private, no browser CORS)
 *   GET|PUT /v1/gapp/apps/:appId/state
 *   POST /v1/gapp/apps/:appId/events
 *   POST /v1/gapp/apps/:appId/generate
 *   GET  /v1/gapp/apps/:appId/generate/:requestId
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { GAPP_HOST_BIND, GAPP_HOST_PORT, GAPP_HTTP_PREFIX, GAPP_PATHS } from "./constants.js";
import { acquireLease, listLeases, readLease, releaseLease } from "./lease.js";
import {
  createGenerateJob,
  dispatchToolCallToWindow,
  getGenerateJob,
  getHostSessionId,
  getLiveApp,
  getMergedTools,
  listLiveApps,
  armGenerateTimeout,
  setLiveTools,
  getAgentBridge,
  pushStateToWindow,
} from "./registry.js";
import { loadGappToolsFile, setGappState, resolveGapp } from "./storage.js";
import { applyStateOps } from "./stateops.js";
import { executeGappToolModule } from "./tool-module.js";
import { dispatchHostRpc } from "./host-rpc.js";
import {
  formatGenerateUserMessage,
  defaultEventPrompt,
  validateToolDescriptor,
  type GappTool,
} from "./protocol.js";

export type HostRole = "hub" | "client" | "stopped";

let server: Server | null = null;
let role: HostRole = "stopped";
let boundPort = GAPP_HOST_PORT;

const MAX_HOST_RPC_BODY_BYTES = 24 * 1024 * 1024;
const sessions = new Map<string, { sessionId: string; pid: number; cwd?: string; joinedAt: string }>();

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(data);
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

async function handleCall(appId: string, body: any) {
  const toolName = String(body.tool || body.name || "");
  const args = (body.arguments || body.args || {}) as Record<string, unknown>;
  if (!toolName) return { status: 400, body: { ok: false, error: { code: "invalid_args", message: "tool required" } } };

  const live = getLiveApp(appId);
  const tools = live ? getMergedTools(appId) : await loadGappToolsFile(appId, body.cwd);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      status: 404,
      body: { ok: false, error: { code: "not_found", message: `tool ${toolName} not found on ${appId}` } },
    };
  }

  // v2: execute the app-owned shared module before live/stateOps fallbacks.
  // This keeps browser, TUI, agent and HTTP host calls on one implementation.
  const cwd = body.cwd || live?.cwd || process.cwd();
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
        if (live?.win) pushStateToWindow(appId, moduleOutput.state, "tools.mjs");
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

  // Fallback: stateOps on disk
  if (tool.stateOps?.length) {
    const bundle = await resolveGapp(appId, cwd);
    if (!bundle) {
      return { status: 404, body: { ok: false, error: { code: "not_found", message: `app ${appId}` } } };
    }
    try {
      const applied = applyStateOps(bundle.state, tool.stateOps, args);
      await setGappState(appId, applied.state, { scope: bundle.meta.scope, cwd: bundle.meta.cwd || cwd, merge: false });
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
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const u = new URL(req.url || "/", `http://${GAPP_HOST_BIND}:${boundPort}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";

  try {
    // GET /health
    if (method === "GET" && (path === "/health" || path === GAPP_PATHS.health)) {
      return json(res, 200, {
        ok: true,
        service: "gapp-host",
        role: "hub",
        port: boundPort,
        sessionId: getHostSessionId(),
        pid: process.pid,
        liveApps: listLiveApps().map((a) => a.appId),
        prefix: GAPP_HTTP_PREFIX,
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
        live: listLiveApps().map((a) => ({
          appId: a.appId,
          sessionId: a.sessionId,
          instances: a.instances,
          tools: getMergedTools(a.appId).map((t) => t.name),
          hasWindow: !!a.win,
        })),
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
      sessions.set(sessionId, {
        sessionId,
        pid: Number(body.pid) || process.pid,
        cwd: body.cwd,
        joinedAt: new Date().toISOString(),
      });
      return json(res, 200, { ok: true, sessionId });
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
          const result = await acquireLease({
            appId,
            sessionId: String(body.sessionId || ""),
            instances: body.instances,
            host: body.host,
            pid: body.pid,
          });
          if (!result.ok) return json(res, 409, result);
          return json(res, 200, result);
        }
        if (method === "DELETE") {
          const body = method === "DELETE" ? await parseJson(req).catch(() => ({})) : {};
          const ok = await releaseLease(appId, {
            sessionId: body.sessionId,
            force: body.force === true,
          });
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
          const result = await dispatchHostRpc(rpcMethod, args, {
            appId: m.appId,
            cwd: typeof body.cwd === "string" && body.cwd ? body.cwd : process.cwd(),
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
              code: "handler_error",
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
          const live = getLiveApp(appId);
          const disk = live?.diskTools ?? (await loadGappToolsFile(appId, u.searchParams.get("cwd") || undefined));
          const tools = live ? getMergedTools(appId) : disk;
          return json(res, 200, {
            ok: true,
            appId,
            live: !!live,
            revision: live?.liveRevision ?? 0,
            tools,
          });
        }
        if (method === "PUT" || method === "POST") {
          const body = await parseJson(req);
          const tools = (Array.isArray(body.tools) ? body.tools : []).filter(validateToolDescriptor) as GappTool[];
          const revision = Number(body.revision) || Date.now();
          const ok = setLiveTools(appId, tools, revision);
          return json(res, ok ? 200 : 404, { ok, revision, count: tools.length });
        }
      }
    }

    // Call
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/call`);
      if (m && method === "POST") {
        const body = await parseJson(req);
        const result = await handleCall(m.appId, body);
        return json(res, result.status, result.body);
      }
    }

    // State
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId/state`);
      if (m) {
        const appId = m.appId;
        const cwd = u.searchParams.get("cwd") || process.cwd();
        if (method === "GET") {
          const bundle = await resolveGapp(appId, cwd);
          if (!bundle) return json(res, 404, { ok: false, error: "not found" });
          return json(res, 200, { ok: true, id: appId, state: bundle.state, scope: bundle.meta.scope });
        }
        if (method === "PUT" || method === "POST") {
          const body = await parseJson(req);
          const bundle = await resolveGapp(appId, body.cwd || cwd);
          if (!bundle) return json(res, 404, { ok: false, error: "not found" });
          const result = await setGappState(appId, body.state, {
            scope: bundle.meta.scope,
            cwd: bundle.meta.cwd || body.cwd || cwd,
            merge: body.merge === true,
          });
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
        if (!job) return json(res, 404, { ok: false, error: "not found" });
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

        const bridge = getAgentBridge();
        if (!bridge.notifyAgent) {
          return json(res, 503, {
            ok: false,
            error: { code: "host_unavailable", message: "No Pi agent bridge in this process" },
          });
        }

        const { created } = createGenerateJob({
          appId,
          requestId,
          prompt,
          system: body.system,
          format: body.format === "json" ? "json" : "text",
        });
        if (created) {
          armGenerateTimeout(requestId);
          const userMsg = formatGenerateUserMessage({
            appId,
            requestId,
            prompt,
            system: body.system,
            format: body.format === "json" ? "json" : "text",
          });
          const busy = bridge.isAgentBusy();
          bridge.notifyAgent(userMsg, busy ? { deliverAs: "followUp" } : undefined);
        }

        return json(res, 202, { ok: true, requestId, status: created ? "queued" : "already_queued" });
      }
    }

    // App summary
    {
      const m = matchPath(path, `${GAPP_HTTP_PREFIX}/apps/:appId`);
      if (m && method === "GET") {
        const live = getLiveApp(m.appId);
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

/** Start hub server; on EADDRINUSE become client of existing hub. */
export async function startGappHostServer(options?: {
  port?: number;
  sessionId?: string;
  cwd?: string;
}): Promise<{ role: HostRole; port: number; base: string }> {
  const port = options?.port ?? GAPP_HOST_PORT;
  boundPort = port;

  if (server?.listening) {
    return { role: "hub", port: boundPort, base: `http://${GAPP_HOST_BIND}:${boundPort}` };
  }

  // Probe existing hub
  try {
    const res = await fetch(`http://${GAPP_HOST_BIND}:${port}/health`, {
      signal: AbortSignal.timeout(400),
    });
    if (res.ok) {
      role = "client";
      if (options?.sessionId) {
        await fetch(`http://${GAPP_HOST_BIND}:${port}${GAPP_PATHS.sessions}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: options.sessionId,
            pid: process.pid,
            cwd: options.cwd,
          }),
        }).catch(() => {});
      }
      return { role: "client", port, base: `http://${GAPP_HOST_BIND}:${port}` };
    }
  } catch {
    // nothing listening — try bind
  }

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      void route(req, res);
    });
    server.once("error", async (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        role = "client";
        resolve({ role: "client", port, base: `http://${GAPP_HOST_BIND}:${port}` });
        return;
      }
      reject(err);
    });
    server.listen(port, GAPP_HOST_BIND, () => {
      role = "hub";
      if (options?.sessionId) {
        sessions.set(options.sessionId, {
          sessionId: options.sessionId,
          pid: process.pid,
          cwd: options.cwd,
          joinedAt: new Date().toISOString(),
        });
      }
      resolve({ role: "hub", port, base: `http://${GAPP_HOST_BIND}:${port}` });
    });
  });
}

export async function stopGappHostServer(): Promise<void> {
  const s = server;
  server = null;
  role = "stopped";
  if (!s) return;
  await new Promise<void>((resolve) => s.close(() => resolve()));
}
