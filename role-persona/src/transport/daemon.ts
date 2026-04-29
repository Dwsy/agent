#!/usr/bin/env bun

/**
 * HTTP Daemon — persistent Bun.serve with pidfile single-instance.
 *
 * Features:
 * - PID file at ~/.pi/role-persona-daemon.pid for single-instance enforcement
 * - Background mode via --background flag (detaches from terminal)
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Warm service: stays in memory, no cold-start per request
 *
 * Usage:
 *   bun src/bin/daemon.ts                         # foreground, port 3939
 *   bun src/bin/daemon.ts --background            # detach, run in background
 *   bun src/bin/daemon.ts --port 8080             # custom port
 *   kill $(cat ~/.pi/role-persona-daemon.pid)     # stop
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createService, type RolePersonaService } from "../service/index.ts";

// ── Config ──

const DAEMON_DIR = join(homedir(), ".pi");
const PID_FILE = join(DAEMON_DIR, "role-persona-daemon.pid");
const PORT_FILE = join(DAEMON_DIR, "role-persona-daemon.port");
const DEFAULT_PORT = 3939;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── PID Management ──

function readPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    if (isNaN(pid)) return null;
    // Check if process is alive
    try { process.kill(pid, 0); return pid; } catch { return null; }
  } catch { return null; }
}

function writePid(pid: number) {
  if (!existsSync(DAEMON_DIR)) mkdirSync(DAEMON_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), "utf-8");
}

function writePort(port: number) {
  if (!existsSync(DAEMON_DIR)) mkdirSync(DAEMON_DIR, { recursive: true });
  writeFileSync(PORT_FILE, String(port), "utf-8");
}

function removePid() {
  try { unlinkSync(PID_FILE); } catch {}
  try { unlinkSync(PORT_FILE); } catch {}
}

export function readPort(): number {
  try {
    if (existsSync(PORT_FILE)) return parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10) || DEFAULT_PORT;
  } catch {}
  return DEFAULT_PORT;
}

export function isDaemonRunning(): boolean {
  return readPid() !== null;
}

// ── Routes ──

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function errResponse(e: unknown, status = 500): Response {
  return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, status);
}

async function readBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function buildRoutes(service: RolePersonaService): Map<string, (req: Request) => Promise<Response>> {
  const r = new Map<string, (req: Request) => Promise<Response>>();

  r.set("GET /api/health", async () => {
    return json({ ok: true, pid: process.pid, uptime: process.uptime(), role: service.getActiveRole()?.name ?? null });
  });

  // ── Role ──
  r.set("POST /api/init", async (req) => {
    const { cwd } = await readBody<{ cwd: string }>(req);
    return json({ ok: true, data: await service.init(cwd) });
  });
  r.set("POST /api/role/list", async () => json({ ok: true, data: service.role.list() }));
  r.set("POST /api/role/create", async (req) => {
    const { name } = await readBody<{ name: string }>(req);
    return name ? json({ ok: true, data: service.role.create(name) }) : errResponse("name required", 400);
  });
  r.set("POST /api/role/activate", async (req) => {
    const { name } = await readBody<{ name: string }>(req);
    return name ? json({ ok: true, data: service.role.activate(name) }) : errResponse("name required", 400);
  });
  r.set("POST /api/role/info", async () => {
    const role = service.getActiveRole();
    return json({ ok: true, data: role });
  });
  r.set("POST /api/role/map", async (req) => {
    const { cwd, name } = await readBody<{ cwd: string; name: string }>(req);
    return (cwd && name) ? json({ ok: true, data: service.role.map(cwd, name) }) : errResponse("cwd+name required", 400);
  });
  r.set("POST /api/role/unmap", async (req) => {
    const { cwd } = await readBody<{ cwd: string }>(req);
    return cwd ? json({ ok: true, data: service.role.unmap(cwd) }) : errResponse("cwd required", 400);
  });

  // ── Memory ──
  r.set("POST /api/memory/add-learning", async (req) => {
    const { content } = await readBody<{ content: string }>(req);
    return content ? json({ ok: true, data: await service.memory.addLearning(content) }) : errResponse("content required", 400);
  });
  r.set("POST /api/memory/add-preference", async (req) => {
    const { content, category } = await readBody<{ content: string; category?: string }>(req);
    return content ? json({ ok: true, data: service.memory.addPreference(content, category) }) : errResponse("content required", 400);
  });
  r.set("POST /api/memory/update-learning", async (req) => {
    const { needle, text } = await readBody<{ needle: string; text: string }>(req);
    return (needle && text) ? json({ ok: true, data: service.memory.updateLearning(needle, text) }) : errResponse("needle+text required", 400);
  });
  r.set("POST /api/memory/update-preference", async (req) => {
    const { needle, text, category } = await readBody<{ needle: string; text: string; category?: string }>(req);
    return (needle && text) ? json({ ok: true, data: service.memory.updatePreference(needle, text, category) }) : errResponse("needle+text required", 400);
  });
  r.set("POST /api/memory/delete-learning", async (req) => {
    const { needle } = await readBody<{ needle: string }>(req);
    return needle ? json({ ok: true, data: service.memory.deleteLearning(needle) }) : errResponse("needle required", 400);
  });
  r.set("POST /api/memory/delete-preference", async (req) => {
    const { needle } = await readBody<{ needle: string }>(req);
    return needle ? json({ ok: true, data: service.memory.deletePreference(needle) }) : errResponse("needle required", 400);
  });
  r.set("POST /api/memory/reinforce", async (req) => {
    const { needle } = await readBody<{ needle: string }>(req);
    return needle ? json({ ok: true, data: service.memory.reinforce(needle) }) : errResponse("needle required", 400);
  });
  r.set("POST /api/memory/search", async (req) => {
    const { query } = await readBody<{ query: string }>(req);
    return query ? json({ ok: true, data: await service.memory.search(query) }) : errResponse("query required", 400);
  });
  r.set("POST /api/memory/list", async () => json({ ok: true, data: service.memory.list() }));
  r.set("POST /api/memory/consolidate", async () => json({ ok: true, data: service.memory.consolidate() }));
  r.set("POST /api/memory/repair", async () => json({ ok: true, data: service.memory.repair(true) }));
  r.set("POST /api/memory/conflicts", async () => json({ ok: true, data: service.memory.detectConflicts() }));
  r.set("POST /api/memory/log", async () => json({ ok: true, data: service.memory.getLog() }));
  r.set("POST /api/memory/export", async (req) => {
    const { path } = await readBody<{ path?: string }>(req);
    const role = service.getActiveRole();
    if (!role) return errResponse("No active role", 400);
    const html = service.memory.exportHtml(path);
    return json({ ok: true, data: { bytes: html.length } });
  });
  r.set("POST /api/memory/extract", async (req) => {
    const { messages } = await readBody<{ messages: any[] }>(req);
    return json({ ok: true, data: await service.memory.autoExtract(messages || []) });
  });
  r.set("POST /api/memory/tidy", async (req) => {
    const { model } = await readBody<{ model?: string }>(req);
    return json({ ok: true, data: await service.memory.tidyLlm(model) });
  });

  // ── Knowledge ──
  r.set("POST /api/knowledge/list", async (req) => {
    const { category } = await readBody<{ category?: string }>(req);
    return json({ ok: true, data: service.knowledge.list(category) });
  });
  r.set("POST /api/knowledge/search", async (req) => {
    const { query, tags } = await readBody<{ query: string; tags?: string[] }>(req);
    return query ? json({ ok: true, data: service.knowledge.search(query, { tags }) }) : errResponse("query required", 400);
  });
  r.set("POST /api/knowledge/read", async (req) => {
    const { path } = await readBody<{ path: string }>(req);
    if (!path) return errResponse("path required", 400);
    const result = service.knowledge.read(path);
    return result ? json({ ok: true, data: result }) : errResponse("Not found", 404);
  });
  r.set("POST /api/knowledge/write", async (req) => {
    const entry = await readBody<any>(req);
    return entry?.title ? json({ ok: true, data: service.knowledge.write(entry) }) : errResponse("title required", 400);
  });

  // ── Embedding ──
  r.set("POST /api/embedding/stats", async () => json({ ok: true, data: await service.embedding.stats() }));
  r.set("POST /api/embedding/rebuild", async () => json({ ok: true, data: await service.embedding.rebuild() }));

  // ── System Prompt ──
  r.set("POST /api/prompt", async (req) => {
    const { base } = await readBody<{ base?: string }>(req);
    return json({ ok: true, data: { prompt: await service.buildSystemPrompt(base || "You are an AI assistant.") } });
  });

  // ── Shutdown ──
  r.set("POST /api/shutdown", async () => {
    setTimeout(() => { removePid(); process.exit(0); }, 100);
    return json({ ok: true, data: { shutting_down: true } });
  });

  return r;
}

// ── Start ──

export interface DaemonOptions {
  port?: number;
  background?: boolean;
}

export function startDaemon(opts: DaemonOptions = {}) {
  // Single instance check
  const existingPid = readPid();
  if (existingPid) {
    console.error(`[daemon] already running (pid ${existingPid}). Kill it first: kill ${existingPid}`);
    process.exit(1);
  }

  const port = opts.port ?? DEFAULT_PORT;
  const service = createService();
  const routes = buildRoutes(service);

  // Init service
  service.init(process.cwd()).catch((e) => console.error("[daemon] init failed:", e));

  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const routeKey = `${req.method} ${new URL(req.url).pathname}`;
      const handler = routes.get(routeKey);
      if (!handler) return json({ ok: false, error: `Not found: ${routeKey}` }, 404);
      try { return await handler(req); } catch (e) { return errResponse(e); }
    },
  });

  // Write PID + port
  writePid(process.pid);
  writePort(server.port);

  // Graceful shutdown
  const shutdown = () => {
    console.log("[daemon] shutting down...");
    removePid();
    service.dispose().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log(`[role-persona daemon] pid=${process.pid} http://localhost:${server.port}`);
  console.log(`[role-persona daemon] pidfile=${PID_FILE}`);
  console.log(`[role-persona daemon] stop: kill ${process.pid} or POST /api/shutdown`);

  return { server, service };
}

// ── Background spawn ──

export function startDaemonBackground(port = DEFAULT_PORT): { ok: boolean; pid?: number; error?: string } {
  if (isDaemonRunning()) {
    const pid = readPid()!;
    return { ok: true, pid, error: `already running (pid ${pid})` };
  }

  const proc = spawn(
    "bun",
    [join(import.meta.dir || ".", "../transport/daemon.ts"), "--port", String(port)],
    { detached: true, stdio: ["ignore", "pipe", "pipe"] }
  );

  // Wait a bit for startup
  return new Promise((resolve) => {
    let resolved = false;
    proc.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes("pid=") && !resolved) {
        resolved = true;
        const pid = readPid();
        resolve({ ok: true, pid: pid || proc.pid });
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes("already running") && !resolved) {
        resolved = true;
        resolve({ ok: false, error: line.trim() });
      }
    });
    proc.unref();
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const pid = readPid();
        resolve(pid ? { ok: true, pid } : { ok: false, error: "timeout" });
      }
    }, 3000);
  });
}

// ── CLI entry ──

if (import.meta.main) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : DEFAULT_PORT;
  const background = args.includes("--background");

  if (background) {
    startDaemonBackground(port).then((r) => {
      if (r.ok) {
        console.log(`[daemon] started in background (pid ${r.pid})`);
      } else {
        console.error(`[daemon] ${r.error}`);
      }
      process.exit(r.ok ? 0 : 1);
    });
  } else {
    startDaemon({ port });
  }
}
