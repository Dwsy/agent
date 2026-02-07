/**
 * File Logger — writes logs to daily rotating files.
 *
 * Features:
 * - Daily rotation: gateway-YYYY-MM-DD.log
 * - Retention: auto-delete files older than N days
 * - Level filtering: debug/info/warn/error
 * - Dual output: console + file (configurable)
 */

import { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface FileLoggerConfig {
  /** Directory for log files */
  dir: string;
  /** Enable file logging */
  fileEnabled: boolean;
  /** Enable console logging */
  consoleEnabled: boolean;
  /** Minimum log level */
  level: LogLevel;
  /** Days to retain log files */
  retentionDays: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// File Logger
// ============================================================================

let globalConfig: FileLoggerConfig = {
  dir: "",
  fileEnabled: false,
  consoleEnabled: true,
  level: "info",
  retentionDays: 7,
};

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Initialize the file logger system.
 */
export function initFileLogger(config: Partial<FileLoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };

  if (globalConfig.fileEnabled && globalConfig.dir) {
    if (!existsSync(globalConfig.dir)) {
      mkdirSync(globalConfig.dir, { recursive: true });
    }
    // Initial cleanup
    cleanOldLogs();
  }
}

/**
 * Create a logger that writes to both console and file.
 */
export function createFileLogger(prefix: string): Logger {
  return {
    debug: (msg, ...args) => writeLog("debug", prefix, msg, args),
    info: (msg, ...args) => writeLog("info", prefix, msg, args),
    warn: (msg, ...args) => writeLog("warn", prefix, msg, args),
    error: (msg, ...args) => writeLog("error", prefix, msg, args),
  };
}

// ============================================================================
// Internal
// ============================================================================

function writeLog(level: LogLevel, prefix: string, msg: string, args: unknown[]): void {
  // Level filter
  if (LEVEL_ORDER[level] < LEVEL_ORDER[globalConfig.level]) return;

  const ts = new Date().toISOString();
  const argsStr = args.length > 0 ? " " + args.map(formatArg).join(" ") : "";
  const line = `${ts} [${level.toUpperCase().padEnd(5)}] [${prefix}] ${msg}${argsStr}`;

  // Console output
  if (globalConfig.consoleEnabled) {
    const shortTs = ts.slice(11, 19);
    const consoleLine = `${shortTs} [${prefix}] ${msg}${argsStr}`;
    switch (level) {
      case "debug": console.debug(consoleLine); break;
      case "info": console.info(consoleLine); break;
      case "warn": console.warn(consoleLine); break;
      case "error": console.error(consoleLine); break;
    }
  }

  // File output
  if (globalConfig.fileEnabled && globalConfig.dir) {
    const date = ts.slice(0, 10);
    const filePath = join(globalConfig.dir, `gateway-${date}.log`);
    try {
      appendFileSync(filePath, line + "\n", "utf-8");
    } catch {
      // Silent fail — don't recurse into logging
    }

    // Periodic cleanup
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now;
      cleanOldLogs();
    }
  }
}

function cleanOldLogs(): void {
  if (!globalConfig.dir || !existsSync(globalConfig.dir)) return;

  try {
    const cutoff = Date.now() - globalConfig.retentionDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(globalConfig.dir);

    for (const file of files) {
      if (!file.startsWith("gateway-") || !file.endsWith(".log")) continue;

      // Parse date from filename: gateway-YYYY-MM-DD.log
      const dateStr = file.slice(8, 18);
      const fileDate = new Date(dateStr).getTime();

      if (fileDate && fileDate < cutoff) {
        unlinkSync(join(globalConfig.dir, file));
      }
    }
  } catch {
    // Silent
  }
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
