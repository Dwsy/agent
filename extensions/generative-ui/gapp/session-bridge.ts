import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ensureHostToken, verifyHostToken } from "./auth.js";
import {
  dispatchToolCallToWindow,
  getAgentBridge,
  getGenerateJob,
  getLiveApp,
  getMergedTools,
  pushStateToWindow,
} from "./registry.js";
import { dispatchGenerate } from "./generate.js";
import { dispatchHostRpc } from "./host-rpc.js";
import { defaultEventPrompt } from "./protocol.js";

export interface GappSessionBridgeInfo {
  base: string;
  port: number;
  sessionId: string;
}

let server: Server | null = null;
let current: GappSessionBridgeInfo | null = null;
let token: string | null = null;

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function parseBody(req: IncomingMessage, maxBytes = 24 * 1024 * 1024): Promise<any> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (value) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text.trim() ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function dispatch(body: any, sessionId: string): Promise<unknown> {
  const operation = String(body.operation || "");
  const appId = String(body.appId || "");
  if (!operation) throw new Error("operation required");
  if (!appId) throw new Error("appId required");

  const live = getLiveApp(appId);
  if (!live || live.sessionId !== sessionId) {
    const error = new Error(`No live Pi window for ${appId}`) as Error & { code?: string };
    error.code = "needs_live_handler";
    throw error;
  }

  switch (operation) {
    case "snapshot":
      return {
        appId,
        sessionId,
        cwd: live.cwd,
        scope: live.scope,
        instances: live.instances,
        tools: getMergedTools(appId),
        revision: live.liveRevision,
        hasWindow: !!live.win,
      };
    case "tool_call": {
      const result = await dispatchToolCallToWindow(
        appId,
        String(body.tool || ""),
        (body.arguments || {}) as Record<string, unknown>,
      );
      if (!result.ok) {
        const error = new Error(result.error.message) as Error & { code?: string };
        error.code = result.error.code;
        throw error;
      }
      return result.result;
    }
    case "rpc":
      return await dispatchHostRpc(String(body.method || ""), body.arguments || {}, {
        appId,
        cwd: typeof body.cwd === "string" && body.cwd ? body.cwd : live.cwd,
        sessionId,
      });
    case "window": {
      const action = String(body.action || "");
      if (action !== "focus" && action !== "close") {
        throw new Error(`Unsupported window action: ${action}`);
      }
      if (!live.win) throw new Error(`No window is attached to ${appId}`);
      if (action === "focus") live.win.show();
      else live.win.close();
      return { appId, action };
    }
    case "state_push":
      return { pushed: pushStateToWindow(appId, body.state, String(body.reason || "daemon")) };
    case "event": {
      if (body.notifyAgent === true) {
        const bridge = getAgentBridge();
        if (!bridge.notifyAgent) throw new Error("Pi agent bridge unavailable");
        const prompt =
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : defaultEventPrompt(appId, String(body.event || "event"), body.payload);
        bridge.notifyAgent(prompt, bridge.isAgentBusy() ? { deliverAs: "followUp" } : undefined);
      }
      return { notified: body.notifyAgent === true };
    }
    case "generate": {
      const result = dispatchGenerate({
        appId,
        requestId: String(body.requestId || ""),
        prompt: String(body.prompt || ""),
        system: typeof body.system === "string" ? body.system : undefined,
        format: body.format === "json" ? "json" : "text",
        mode: body.mode === "agent" ? "agent" : "subagent",
        cwd: live.cwd,
      });
      if (!result.ok) {
        const error = new Error(result.error.message) as Error & { code?: string };
        error.code = result.error.code;
        throw error;
      }
      return result;
    }
    case "generate_status": {
      const job = getGenerateJob(String(body.requestId || ""));
      return job
        ? { requestId: job.requestId, status: job.status, text: job.text, error: job.error }
        : null;
    }
    default:
      throw new Error(`Unsupported Pi bridge operation: ${operation}`);
  }
}

export async function startGappSessionBridge(sessionId: string): Promise<GappSessionBridgeInfo> {
  if (current?.sessionId === sessionId && server?.listening) return current;
  await stopGappSessionBridge();
  token = await ensureHostToken();
  server = createServer((req, res) => {
    void (async () => {
      if (!token || !verifyHostToken(req.headers.authorization, token)) {
        return json(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid token" } });
      }
      if (req.method === "GET" && req.url === "/health") {
        return json(res, 200, { ok: true, service: "gapp-pi-bridge", sessionId, pid: process.pid });
      }
      if (req.method !== "POST" || req.url !== "/dispatch") {
        return json(res, 404, { ok: false, error: { code: "not_found", message: "not found" } });
      }
      try {
        const result = await dispatch(await parseBody(req), sessionId);
        return json(res, 200, { ok: true, result });
      } catch (error) {
        const code = (error as Error & { code?: string }).code || "handler_error";
        return json(res, code === "needs_live_handler" ? 409 : 400, {
          ok: false,
          error: { code, message: error instanceof Error ? error.message : String(error) },
        });
      }
    })().catch((error) => {
      if (!res.headersSent) {
        json(res, 500, { ok: false, error: { code: "internal", message: String(error) } });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  current = { base: `http://127.0.0.1:${address.port}`, port: address.port, sessionId };
  return current;
}

export async function stopGappSessionBridge(): Promise<void> {
  const active = server;
  server = null;
  current = null;
  if (!active) return;
  const closable = active as Server & {
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
    active.close(finish);
  });
}
