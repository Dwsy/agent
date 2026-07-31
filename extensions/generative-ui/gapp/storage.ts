import { mkdir, writeFile, readFile, readdir, unlink } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { homedir } from "node:os";

export type GappScope = "project" | "global";

/**
 * Live window policy:
 * - single (default): at most one live connection across sessions (todo / strong state).
 * - multi: multiple windows/sessions allowed; app must tolerate shared state.json.
 */
export type GappInstances = "single" | "multi";

export interface GappMeta {
  id: string;
  name: string;
  description: string;
  created: string;
  updated: string;
  scope: GappScope;
  enabled: boolean;
  archived: boolean;
  entry: "index.html";
  stateFile: "state.json";
  width?: number;
  height?: number;
  cwd?: string;
  /** Default single when omitted. */
  instances?: GappInstances;
  /** Glimpse: clear window background so liquid glass can sample desktop. */
  transparent?: boolean;
  /** Glimpse: no title bar; content becomes drag region if needed. */
  frameless?: boolean;
}

export interface GappBundle {
  meta: GappMeta;
  state: unknown;
  html: string;
  dir: string;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export class GappValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GappValidationError";
  }
}

function defaultGlobalRoot(): string {
  return join(homedir(), ".pi", "gapp");
}

export function gappGlobalRoot(): string {
  return process.env.GAPP_GLOBAL_DIR || defaultGlobalRoot();
}

/**
 * On-disk project gapp root for a given project cwd.
 * Always `<cwd>/.pi/gapp` unless unit tests set GAPP_PROJECT_DIR **and** the
 * requested cwd is the process cwd (flat temp store). Never lets a pin steal
 * another project's path.
 */
export function gappProjectRoot(cwd = process.cwd()): string {
  const pin = process.env.GAPP_PROJECT_DIR;
  const absCwd = resolve(cwd);
  if (pin && absCwd === resolve(process.cwd())) return pin;
  return join(absCwd, ".pi", "gapp");
}

interface RegisteredProject {
  cwd: string;
  name?: string;
  lastSeen?: string;
  hitCount?: number;
}

async function readGappRegistry(): Promise<RegisteredProject[]> {
  try {
    const data = JSON.parse(await readFile(join(gappGlobalRoot(), "_registry.json"), "utf-8"));
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

/** Remember a project that has GAPPs so list works even when cwd is elsewhere. */
export async function touchGappProject(projectCwd: string, name?: string): Promise<void> {
  if (!projectCwd) return;
  const regPath = join(gappGlobalRoot(), "_registry.json");
  await ensureDir(gappGlobalRoot());
  let projects = await readGappRegistry();
  const now = new Date().toISOString();
  const existing = projects.find((p) => p.cwd === projectCwd);
  if (existing) {
    existing.lastSeen = now;
    existing.hitCount = (existing.hitCount || 0) + 1;
    if (name) existing.name = name;
  } else {
    projects.push({
      cwd: projectCwd,
      name: name || basename(projectCwd),
      lastSeen: now,
      hitCount: 1,
    });
  }
  projects.sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
  projects = projects.slice(0, 200);
  await writeJsonFile(regPath, {
    version: 1,
    projects,
    updated: now,
  });
}

export function validateGappId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (!ID_RE.test(trimmed)) {
    throw new GappValidationError(
      `Invalid gapp id "${id}". Use 2-64 chars: [a-z0-9][a-z0-9_-]*`,
    );
  }
  return trimmed;
}

export function slugifyGappId(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug || !ID_RE.test(slug)) {
    throw new GappValidationError(`Cannot derive valid gapp id from "${input}"`);
  }
  return slug;
}

function rootFor(scope: GappScope, cwd = process.cwd()): string {
  return scope === "global" ? gappGlobalRoot() : gappProjectRoot(cwd);
}

export function gappDir(scope: GappScope, id: string, cwd = process.cwd()): string {
  return join(rootFor(scope, cwd), validateGappId(id));
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function normalizeInstances(raw: unknown): GappInstances {
  return raw === "multi" ? "multi" : "single";
}

function normalizeMeta(raw: Partial<GappMeta> & { id: string; name: string }, scope: GappScope, cwd: string): GappMeta {
  const now = new Date().toISOString();
  const id = validateGappId(raw.id);
  return {
    id,
    name: (raw.name || id).trim(),
    description: (raw.description || "").trim(),
    created: raw.created || now,
    updated: raw.updated || now,
    scope,
    enabled: raw.enabled !== false,
    archived: raw.archived === true,
    entry: "index.html",
    stateFile: "state.json",
    width: typeof raw.width === "number" ? raw.width : 900,
    height: typeof raw.height === "number" ? raw.height : 700,
    instances: normalizeInstances(raw.instances),
    ...(raw.transparent === true ? { transparent: true } : {}),
    ...(raw.frameless === true ? { frameless: true } : {}),
    ...(scope === "project" ? { cwd } : {}),
  };
}

export async function loadGappMeta(scope: GappScope, id: string, cwd = process.cwd()): Promise<GappMeta | null> {
  const dir = gappDir(scope, id, cwd);
  const meta = await readJsonFile<GappMeta>(join(dir, "meta.json"));
  if (!meta || typeof meta.id !== "string") return null;
  return meta;
}

export async function loadGappState(scope: GappScope, id: string, cwd = process.cwd()): Promise<unknown> {
  const dir = gappDir(scope, id, cwd);
  const state = await readJsonFile<unknown>(join(dir, "state.json"));
  return state ?? {};
}

export async function loadGappHtml(scope: GappScope, id: string, cwd = process.cwd()): Promise<string | null> {
  const dir = gappDir(scope, id, cwd);
  try {
    return await readFile(join(dir, "index.html"), "utf-8");
  } catch {
    return null;
  }
}

export async function loadGappBundle(scope: GappScope, id: string, cwd = process.cwd()): Promise<GappBundle | null> {
  const meta = await loadGappMeta(scope, id, cwd);
  if (!meta) return null;
  const html = await loadGappHtml(scope, id, cwd);
  if (html == null) return null;
  const state = await loadGappState(scope, id, cwd);
  return { meta, state, html, dir: gappDir(scope, id, cwd) };
}

/** Load optional tools.json next to meta/state/html. */
export async function loadGappToolsFromDir(dir: string): Promise<import("./protocol.js").GappTool[]> {
  const data = await readJsonFile<{ tools?: unknown[] }>(join(dir, "tools.json"));
  if (!data || !Array.isArray(data.tools)) return [];
  const { validateToolDescriptor } = await import("./protocol.js");
  return data.tools.filter(validateToolDescriptor);
}

export async function loadGappToolsFile(id: string, cwd?: string): Promise<import("./protocol.js").GappTool[]> {
  const c = cwd || process.cwd();
  try {
    const bundle = await resolveGapp(validateGappId(id), c);
    if (!bundle) return [];
    return loadGappToolsFromDir(bundle.dir);
  } catch {
    return [];
  }
}

async function listScopeAtRoot(scope: GappScope, root: string, projectCwd?: string): Promise<GappMeta[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const out: GappMeta[] = [];
  for (const name of entries) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const meta = await readJsonFile<GappMeta>(join(root, name, "meta.json"));
    if (!meta?.id && !name) continue;
    if (!meta) continue;
    // Keep on-disk folder name as id for path consistency.
    meta.id = name;
    meta.scope = scope;
    if (scope === "project" && projectCwd) meta.cwd = projectCwd;
    out.push(meta);
  }
  return out;
}

async function listScope(scope: GappScope, cwd: string): Promise<GappMeta[]> {
  if (scope === "global") return listScopeAtRoot("global", gappGlobalRoot());
  return listScopeAtRoot("project", gappProjectRoot(cwd), cwd);
}

function uniqPaths(paths: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (!p || typeof p !== "string") continue;
    const t = p.trim();
    if (!t) continue;
    // Always absolute so `.` and `/abs/path` collapse to one project.
    let abs: string;
    try {
      abs = resolve(t);
    } catch {
      continue;
    }
    if (out.includes(abs)) continue;
    out.push(abs);
  }
  return out;
}

/** Project roots: session cwd + process.cwd + registry. No walk-up. */
export async function gappProjectScanCwds(sessionCwd: string): Promise<string[]> {
  const reg = await readGappRegistry();
  return uniqPaths([
    sessionCwd,
    process.cwd(),
    process.env.PWD,
    ...reg.map((p) => p.cwd),
  ]);
}

export async function describeGappScan(sessionCwd: string): Promise<string> {
  const projects = await gappProjectScanCwds(sessionCwd);
  const lines = [
    `session=${sessionCwd}`,
    `process.cwd=${process.cwd()}`,
    `global=${gappGlobalRoot()}`,
    ...projects.map((c) => `scan ${gappProjectRoot(c)}`),
  ];
  return lines.join("\n");
}

function filterGapps(
  apps: GappMeta[],
  options?: { includeArchived?: boolean; includeDisabled?: boolean; enabledOnly?: boolean },
): GappMeta[] {
  let all = apps;
  if (options?.enabledOnly) {
    return all.filter((m) => m.enabled && !m.archived);
  }
  if (!options?.includeArchived) all = all.filter((m) => !m.archived);
  if (!options?.includeDisabled) all = all.filter((m) => m.enabled || m.archived);
  return all;
}

export async function listGapps(options?: {
  cwd?: string;
  includeArchived?: boolean;
  includeDisabled?: boolean;
  enabledOnly?: boolean;
}): Promise<GappMeta[]> {
  // 1) session cwd  2) process.cwd  3) registry projects  4) global
  // No walk-up. Each project path is always `<cwd>/.pi/gapp` (see gappProjectRoot).
  const sessionCwd = options?.cwd ?? process.cwd();
  const byKey = new Map<string, GappMeta>();
  const add = (apps: GappMeta[]) => {
    for (const m of apps) {
      byKey.set(`${m.scope}:${m.cwd || ""}:${m.id}`, m);
    }
  };

  add(await listScope("global", sessionCwd));

  const projectCwds = await gappProjectScanCwds(sessionCwd);
  for (const pc of projectCwds) {
    const root = gappProjectRoot(pc);
    const apps = await listScopeAtRoot("project", root, pc);
    add(apps);
    // Keep registry warm when we actually find apps under session/process cwd.
    if (apps.length > 0 && (pc === sessionCwd || pc === process.cwd())) {
      void touchGappProject(pc, basename(pc)).catch(() => {});
    }
  }

  const all = filterGapps([...byKey.values()], options);
  return all.sort((a, b) => {
    const rank = (m: GappMeta) => {
      if (m.scope === "project" && m.cwd === sessionCwd) return 0;
      if (m.scope === "project" && m.cwd === process.cwd()) return 1;
      if (m.scope === "project") return 2;
      return 3;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (b.updated || "").localeCompare(a.updated || "");
  });
}

export async function listOnlineGapps(cwd = process.cwd()): Promise<GappMeta[]> {
  return listGapps({ cwd, enabledOnly: true, includeArchived: false });
}

export async function resolveGapp(id: string, cwd = process.cwd()): Promise<GappBundle | null> {
  const safeId = validateGappId(id);
  for (const pc of await gappProjectScanCwds(cwd)) {
    const b = await loadGappBundle("project", safeId, pc);
    if (b) return b;
  }
  return loadGappBundle("global", safeId, cwd);
}

/**
 * Resolve by 1-based list index (`1`, `#2`) or by id.
 * Index uses the same ordering as `listGapps({ includeDisabled: true })`.
 */
export async function resolveGappRef(
  ref: string,
  options?: { cwd?: string; includeArchived?: boolean },
): Promise<GappBundle | null> {
  const cwd = options?.cwd ?? process.cwd();
  const raw = (ref ?? "").trim();
  if (!raw) return null;

  const indexMatch = raw.match(/^#?(\d+)$/);
  if (indexMatch) {
    const n = Number(indexMatch[1]);
    if (!Number.isFinite(n) || n < 1) return null;
    const apps = await listGapps({
      cwd,
      includeArchived: options?.includeArchived === true,
      includeDisabled: true,
    });
    const meta = apps[n - 1];
    if (!meta) return null;
    if (meta.scope === "project" && meta.cwd) {
      return loadGappBundle("project", meta.id, meta.cwd);
    }
    return loadGappBundle(meta.scope, meta.id, cwd);
  }

  try {
    return await resolveGapp(raw, cwd);
  } catch (e) {
    if (e instanceof GappValidationError) return null;
    throw e;
  }
}

export async function upsertGapp(input: {
  id?: string;
  name: string;
  description?: string;
  scope?: GappScope;
  enabled?: boolean;
  archived?: boolean;
  width?: number;
  height?: number;
  /** single (default) = one live connection; multi = allow concurrent windows */
  instances?: GappInstances;
  state?: unknown;
  html: string;
  cwd?: string;
}): Promise<GappBundle> {
  const cwd = input.cwd ?? process.cwd();
  const scope: GappScope = input.scope === "global" ? "global" : "project";
  const id = input.id ? validateGappId(input.id) : slugifyGappId(input.name);
  if (!input.html || !input.html.trim()) {
    throw new GappValidationError("html is required");
  }

  const dir = gappDir(scope, id, cwd);
  await ensureDir(dir);

  const existing = await readJsonFile<GappMeta>(join(dir, "meta.json"));
  // Snapshot previous revision via portable gapp-sdk (version history for Raycast).
  if (existing) {
    try {
      const sdk = await importGappSdk();
      if (sdk?.snapshotVersion) await sdk.snapshotVersion(dir, "upsert");
    } catch {
      // non-fatal if sdk missing
    }
  }

  const now = new Date().toISOString();
  const prevVersion = typeof (existing as any)?.version === "number" ? (existing as any).version : 0;
  const meta = normalizeMeta(
    {
      id,
      name: input.name,
      description: input.description ?? existing?.description ?? "",
      created: existing?.created,
      updated: now,
      enabled: input.enabled ?? existing?.enabled ?? true,
      archived: input.archived ?? existing?.archived ?? false,
      width: input.width ?? existing?.width,
      height: input.height ?? existing?.height,
      instances: input.instances ?? existing?.instances ?? "single",
      transparent: (input as any).transparent ?? (existing as any)?.transparent,
      frameless: (input as any).frameless ?? (existing as any)?.frameless,
    },
    scope,
    cwd,
  );
  (meta as any).version = prevVersion + 1;
  (meta as any).runCount = (existing as any)?.runCount ?? 0;
  (meta as any).lastRunAt = (existing as any)?.lastRunAt ?? null;

  const state = input.state !== undefined ? input.state : (await readJsonFile(join(dir, "state.json"))) ?? {};

  await writeJsonFile(join(dir, "meta.json"), meta);
  await writeJsonFile(join(dir, "state.json"), state);
  await writeFile(join(dir, "index.html"), input.html, "utf-8");

  // Register project so /gapp list works from other cwds (local registry + optional SDK).
  if (scope === "project") {
    await touchGappProject(cwd, basename(cwd)).catch(() => {});
    try {
      const sdk = await importGappSdk();
      if (sdk?.touchProject) await sdk.touchProject(cwd, { name: cwd.split("/").pop() });
    } catch {
      // ignore
    }
  }

  return { meta, state, html: input.html, dir };
}

/** Lazy-load portable SDK from local glimpse checkout or node_modules. */
async function importGappSdk(): Promise<any | null> {
  const { pathToFileURL } = await import("node:url");
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");
  const candidates = [
    process.env.GAPP_SDK_PATH,
    join(homedir(), "Dev/AI/glimpse/gapp-sdk/src/index.mjs"),
    join(homedir(), "Dev/glimpse/gapp-sdk/src/index.mjs"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) {
      return import(pathToFileURL(c).href);
    }
  }
  try {
    return await import("@glimpse/gapp-sdk");
  } catch {
    return null;
  }
}

export async function setGappState(
  id: string,
  state: unknown,
  options?: { scope?: GappScope; cwd?: string; merge?: boolean },
): Promise<{ meta: GappMeta; state: unknown; dir: string }> {
  const cwd = options?.cwd ?? process.cwd();
  const bundle = options?.scope
    ? await loadGappBundle(options.scope, id, cwd)
    : await resolveGapp(id, cwd);
  if (!bundle) throw new GappValidationError(`GAPP not found: ${id}`);

  let next = state;
  if (options?.merge) {
    const prev = bundle.state;
    if (prev && typeof prev === "object" && !Array.isArray(prev) && state && typeof state === "object" && !Array.isArray(state)) {
      next = { ...(prev as object), ...(state as object) };
    }
  }

  const meta: GappMeta = { ...bundle.meta, updated: new Date().toISOString() };
  await writeJsonFile(join(bundle.dir, "state.json"), next);
  await writeJsonFile(join(bundle.dir, "meta.json"), meta);
  return { meta, state: next, dir: bundle.dir };
}

export async function setGappStatus(
  id: string,
  status: { enabled?: boolean; archived?: boolean },
  options?: { scope?: GappScope; cwd?: string },
): Promise<GappMeta> {
  const cwd = options?.cwd ?? process.cwd();
  const bundle = options?.scope
    ? await loadGappBundle(options.scope, id, cwd)
    : await resolveGapp(id, cwd);
  if (!bundle) throw new GappValidationError(`GAPP not found: ${id}`);

  const meta: GappMeta = {
    ...bundle.meta,
    updated: new Date().toISOString(),
    enabled: status.enabled ?? bundle.meta.enabled,
    archived: status.archived ?? bundle.meta.archived,
  };
  // Archive implies offline; unarchive keeps previous enabled unless set.
  if (status.archived === true) meta.enabled = false;
  await writeJsonFile(join(bundle.dir, "meta.json"), meta);
  return meta;
}

export async function deleteGapp(
  id: string,
  options?: { scope?: GappScope; cwd?: string },
): Promise<boolean> {
  const cwd = options?.cwd ?? process.cwd();
  const bundle = options?.scope
    ? await loadGappBundle(options.scope, id, cwd)
    : await resolveGapp(id, cwd);
  if (!bundle) return false;
  for (const file of ["meta.json", "state.json", "index.html"]) {
    await unlink(join(bundle.dir, file)).catch(() => {});
  }
  // leave empty dir; trash preferred by policy but recursive trash is heavier — keep soft empty
  return true;
}

export interface InjectGappRuntimeOptions {
  /** e.g. http://127.0.0.1:54888 — enables multipath host fetch fallback */
  hostBase?: string;
  mode?: "pi-live" | "isolated";
  sessionId?: string;
  /** Absolute file URL for the trusted app-owned tools.mjs module. */
  toolsModuleUrl?: string;
}

/** Inject GappStore + GappHost bridge + live state into HTML before opening.
 * MUST run before app scripts (head / early body) — late inject breaks loadJson().
 */
export function injectGappRuntime(
  html: string,
  meta: GappMeta,
  state: unknown,
  options?: InjectGappRuntimeOptions,
): string {
  const hostBase = options?.hostBase || "";
  const mode = options?.mode || "pi-live";
  const sessionId = options?.sessionId || "";
  const toolsModuleUrl = options?.toolsModuleUrl || "";
  const nativeBase = `<style id="gapp-native-base">
:root{color-scheme:light dark;--gapp-system-accent:#007aff;--gapp-font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;--gapp-focus-ring:color-mix(in srgb,var(--gapp-system-accent) 35%,transparent)}
html{font-family:var(--gapp-font-sans)}
button,input,select,textarea{font:inherit}
:focus-visible{outline:2px solid var(--gapp-system-accent);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>`;
  const bridge = `<script id="gapp-runtime">
window.__GAPP_ID__=${JSON.stringify(meta.id)};
window.__GAPP_META__=${JSON.stringify({
    id: meta.id,
    name: meta.name,
    scope: meta.scope,
    instances: meta.instances || "single",
  })};
window.__GAPP_STATE__=${JSON.stringify(state ?? {})};
window.__GAPP_TOOLS_MODULE_URL__=${JSON.stringify(toolsModuleUrl)};
window.__GAPP_HOST__=${JSON.stringify({
    mode,
    protocolVersion: "0.1",
    connected: true,
    hostBase,
    sessionId,
  })};
(function(){
  var state = window.__GAPP_STATE__;
  var listeners = [];
  var toolHandler = null;
  var liveTools = [];
  var liveRevision = 0;
  var genWaiters = {};
  var rpcWaiters = {};
  function emitState(){ for (var i=0;i<listeners.length;i++) try{listeners[i](state)}catch(e){} }
  function wireSend(payload){
    payload.v = payload.v || "0.1";
    payload.id = payload.id || window.__GAPP_ID__;
    payload.ts = payload.ts || new Date().toISOString();
    if (window.glimpse && typeof window.glimpse.send === "function") window.glimpse.send(payload);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ __gappEvent: true, event: payload }, "*");
  }
  function persist(reason){
    wireSend({ type: "gapp_state", state: state, reason: reason || "set" });
  }
  function hostFetch(method, path, body){
    var base = (window.__GAPP_HOST__ && window.__GAPP_HOST__.hostBase) || "";
    if (!base || typeof fetch !== "function") return Promise.reject(new Error("host_unavailable"));
    return fetch(base + path, {
      method: method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function(r){ return r.json().then(function(j){ return { status: r.status, data: j }; }); });
  }
  window.GappStore = {
    get: function(){ return state; },
    set: function(partial){
      if (!partial || typeof partial !== "object" || Array.isArray(partial)) throw new Error("GappStore.set expects a plain object");
      state = Object.assign({}, state && typeof state === "object" && !Array.isArray(state) ? state : {}, partial);
      window.__GAPP_STATE__ = state;
      emitState(); persist("set");
      return state;
    },
    replace: function(next){
      state = next;
      window.__GAPP_STATE__ = state;
      emitState(); persist("replace");
      return state;
    },
    subscribe: function(fn){
      if (typeof fn !== "function") throw new Error("subscribe expects function");
      listeners.push(fn);
      return function(){ listeners = listeners.filter(function(x){ return x !== fn; }); };
    },
    persist: function(){ persist("manual"); }
  };
  window.GappHost = {
    version: "0.1",
    get mode(){ return (window.__GAPP_HOST__ && window.__GAPP_HOST__.mode) || "isolated"; },
    get connected(){ return !!(window.__GAPP_HOST__ && window.__GAPP_HOST__.connected); },
    registerTools: function(tools, opts){
      liveTools = Array.isArray(tools) ? tools.slice() : [];
      liveRevision = (opts && opts.revision != null) ? opts.revision : (liveRevision + 1);
      wireSend({ type: "gapp_tools_register", revision: liveRevision, tools: liveTools });
      var base = (window.__GAPP_HOST__ && window.__GAPP_HOST__.hostBase) || "";
      if (base) {
        hostFetch("PUT", "/v1/gapp/apps/" + encodeURIComponent(window.__GAPP_ID__) + "/tools", {
          tools: liveTools, revision: liveRevision
        }).catch(function(){});
      }
      return liveTools;
    },
    unregisterTools: function(){
      liveTools = [];
      liveRevision = 0;
      wireSend({ type: "gapp_tools_unregister" });
    },
    listTools: function(){ return liveTools.slice(); },
    onToolCall: function(handler){
      if (typeof handler !== "function") throw new Error("onToolCall expects function");
      toolHandler = handler;
      return function(){ if (toolHandler === handler) toolHandler = null; };
    },
    emit: function(event, payload, opts){
      opts = opts || {};
      wireSend({
        type: "gapp_event",
        event: String(event || "event"),
        payload: payload,
        notifyAgent: !!opts.notifyAgent,
        prompt: opts.prompt
      });
      if (opts.notifyAgent) {
        hostFetch("POST", "/v1/gapp/apps/" + encodeURIComponent(window.__GAPP_ID__) + "/events", {
          event: event, payload: payload, notifyAgent: true, prompt: opts.prompt
        }).catch(function(){});
      }
    },
    generate: function(prompt, options){
      options = options || {};
      var requestId = "gen_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      return new Promise(function(resolve, reject){
        genWaiters[requestId] = { resolve: resolve, reject: reject };
        wireSend({
          type: "gapp_llm_request",
          requestId: requestId,
          prompt: String(prompt || ""),
          system: options.system,
          stream: !!options.stream,
          maxTokens: options.maxTokens,
          format: options.format || "text",
          mode: "agent"
        });
        hostFetch("POST", "/v1/gapp/apps/" + encodeURIComponent(window.__GAPP_ID__) + "/generate", {
          requestId: requestId,
          prompt: String(prompt || ""),
          system: options.system,
          format: options.format || "text"
        }).catch(function(){});
        setTimeout(function(){
          if (!genWaiters[requestId]) return;
          var w = genWaiters[requestId];
          delete genWaiters[requestId];
          w.reject(new Error("timeout"));
        }, options.timeoutMs || 120000);
      });
    },
    rpc: function(method, args, options){
      options = options || {};
      if (typeof method !== "string" || !method.trim()) return Promise.reject(new Error("RPC method required"));
      if (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) {
        return Promise.reject(new Error("RPC arguments must be an object"));
      }
      var requestId = "rpc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      return new Promise(function(resolve, reject){
        rpcWaiters[requestId] = { resolve: resolve, reject: reject };
        wireSend({
          type: "gapp_host_request",
          requestId: requestId,
          method: method.trim(),
          arguments: args || {}
        });
        setTimeout(function(){
          if (!rpcWaiters[requestId]) return;
          var waiter = rpcWaiters[requestId];
          delete rpcWaiters[requestId];
          waiter.reject(new Error("Host RPC timeout"));
        }, options.timeoutMs || 360000);
      });
    },
    getState: function(){ return window.GappStore.get(); },
    setState: function(p){ return window.GappStore.set(p); },
    replaceState: function(s){ return window.GappStore.replace(s); },
    __dispatch: function(msg){
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "gapp_state_push") {
        state = msg.state;
        window.__GAPP_STATE__ = state;
        emitState();
        return;
      }
      if (msg.type === "gapp_tool_call") {
        var rid = msg.requestId;
        var name = msg.name;
        var args = msg.arguments || {};
        function reply(ok, result, error){
          wireSend({ type: "gapp_tool_result", requestId: rid, ok: ok, result: result, error: error });
        }
        if (!toolHandler) {
          reply(false, null, { code: "handler_error", message: "no onToolCall handler" });
          return;
        }
        Promise.resolve().then(function(){ return toolHandler(name, args, { requestId: rid }); })
          .then(function(result){ reply(true, result); })
          .catch(function(err){
            reply(false, null, { code: "handler_error", message: err && err.message ? err.message : String(err) });
          });
        return;
      }
      if (msg.type === "gapp_host_result") {
        var rpcWaiter = rpcWaiters[msg.requestId];
        if (!rpcWaiter) return;
        delete rpcWaiters[msg.requestId];
        if (msg.ok) rpcWaiter.resolve(msg.result);
        else rpcWaiter.reject(new Error((msg.error && msg.error.message) || "Host RPC failed"));
        return;
      }
      if (msg.type === "gapp_llm_done") {
        var w = genWaiters[msg.requestId];
        if (!w) return;
        delete genWaiters[msg.requestId];
        if (msg.ok) w.resolve(msg.text || "");
        else w.reject(new Error((msg.error && msg.error.message) || "generate failed"));
        return;
      }
      if (msg.type === "gapp_llm_chunk") {
        /* optional streaming hook */
        if (typeof window.__gappOnLlmChunk === "function") {
          try { window.__gappOnLlmChunk(msg); } catch (e) {}
        }
        return;
      }
      if (msg.type === "gapp_host_info") {
        window.__GAPP_HOST__ = Object.assign({}, window.__GAPP_HOST__ || {}, {
          mode: msg.mode,
          protocolVersion: msg.protocolVersion,
          connected: true,
          capabilities: msg.capabilities
        });
      }
    }
  };
  wireSend({ type: "gapp_ready" });
})();
</script>`;

  // Strip any prior runtime so we never double-inject or leave a late copy.
  let out = html
    .replace(/<script id=["']gapp-runtime["']>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/<style id=["']gapp-native-base["']>[\s\S]*?<\/style>\s*/gi, "");

  // Prefer <head> so GappStore exists before body scripts run loadJson().
  if (/<head\b[^>]*>/i.test(out)) {
    return out.replace(/<head\b[^>]*>/i, (m) => m + "\n" + nativeBase + "\n" + bridge + "\n");
  }
  if (/<body\b[^>]*>/i.test(out)) {
    return out.replace(/<body\b[^>]*>/i, (m) => m + "\n" + nativeBase + "\n" + bridge + "\n");
  }
  if (/<!doctype|<html[\s>]/i.test(out)) {
    return nativeBase + "\n" + bridge + "\n" + out;
  }
  // fragment → minimal shell (bridge first)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
${nativeBase}
${bridge}
<style>
:root{color-scheme:light dark;--bg:#f5f5f7;--fg:#1d1d1f;--card:#fff;--border:#d2d2d7;--accent:#0071e3;--muted:#6e6e73}
@media (prefers-color-scheme: dark){:root{--bg:#1c1c1e;--fg:#f5f5f7;--card:#2c2c2e;--border:#3a3a3c;--accent:#0a84ff;--muted:#98989d}}
*{box-sizing:border-box}body{margin:0;padding:16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
button,input,select,textarea{font:inherit}button{cursor:pointer}
</style></head><body>
${out}
</body></html>`;
}
