/**
 * Enhanced JSONL Logger for role-persona extension.
 *
 * - Logs to ~/.pi/roles/.log/YYYY-MM-DD.jsonl (one JSON object per line)
 * - Full context preservation: role, model, cwd, timestamps, complete metadata
 * - Schema version for forward compatibility
 * - Enabled by default, disable with ROLE_LOG=0 or config.logging.enabled
 * - Format: newline-delimited JSON (NDJSON/JSONL)
 */

import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { config } from "./config.ts";

const ENABLED = config.logging.enabled;

/** Current log level - lower index = more verbose */
const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

/** Current minimum log level from config */
const CURRENT_LEVEL_INDEX = LOG_LEVELS.indexOf(config.logging.level);

// Cleanup tracking - throttle to once per hour
let lastCleanupCheck = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour between cleanup checks

/**
 * Check if a log level should be output.
 * Levels: debug(0) < info(1) < warn(2) < error(3)
 */
function shouldLog(level: LogLevel): boolean {
  if (!ENABLED) return false;
  return LOG_LEVELS.indexOf(level) >= CURRENT_LEVEL_INDEX;
}

// ============================================================================
// Schema & Types
// ============================================================================

/** Log entry schema version for forward compatibility */
const SCHEMA_VERSION = "2.0.0";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Current role/persona name */
  role: string;
  /** Current working directory */
  cwd: string;
  /** Home directory */
  home: string;
  /** Process ID */
  pid: number;
  /** Node/Bun version */
  runtime: string;
  /** Platform: darwin/linux/win32 */
  platform: string;
  /** Architecture: arm64/x64 */
  arch: string;
  /** Session ID for correlation */
  sessionId?: string;
}

export interface ModelContext {
  /** Provider ID */
  provider?: string;
  /** Model ID */
  model?: string;
  /** Full model identifier */
  modelId?: string;
  /** API endpoint or base URL */
  baseUrl?: string;
}

export interface LogEntry {
  /** Schema version */
  schema: string;
  /** ISO 8601 timestamp with milliseconds */
  timestamp: string;
  /** Unix epoch in milliseconds */
  epoch_ms: number;
  /** Log level */
  level: LogLevel;
  /** Operation tag/category */
  tag: string;
  /** Human-readable message */
  message: string;
  /** Full runtime context */
  context: LogContext;
  /** Model information (if applicable) */
  model?: ModelContext;
  /** Structured metadata (never truncated) */
  meta: Record<string, unknown>;
  /** Operation timing information */
  timing?: {
    /** Operation start time (ISO 8601) */
    start?: string;
    /** Operation end time (ISO 8601) */
    end?: string;
    /** Duration in milliseconds */
    duration_ms?: number;
  };
  /** Operation scope ID for tracing */
  scope?: string;
  /** Parent scope ID for nested operations */
  parentScope?: string;
  /** Correlation ID for distributed tracing */
  traceId?: string;
}

// ============================================================================
// Context Management
// ============================================================================

// Per-scope timing tracker: scope -> { startMs, startIso, parentScope? }
const scopeMap = new Map<string, { startMs: number; startIso: string; parentScope?: string }>();

// Current role context (set by index.ts)
let _currentRole = "-";

// Trace ID for the current session/operation chain
let _currentTraceId: string | undefined;

// Session ID from ExtensionContext.sessionManager (set by index.ts on session_start)
let _currentSessionId: string | undefined;

export function setCurrentRole(role: string): void {
  _currentRole = role;
}

export function setTraceId(traceId: string): void {
  _currentTraceId = traceId;
}

export function setSessionId(sessionId: string): void {
  _currentSessionId = sessionId;
}

function generateTraceId(): string {
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getLogContext(): LogContext {
  return {
    role: _currentRole,
    cwd: process.cwd(),
    home: homedir(),
    pid: process.pid,
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
    sessionId: _currentSessionId,
  };
}

// ============================================================================
// Path & File Management
// ============================================================================

function getLogDir(): string {
  const rolesDir = config.storage.rolesDir.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
  return join(rolesDir, ".log");
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function ensureLogDir(): void {
  const dir = getLogDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Clean up old log files based on retentionDays config.
 * - retentionDays = 0: keep all, no cleanup
 * - retentionDays > 0: remove files older than N days
 */
function cleanupOldLogs(): void {
  const retentionDays = config.logging.retentionDays;
  if (retentionDays <= 0) return; // 0 = keep forever

  const dir = getLogDir();
  if (!existsSync(dir)) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffMs = cutoffDate.getTime();

  const logFilePattern = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (!logFilePattern.test(entry)) continue;

      const filePath = join(dir, entry);
      try {
        const stats = statSync(filePath);
        if (stats.mtimeMs < cutoffMs) {
          unlinkSync(filePath);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

function logFilePath(): string {
  return join(getLogDir(), `${today()}.jsonl`);
}

// ============================================================================
// JSONL Writing
// ============================================================================

/**
 * Write a log entry as JSONL.
 * All fields are preserved without truncation.
 */
function writeLogEntry(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  try {
    ensureLogDir();
    // Periodic cleanup check (throttled to once per hour)
    const now = Date.now();
    if (now - lastCleanupCheck > CLEANUP_INTERVAL_MS) {
      lastCleanupCheck = now;
      cleanupOldLogs();
    }
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(logFilePath(), line, "utf-8");
  } catch {
    // Logging should never break the extension
  }
}

function createBaseEntry(
  level: LogLevel,
  tag: string,
  message: string,
  meta?: Record<string, unknown>,
  model?: ModelContext,
  scope?: string,
  timing?: LogEntry["timing"]
): LogEntry {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    timestamp: new Date(now).toISOString(),
    epoch_ms: now,
    level,
    tag,
    message,
    context: getLogContext(),
    model,
    meta: meta || {},
    timing,
    scope,
    traceId: _currentTraceId || generateTraceId(),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Log a message with full context preservation.
 * @param level Log level
 * @param tag Operation category
 * @param message Human-readable description
 * @param meta Structured data (fully preserved, never truncated)
 * @param model Optional model context
 */
export function logJsonl(
  level: LogLevel,
  tag: string,
  message: string,
  meta?: Record<string, unknown>,
  model?: ModelContext
): void {
  const entry = createBaseEntry(level, tag, message, meta, model);
  writeLogEntry(entry);
}

/**
 * Convenience: info level log
 */
export function log(tag: string, message: string, meta?: Record<string, unknown>, model?: ModelContext): void {
  logJsonl("info", tag, message, meta, model);
}

/**
 * Convenience: debug level log
 */
export function logDebug(tag: string, message: string, meta?: Record<string, unknown>, model?: ModelContext): void {
  logJsonl("debug", tag, message, meta, model);
}

/**
 * Convenience: warning level log
 */
export function logWarn(tag: string, message: string, meta?: Record<string, unknown>, model?: ModelContext): void {
  logJsonl("warn", tag, message, meta, model);
}

/**
 * Convenience: error level log
 */
export function logError(tag: string, message: string, meta?: Record<string, unknown>, model?: ModelContext): void {
  logJsonl("error", tag, message, meta, model);
}

/**
 * Start a timed operation with full tracing support.
 * @param tag Operation category
 * @param message Description
 * @param meta Initial metadata
 * @param model Model context (if LLM operation)
 * @param parentScope Optional parent scope for nested operations
 * @returns scope ID for logEnd
 */
export function logStart(
  tag: string,
  message: string,
  meta?: Record<string, unknown>,
  model?: ModelContext,
  parentScope?: string
): string {
  const scope = `${tag}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  const startIso = new Date().toISOString();
  scopeMap.set(scope, { startMs: Date.now(), startIso, parentScope });

  const entry = createBaseEntry("info", tag, `▶ ${message}`, meta, model, scope, {
    start: startIso,
  });
  entry.parentScope = parentScope;

  // Initialize trace ID if not set
  if (!_currentTraceId) {
    _currentTraceId = entry.traceId;
  }

  writeLogEntry(entry);
  return scope;
}

/**
 * End a timed operation. Duration is automatically calculated.
 * @param scope Scope ID from logStart
 * @param message Completion message
 * @param meta Additional metadata (merged with duration_ms)
 * @param model Model context (if changed during operation)
 */
export function logEnd(
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
  model?: ModelContext
): void {
  const scopeInfo = scopeMap.get(scope);
  const endMs = Date.now();
  const endIso = new Date(endMs).toISOString();

  const tag = scope.split(":")[0];
  const durationMs = scopeInfo ? endMs - scopeInfo.startMs : undefined;

  const timing: LogEntry["timing"] = {
    start: scopeInfo?.startIso,
    end: endIso,
    duration_ms: durationMs,
  };

  const finalMeta: Record<string, unknown> = {
    ...(meta || {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  };

  const entry = createBaseEntry("info", tag, `◀ ${message}`, finalMeta, model, scope, timing);
  entry.parentScope = scopeInfo?.parentScope;

  writeLogEntry(entry);
  scopeMap.delete(scope);
}

/**
 * Log with a status indicator.
 */
export function logOk(tag: string, message: string, meta?: Record<string, unknown>, model?: ModelContext): void {
  logJsonl("info", tag, `✅ ${message}`, meta, model);
}

/**
 * Log a section/header marker.
 */
export function logSection(tag: string, title: string): void {
  logJsonl("info", tag, `═══ ${title} ═══`);
}

// ============================================================================
// Specialized Loggers for Common Operations
// ============================================================================

/**
 * Log model usage with complete context.
 */
export function logModelUsage(
  tag: string,
  provider: string,
  model: string,
  operation: string,
  meta?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    baseUrl?: string;
    error?: string;
    [key: string]: unknown;
  }
): void {
  logJsonl("info", tag, operation, meta, {
    provider,
    model,
    modelId: `${provider}/${model}`,
    baseUrl: meta?.baseUrl,
  });
}

/**
 * Log memory operation with full context.
 */
export function logMemory(
  operation: "add" | "update" | "delete" | "search" | "compact" | "repair",
  details: {
    type?: "learning" | "preference" | "event";
    memoryId?: string;
    category?: string;
    tokens?: number;
    count?: number;
    error?: string;
    [key: string]: unknown;
  }
): void {
  logJsonl("info", "memory", operation, details);
}

/**
 * Log checkpoint/auto-extraction operation.
 */
export function logCheckpoint(
  reason: string,
  details: {
    totalMessages?: number;
    newMessages?: number;
    pendingTurns?: number;
    sliceStart?: number;
    extractedLearnings?: number;
    extractedPreferences?: number;
    [key: string]: unknown;
  }
): void {
  logJsonl("info", "checkpoint", `flush reason=${reason}`, details);
}

// ============================================================================
// Exports
// ============================================================================

/** Whether logging is enabled */
export const isLogEnabled = ENABLED;
