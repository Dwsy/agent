/**
 * Simple file logger for role-persona extension.
 *
 * - Logs to extensions/role-persona/.log/YYYY-MM-DD.log
 * - Enabled by default, disable with ROLE_LOG=0 or config.logging.enabled
 * - Each line: [HH:MM:SS] [TAG] message
 */

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.ts";

const ENABLED = config.logging.enabled;

function getLogDir(): string {
  // __dirname equivalent for ESM
  const thisFile = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
  return join(dirname(thisFile), ".log");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function timestamp(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":");
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

/**
 * Write a log line.
 * @param tag  Short tag like "auto-extract", "llm-tidy", "memory-add", "memory-reinforce"
 * @param msg  Human-readable message (one line preferred, multi-line OK)
 * @param data Optional structured data (will be JSON-stringified)
 */
export function log(tag: string, msg: string, data?: unknown): void {
  if (!ENABLED) return;
  try {
    ensureLogDir();
    const prefix = `[${timestamp()}] [${tag}]`;
    let line = `${prefix} ${msg}`;
    if (data !== undefined) {
      const json = typeof data === "string" ? data : JSON.stringify(data, null, 0);
      line += ` | ${json}`;
    }
    appendFileSync(logFilePath(), line + "\n", "utf-8");
  } catch {
    // Logging should never break the extension
  }
}

/**
 * Log a separator/section header (for readability in log files).
 */
export function logSection(tag: string, title: string): void {
  if (!ENABLED) return;
  log(tag, `--- ${title} ---`);
}

/** Whether logging is enabled */
export const isLogEnabled = ENABLED;
