/**
 * CLI Runner — daemon HTTP first, subprocess fallback.
 *
 * Priority:
 *   1. Daemon HTTP (fast, warm, ~5ms)
 *   2. CLI subprocess (slow, cold, ~250ms)
 *
 * Zero dependency on service/core layers.
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, "../bin/cli.ts");

export interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CliOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
}

// ── Daemon detection ──

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PID_FILE = join(homedir(), ".pi", "role-persona-daemon.pid");
const PORT_FILE = join(homedir(), ".pi", "role-persona-daemon.port");

function daemonPort(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    if (isNaN(pid)) return null;
    process.kill(pid, 0); // check alive
    if (existsSync(PORT_FILE)) return parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10) || 3939;
    return 3939;
  } catch {
    return null;
  }
}

// ── HTTP path mapping ──

function mapArgsToEndpoint(args: string[]): { path: string; body: Record<string, any> } | null {
  const [cmd, sub, ...rest] = args;

  switch (cmd) {
    case "init": return { path: "/api/init", body: { cwd: args.includes("--cwd") ? args[args.indexOf("--cwd") + 1] : process.cwd() } };
    case "role":
      switch (sub) {
        case "list": return { path: "/api/role/list", body: {} };
        case "create": return { path: "/api/role/create", body: { name: rest[0] } };
        case "info": return { path: "/api/role/info", body: {} };
        case "map": return { path: "/api/role/map", body: { name: rest[0], cwd: process.cwd() } };
        case "unmap": return { path: "/api/role/unmap", body: { cwd: process.cwd() } };
      }
      break;
    case "memory":
      switch (sub) {
        case "add-learning": return { path: "/api/memory/add-learning", body: { content: rest[0] } };
        case "add-preference": return { path: "/api/memory/add-preference", body: { content: rest[0], category: rest.includes("--category") ? rest[rest.indexOf("--category") + 1] : undefined } };
        case "update-learning": return { path: "/api/memory/update-learning", body: { needle: rest[0], text: rest[1] } };
        case "update-preference": return { path: "/api/memory/update-preference", body: { needle: rest[0], text: rest[1] } };
        case "delete-learning": return { path: "/api/memory/delete-learning", body: { needle: rest[0] } };
        case "delete-preference": return { path: "/api/memory/delete-preference", body: { needle: rest[0] } };
        case "reinforce": return { path: "/api/memory/reinforce", body: { needle: rest[0] } };
        case "search": return { path: "/api/memory/search", body: { query: rest[0] } };
        case "list": return { path: "/api/memory/list", body: {} };
        case "consolidate": return { path: "/api/memory/consolidate", body: {} };
        case "repair": return { path: "/api/memory/repair", body: {} };
        case "conflicts": return { path: "/api/memory/conflicts", body: {} };
        case "log": return { path: "/api/memory/log", body: {} };
        case "export": return { path: "/api/memory/export", body: { path: rest.includes("--output") ? rest[rest.indexOf("--output") + 1] : undefined } };
        case "tidy": return { path: "/api/memory/tidy", body: { model: rest.includes("--model") ? rest[rest.indexOf("--model") + 1] : undefined } };
      }
      break;
    case "knowledge":
      switch (sub) {
        case "list": return { path: "/api/knowledge/list", body: { category: rest[0] } };
        case "search": return { path: "/api/knowledge/search", body: { query: rest[0] } };
        case "read": return { path: "/api/knowledge/read", body: { path: rest[0] } };
      }
      break;
    case "embedding":
      return { path: sub === "rebuild" ? "/api/embedding/rebuild" : "/api/embedding/stats", body: {} };
    case "prompt":
      return { path: "/api/prompt", body: {} };
  }
  return null;
}

// ── Main entry ──

/**
 * Run a CLI command. Tries daemon HTTP first, falls back to subprocess.
 */
export async function cli(args: string[], opts: CliOptions = {}): Promise<CliResult> {
  const timeout = opts.timeoutMs || 30000;

  // Try daemon HTTP first
  const port = daemonPort();
  if (port) {
    const mapped = mapArgsToEndpoint(args);
    if (mapped) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(`http://localhost:${port}${mapped.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapped.body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        return data as CliResult;
      } catch {
        // Fall through to subprocess
      }
    }
  }

  // Fallback: subprocess
  const allArgs = [CLI_PATH, ...args, "--direct"];
  if (opts.cwd) allArgs.push("--cwd", opts.cwd);

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", allArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: opts.cwd,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    if (opts.stdin) {
      proc.stdin.write(opts.stdin);
      proc.stdin.end();
    }

    const timer = timeout
      ? setTimeout(() => { proc.kill("SIGTERM"); reject(new Error("CLI timeout")); }, timeout)
      : null;

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve({ ok: code === 0, error: stderr.trim() || `Exit code: ${code}` });
        return;
      }
      try { resolve(JSON.parse(trimmed)); }
      catch { resolve({ ok: code === 0, data: trimmed, error: code !== 0 ? stderr.trim() : undefined }); }
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

export async function cliOrThrow<T = unknown>(args: string[], opts?: CliOptions): Promise<T> {
  const result = await cli(args, opts);
  if (!result.ok) throw new Error(result.error || "CLI command failed");
  return result.data as T;
}

export async function cliSafe<T = unknown>(args: string[], opts?: CliOptions): Promise<CliResult<T>> {
  return cli(args, opts) as Promise<CliResult<T>>;
}
