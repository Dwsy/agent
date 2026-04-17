/**
 * Detailed file logger for role-persona extension.
 *
 * - Logs to ~/.pi/roles/.log/YYYY-MM-DD.log
 * - Enabled by default, disable with ROLE_LOG=0 or config.logging.enabled
 * - Format: [HH:MM:SS.mmm] [TAG] [role=xxx] message {meta}
 */

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";

const ENABLED = config.logging.enabled;

// Per-scope timing tracker
const timers = new Map<string, number>();

// Current role context (set by index.ts)
let _currentRole = "-";

export function setCurrentRole(role: string): void {
  _currentRole = role;
}

function getLogDir(): string {
  const rolesDir = config.storage.rolesDir.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
  return join(rolesDir, ".log");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function ensureLogDir(): void {
  const dir = getLogDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function logFilePath(): string {
  return join(getLogDir(), `${today()}.log`);
}

function metaToString(meta?: Record<string, unknown> | string): string {
  if (typeof meta === "string") return ` | ${meta}`;
  if (!meta || Object.keys(meta).length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${v}`);
    } else if (typeof v === "string") {
      parts.push(v.length > 80 ? `${k}=${v.slice(0, 77)}...` : `${k}=${v}`);
    } else {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  return parts.length > 0 ? ` {${parts.join(" ")}}` : "";
}

/**
 * Write a log line.
 * @param tag  Short tag like "auto-extract", "llm-tidy", "memory-add"
 * @param msg  Human-readable message
 * @param meta Optional structured metadata (duration_ms, tokens, model, etc.)
 */
export function log(tag: string, msg: string, meta?: Record<string, unknown> | string): void {
  if (!ENABLED) return;
  try {
    ensureLogDir();
    const role = _currentRole !== "-" ? ` role=${_currentRole}` : "";
    const metaStr = metaToString(meta);
    const line = `[${timestamp()}] [${tag}]${role} ${msg}${metaStr}`;
    appendFileSync(logFilePath(), line + "\n", "utf-8");
  } catch {
    // Logging should never break the extension
  }
}

/**
 * Start a timed operation. Returns a scope ID for logEnd.
 * Usage:
 *   const scope = logStart("auto-extract", "model call", { model: "xxx" });
 *   ... do work ...
 *   logEnd(scope, "done", { tokens: 1234 });
 */
export function logStart(tag: string, msg: string, meta?: Record<string, unknown> | string): string {
  const scope = `${tag}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  timers.set(scope, Date.now());
  log(tag, `▶ ${msg}`, meta);
  return scope;
}

/**
 * End a timed operation. Logs duration automatically.
 */
export function logEnd(scope: string, msg: string, meta?: Record<string, unknown> | string): void {
  const start = timers.get(scope);
  const duration_ms = start ? Date.now() - start : undefined;
  timers.delete(scope);
  const tag = scope.split(":")[0];
  if (typeof meta === "string") {
    log(tag, `◀ ${msg}`, { detail: meta, duration_ms });
  } else {
    log(tag, `◀ ${msg}`, { ...meta, duration_ms });
  }
}

/**
 * Log with a level indicator.
 */
export function logError(tag: string, msg: string, meta?: Record<string, unknown> | string): void {
  log(tag, `❌ ${msg}`, meta);
}

export function logWarn(tag: string, msg: string, meta?: Record<string, unknown> | string): void {
  log(tag, `⚠️  ${msg}`, meta);
}

export function logOk(tag: string, msg: string, meta?: Record<string, unknown> | string): void {
  log(tag, `✅ ${msg}`, meta);
}

/**
 * Log a separator/section header (for readability in log files).
 */
export function logSection(tag: string, title: string): void {
  if (!ENABLED) return;
  log(tag, `═══ ${title} ═══`);
}

/** Whether logging is enabled */
export const isLogEnabled = ENABLED;
