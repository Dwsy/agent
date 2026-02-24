/**
 * File Logger — writes logs to daily rotating files.
 *
 * Features:
 * - Daily rotation: gateway-YYYY-MM-DD.log
 * - Size-based rotation: gateway-YYYY-MM-DD.N.log when maxFileSize exceeded
 * - Retention: auto-delete files older than N days
 * - Level filtering: debug/info/warn/error
 * - Dual output: console + file (configurable)
 */

import { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./types.ts";

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
  /** Max file size in MB before rotation. Default: 5 */
  maxFileSize: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalConfig: FileLoggerConfig = {
  dir: "",
  fileEnabled: false,
  consoleEnabled: true,
  level: "info",
  retentionDays: 7,
  maxFileSize: 5,
};

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; 

/**
 * Initialize the file logger system.
 */
export function initFileLogger(config: Partial<FileLoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };

  if (globalConfig.fileEnabled && globalConfig.dir) {
    if (!existsSync(globalConfig.dir)) {
      mkdirSync(globalConfig.dir, { recursive: true });
    }
    
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

function writeLog(level: LogLevel, prefix: string, msg: string, args: unknown[]): void {
  
  if (LEVEL_ORDER[level] < LEVEL_ORDER[globalConfig.level]) return;

  const ts = new Date().toISOString();
  const argsStr = args.length > 0 ? " " + args.map(formatArg).join(" ") : "";
  const line = `${ts} [${level.toUpperCase().padEnd(5)}] [${prefix}] ${msg}${argsStr}`;

  
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

  
  if (globalConfig.fileEnabled && globalConfig.dir) {
    const date = ts.slice(0, 10);
    const filePath = join(globalConfig.dir, `gateway-${date}.log`);
    
    
    rotateLogIfNeeded(filePath);
    
    try {
      appendFileSync(filePath, line + "\n", "utf-8");
    } catch {
      
    }

    
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now;
      cleanOldLogs();
    }
  }
}

/**
 * Rotate log file if it exceeds maxFileSize.
 * Renames current file to gateway-YYYY-MM-DD.N.log where N is the next available index.
 */
function rotateLogIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) return;

  try {
    const stats = statSync(filePath);
    const maxBytes = globalConfig.maxFileSize * 1024 * 1024;

    if (stats.size >= maxBytes) {
      const rotatedPath = getNextRotatedPath(filePath);
      renameSync(filePath, rotatedPath);
    }
  } catch {
    // Silent fail — don't recurse into logging
  }
}

/**
 * Generate next available rotated file path.
 * E.g., gateway-2024-01-15.log → gateway-2024-01-15.1.log
 */
function getNextRotatedPath(filePath: string): string {
  const basePath = filePath.replace(/\.log$/, "");

  let index = 1;
  let rotatedPath = `${basePath}.${index}.log`;

  // Find next available index
  while (existsSync(rotatedPath)) {
    index++;
    rotatedPath = `${basePath}.${index}.log`;
  }

  return rotatedPath;
}

function cleanOldLogs(): void {
  if (!globalConfig.dir || !existsSync(globalConfig.dir)) return;

  try {
    const cutoff = Date.now() - globalConfig.retentionDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(globalConfig.dir);

    for (const file of files) {
      if (!file.startsWith("gateway-") || !file.endsWith(".log")) continue;

      
      const dateStr = file.slice(8, 18);
      const fileDate = new Date(dateStr).getTime();

      if (fileDate && fileDate < cutoff) {
        unlinkSync(join(globalConfig.dir, file));
      }
    }
  } catch {
    
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
