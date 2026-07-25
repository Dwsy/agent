import type { GappBundle, GappMeta } from "./storage.js";
import {
  setGappState,
  touchGappProject,
  injectGappRuntime,
  loadGappToolsFromDir,
} from "./storage.js";
import { openWindow } from "../html-helpers.js";
import { GAPP_HOST_BASE } from "./constants.js";
import { acquireLease, releaseLease, alreadyConnectedUserMessage } from "./lease.js";
import { hostAcquireLease, hostReleaseLease } from "./host-client.js";
import { isHub } from "./host-server.js";
import {
  registerLiveApp,
  unregisterLiveApp,
  setLiveWindow,
  setLiveTools,
  clearLiveTools,
  resolveToolResult,
  getHostSessionId,
  createGenerateJob,
  armGenerateTimeout,
  getAgentBridge,
  pushStateToWindow,
} from "./registry.js";
import {
  parseToolsRegister,
  parseToolResult,
  parseEvent,
  parseLlmRequest,
  parseHostRequest,
  defaultEventPrompt,
  formatGenerateUserMessage,
  normalizeInstances,
} from "./protocol.js";
import { EVENT_DEBOUNCE_MS } from "./constants.js";
import { dispatchHostRpc, notifyHostRpcWindowClosed } from "./host-rpc.js";

/** id → last opened Glimpse window (for TUI close). */
const openWindows = new Map<string, any>();

/** Debounce notifyAgent events per app. */
const lastEventAt = new Map<string, number>();

export class GappOpenError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "GappOpenError";
    this.code = code;
    this.details = details;
  }
}

export function getOpenGappWindow(id: string): any | undefined {
  return openWindows.get(id);
}

export function closeGappWindow(id: string): boolean {
  const win = openWindows.get(id);
  if (!win) return false;
  try {
    win.close();
  } catch {
    // ignore
  }
  openWindows.delete(id);
  return true;
}

function notifyAgentText(text: string) {
  const bridge = getAgentBridge();
  if (!bridge.notifyAgent) return;
  const busy = bridge.isAgentBusy();
  bridge.notifyAgent(text, busy ? { deliverAs: "followUp" } : undefined);
}

export function attachGappMessageRouter(win: any, meta: GappMeta, cwd: string) {
  win.on("message", (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;
    const type = msg.type as string | undefined;
    if (!type) return;
    if (msg.id && msg.id !== meta.id) return;

    if (type === "gapp_state") {
      void setGappState(meta.id, msg.state, { scope: meta.scope, cwd, merge: false })
        .then((r) => {
          // keep in-window state authoritative; optional no-op push
          void r;
        })
        .catch(() => {});
      return;
    }

    if (type === "gapp_tools_register") {
      const parsed = parseToolsRegister(msg);
      if (!parsed) return;
      setLiveTools(meta.id, parsed.tools, parsed.revision);
      return;
    }

    if (type === "gapp_tools_unregister") {
      clearLiveTools(meta.id);
      return;
    }

    if (type === "gapp_tool_result") {
      const parsed = parseToolResult(msg);
      if (!parsed) return;
      resolveToolResult(parsed.requestId, {
        ok: parsed.ok,
        result: parsed.result,
        error: parsed.error,
      });
      return;
    }

    if (type === "gapp_host_request") {
      const parsed = parseHostRequest(msg);
      if (!parsed) return;
      const context = { appId: meta.id, cwd, sessionId: getHostSessionId() };
      void dispatchHostRpc(parsed.method, parsed.arguments ?? {}, context)
        .then((result) => {
          win.send(
            `window.GappHost&&window.GappHost.__dispatch(${JSON.stringify({
              v: "0.1",
              type: "gapp_host_result",
              id: meta.id,
              requestId: parsed.requestId,
              ok: true,
              result,
            })})`,
          );
        })
        .catch((error) => {
          try {
            win.send(
              `window.GappHost&&window.GappHost.__dispatch(${JSON.stringify({
                v: "0.1",
                type: "gapp_host_result",
                id: meta.id,
                requestId: parsed.requestId,
                ok: false,
                error: {
                  code: "handler_error",
                  message: error instanceof Error ? error.message : String(error),
                },
              })})`,
            );
          } catch {
            // window closed
          }
        });
      return;
    }

    if (type === "gapp_event") {
      const parsed = parseEvent(msg);
      if (!parsed) return;
      if (!parsed.notifyAgent) return;
      const key = `${meta.id}:${parsed.event}`;
      const now = Date.now();
      const prev = lastEventAt.get(key) || 0;
      if (now - prev < EVENT_DEBOUNCE_MS) return;
      lastEventAt.set(key, now);
      const prompt =
        parsed.prompt?.trim() ||
        defaultEventPrompt(meta.id, parsed.event, parsed.payload);
      notifyAgentText(prompt);
      return;
    }

    if (type === "gapp_llm_request") {
      const parsed = parseLlmRequest(msg);
      if (!parsed) return;
      const bridge = getAgentBridge();
      if (!bridge.notifyAgent) {
        try {
          win.send(
            `window.GappHost&&window.GappHost.__dispatch(${JSON.stringify({
              v: "0.1",
              type: "gapp_llm_done",
              id: meta.id,
              requestId: parsed.requestId,
              ok: false,
              error: { code: "host_unavailable", message: "No Pi agent bridge" },
            })})`,
          );
        } catch {
          // ignore
        }
        return;
      }
      // Dedupe dual-path (glimpse + HTTP /v1/gapp/.../generate)
      const { created } = createGenerateJob({
        appId: meta.id,
        requestId: parsed.requestId,
        prompt: parsed.prompt,
        system: parsed.system,
        format: parsed.format,
      });
      if (!created) return;
      armGenerateTimeout(parsed.requestId);
      const userMsg = formatGenerateUserMessage({
        appId: meta.id,
        requestId: parsed.requestId,
        prompt: parsed.prompt,
        system: parsed.system,
        format: parsed.format,
      });
      notifyAgentText(userMsg);
      return;
    }

    if (type === "gapp_ready") {
      try {
        win.send(
          `window.GappHost&&window.GappHost.__dispatch(${JSON.stringify({
            v: "0.1",
            type: "gapp_host_info",
            id: meta.id,
            mode: "pi-live",
            protocolVersion: "0.1",
            capabilities: { tools: true, events: true, generate: true, rpc: true },
          })})`,
        );
      } catch {
        // ignore
      }
    }
  });
}

/** @deprecated use attachGappMessageRouter */
export function attachGappStatePersistence(win: any, meta: GappMeta, cwd: string) {
  attachGappMessageRouter(win, meta, cwd);
}

export interface OpenGappOptions {
  cwd?: string;
  sessionId?: string;
  /** When true, skip lease (tests). */
  skipLease?: boolean;
  hostBase?: string;
}

/**
 * Open GAPP window with lease check + full host protocol.
 * Throws GappOpenError(already_connected) when instances=single and held elsewhere.
 */
export async function openGappBundle(
  bundle: GappBundle,
  activeWindows: any[] | undefined,
  cwdOrOptions: string | OpenGappOptions = process.cwd(),
): Promise<any> {
  const windows = activeWindows ?? [];
  const opts: OpenGappOptions =
    typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : cwdOrOptions || {};
  const cwd = opts.cwd ?? process.cwd();
  const sessionId = opts.sessionId || getHostSessionId();
  const instances = normalizeInstances(bundle.meta.instances);
  const hostBase = opts.hostBase ?? GAPP_HOST_BASE;

  // Persist state against the app's real project cwd (not pi session cwd).
  const appCwd =
    bundle.meta.scope === "project"
      ? bundle.meta.cwd || bundle.dir.replace(/[/\\]\.pi[/\\]gapp[/\\][^/\\]+$/, "") || cwd
      : cwd;

  // Lease: same session replaces; other session + single → refuse
  if (!opts.skipLease) {
    const leaseInput = {
      appId: bundle.meta.id,
      sessionId,
      instances,
      host: hostBase,
    };
    const leaseResult = isHub()
      ? await acquireLease(leaseInput)
      : await hostAcquireLease(leaseInput);

    if (!leaseResult.ok) {
      if (leaseResult.code === "already_connected") {
        throw new GappOpenError(
          "already_connected",
          alreadyConnectedUserMessage(bundle.meta.id, leaseResult.lease),
          { lease: leaseResult.lease },
        );
      }
      // host_unavailable: fall back to local lease file
      if ("code" in leaseResult && leaseResult.code === "host_unavailable") {
        const local = await acquireLease(leaseInput);
        if (!local.ok) {
          throw new GappOpenError(
            "already_connected",
            alreadyConnectedUserMessage(bundle.meta.id, local.lease),
            { lease: local.lease },
          );
        }
      }
    }
  }

  // Replace existing window for same id in this process.
  closeGappWindow(bundle.meta.id);

  const diskTools = await loadGappToolsFromDir(bundle.dir);
  const html = injectGappRuntime(bundle.html, bundle.meta, bundle.state, {
    hostBase,
    mode: "pi-live",
    sessionId,
  });
  const win = openWindow(html, {
    width: bundle.meta.width ?? 900,
    height: bundle.meta.height ?? 700,
    title: bundle.meta.name,
    noDock: true,
  });
  openWindows.set(bundle.meta.id, win);
  windows.push(win);

  registerLiveApp({
    appId: bundle.meta.id,
    sessionId,
    scope: bundle.meta.scope,
    cwd: appCwd,
    instances,
    win,
    diskTools,
  });
  setLiveWindow(bundle.meta.id, win);
  attachGappMessageRouter(win, bundle.meta, appCwd);

  if (bundle.meta.scope === "project" && appCwd) {
    void touchGappProject(appCwd, bundle.meta.name).catch(() => {});
  }

  const cleanup = () => {
    openWindows.delete(bundle.meta.id);
    const idx = windows.indexOf(win);
    if (idx >= 0) windows.splice(idx, 1);
    unregisterLiveApp(bundle.meta.id, sessionId);
    void notifyHostRpcWindowClosed({ appId: bundle.meta.id, cwd: appCwd, sessionId }).catch(() => {});
    void (isHub()
      ? releaseLease(bundle.meta.id, { sessionId })
      : hostReleaseLease(bundle.meta.id, sessionId));
  };
  win.on("closed", cleanup);
  win.on("error", cleanup);
  return win;
}

/** Push state to open window after agent set_state. */
export function notifyLiveState(appId: string, state: unknown) {
  pushStateToWindow(appId, state, "gapp_set_state");
}
