/**
 * In-process live GAPP registry: windows, tools, pending RPC, generate jobs.
 */

import type { GappTool, GappInstances } from "./protocol.js";
import { mergeToolLists, validateToolDescriptor } from "./protocol.js";
import { TOOL_CALL_TIMEOUT_MS, GENERATE_TIMEOUT_MS } from "./constants.js";

export interface LiveAppEntry {
  appId: string;
  sessionId: string;
  scope: string;
  cwd: string;
  instances: GappInstances;
  win: any | null;
  diskTools: GappTool[];
  liveTools: GappTool[];
  liveRevision: number;
  openedAt: string;
}

export interface PendingToolCall {
  requestId: string;
  appId: string;
  name: string;
  resolve: (value: { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GenerateJob {
  requestId: string;
  appId: string;
  prompt: string;
  system?: string;
  format?: "text" | "json";
  status: "queued" | "running" | "done" | "error";
  text?: string;
  error?: { code: string; message: string };
  createdAt: string;
  resolve?: (text: string) => void;
  reject?: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const apps = new Map<string, LiveAppEntry>();
const pendingCalls = new Map<string, PendingToolCall>();
const generateJobs = new Map<string, GenerateJob>();

export type AgentNotifyFn = (text: string, opts?: { deliverAs?: "followUp" | "steer" }) => void;
export type AgentBusyFn = () => boolean;

let notifyAgent: AgentNotifyFn | null = null;
let isAgentBusy: AgentBusyFn = () => false;
let hostSessionId = `pid-${process.pid}`;

export function setHostSessionId(id: string) {
  hostSessionId = id;
}

export function getHostSessionId(): string {
  return hostSessionId;
}

export function setAgentBridge(opts: { notify: AgentNotifyFn; busy?: AgentBusyFn }) {
  notifyAgent = opts.notify;
  if (opts.busy) isAgentBusy = opts.busy;
}

export function getAgentBridge() {
  return { notifyAgent, isAgentBusy };
}

export function listLiveApps(): LiveAppEntry[] {
  return [...apps.values()];
}

export function getLiveApp(appId: string): LiveAppEntry | undefined {
  return apps.get(appId);
}

export function registerLiveApp(entry: Omit<LiveAppEntry, "liveTools" | "liveRevision" | "diskTools" | "openedAt"> & {
  diskTools?: GappTool[];
  liveTools?: GappTool[];
}): LiveAppEntry {
  const prev = apps.get(entry.appId);
  const full: LiveAppEntry = {
    appId: entry.appId,
    sessionId: entry.sessionId,
    scope: entry.scope,
    cwd: entry.cwd,
    instances: entry.instances,
    win: entry.win,
    diskTools: entry.diskTools ?? prev?.diskTools ?? [],
    liveTools: entry.liveTools ?? prev?.liveTools ?? [],
    liveRevision: prev?.liveRevision ?? 0,
    openedAt: new Date().toISOString(),
  };
  apps.set(entry.appId, full);
  return full;
}

export function setLiveWindow(appId: string, win: any | null) {
  const e = apps.get(appId);
  if (e) e.win = win;
}

export function unregisterLiveApp(appId: string, sessionId?: string, win?: any) {
  const e = apps.get(appId);
  if (!e) return;
  if (sessionId && e.sessionId !== sessionId) return;
  // A same-session reopen replaces the registry entry before the old window's
  // asynchronous `closed` event may fire. Old generations must never tear down
  // the newly registered window, tools, pending calls, or lease.
  if (win && e.win !== win) return;
  // reject pending calls
  for (const [rid, p] of pendingCalls) {
    if (p.appId === appId) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: { code: "handler_error", message: "window closed" } });
      pendingCalls.delete(rid);
    }
  }
  apps.delete(appId);
}

export function setDiskTools(appId: string, tools: GappTool[]) {
  const e = apps.get(appId);
  if (e) e.diskTools = tools.filter(validateToolDescriptor);
}

export function setLiveTools(appId: string, tools: GappTool[], revision: number): boolean {
  const e = apps.get(appId);
  if (!e) return false;
  if (revision < e.liveRevision) return false;
  e.liveTools = tools.filter(validateToolDescriptor);
  e.liveRevision = revision;
  return true;
}

export function clearLiveTools(appId: string) {
  const e = apps.get(appId);
  if (!e) return;
  e.liveTools = [];
  e.liveRevision = 0;
}

export function getMergedTools(appId: string): GappTool[] {
  const e = apps.get(appId);
  if (!e) return [];
  return mergeToolLists(e.diskTools, e.liveTools);
}

export function dispatchToolCallToWindow(
  appId: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = TOOL_CALL_TIMEOUT_MS,
): Promise<{ ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }> {
  const e = apps.get(appId);
  if (!e?.win) {
    return Promise.resolve({
      ok: false,
      error: { code: "needs_live_handler", message: `No live window for ${appId}` },
    });
  }

  const requestId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const msg = {
    v: "0.1",
    type: "gapp_tool_call",
    id: appId,
    requestId,
    name,
    arguments: args ?? {},
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(requestId);
      resolve({ ok: false, error: { code: "timeout", message: `tool ${name} timed out` } });
    }, timeoutMs);

    pendingCalls.set(requestId, { requestId, appId, name, resolve, timer });

    try {
      const js = `window.GappHost&&window.GappHost.__dispatch(${JSON.stringify(msg)})`;
      e.win.send(js);
    } catch (err) {
      clearTimeout(timer);
      pendingCalls.delete(requestId);
      resolve({
        ok: false,
        error: {
          code: "handler_error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });
}

export function resolveToolResult(
  requestId: string,
  result: { ok: boolean; result?: unknown; error?: { code: string; message: string } },
): boolean {
  const p = pendingCalls.get(requestId);
  if (!p) return false;
  clearTimeout(p.timer);
  pendingCalls.delete(requestId);
  if (result.ok) p.resolve({ ok: true, result: result.result });
  else
    p.resolve({
      ok: false,
      error: result.error || { code: "handler_error", message: "tool failed" },
    });
  return true;
}

export function pushStateToWindow(appId: string, state: unknown, reason = "host") {
  const e = apps.get(appId);
  if (!e?.win) return false;
  const msg = { v: "0.1", type: "gapp_state_push", id: appId, state, reason };
  try {
    e.win.send(`window.GappHost&&window.GappHost.__dispatch(${JSON.stringify(msg)})`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create generate job if new. Returns { job, created }.
 * Dedupes dual-path (glimpse + HTTP multipath) for the same requestId.
 */
export function createGenerateJob(input: {
  appId: string;
  requestId: string;
  prompt: string;
  system?: string;
  format?: "text" | "json";
}): { job: GenerateJob; created: boolean } {
  const existing = generateJobs.get(input.requestId);
  if (existing) return { job: existing, created: false };
  const job: GenerateJob = {
    requestId: input.requestId,
    appId: input.appId,
    prompt: input.prompt,
    system: input.system,
    format: input.format,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  generateJobs.set(input.requestId, job);
  return { job, created: true };
}

export function getGenerateJob(requestId: string): GenerateJob | undefined {
  return generateJobs.get(requestId);
}

export function completeGenerateJob(
  requestId: string,
  outcome: { ok: true; text: string } | { ok: false; error: { code: string; message: string } },
) {
  const job = generateJobs.get(requestId);
  if (!job) return;
  if (job.timer) clearTimeout(job.timer);
  if (outcome.ok) {
    job.status = "done";
    job.text = outcome.text;
    job.resolve?.(outcome.text);
  } else {
    job.status = "error";
    job.error = outcome.error;
    job.reject?.(new Error(outcome.error.message));
  }
  // deliver to window
  const e = apps.get(job.appId);
  if (e?.win) {
    const msg = outcome.ok
      ? { v: "0.1", type: "gapp_llm_done", id: job.appId, requestId, ok: true, text: outcome.text }
      : {
          v: "0.1",
          type: "gapp_llm_done",
          id: job.appId,
          requestId,
          ok: false,
          error: outcome.error,
        };
    try {
      e.win.send(`window.GappHost&&window.GappHost.__dispatch(${JSON.stringify(msg)})`);
    } catch {
      // ignore
    }
  }
  // GC later
  setTimeout(() => generateJobs.delete(requestId), 60_000).unref?.();
}

export function armGenerateTimeout(requestId: string, ms = GENERATE_TIMEOUT_MS) {
  const job = generateJobs.get(requestId);
  if (!job) return;
  job.timer = setTimeout(() => {
    if (job.status === "done" || job.status === "error") return;
    completeGenerateJob(requestId, {
      ok: false,
      error: { code: "timeout", message: "generate timed out" },
    });
  }, ms);
  job.timer.unref?.();
}

export function listGenerateJobs(): GenerateJob[] {
  return [...generateJobs.values()];
}
