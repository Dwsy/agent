/**
 * Session Transcript Logger — writes JSONL event logs per session.
 *
 * Each session gets its own .jsonl file in the session data directory.
 * Every event (prompt, agent event, response, error) is logged with timestamps.
 *
 * This is Gateway-level logging (independent of pi's internal session files).
 * Useful for debugging message interruptions, timeouts, and agent behavior.
 *
 * Features:
 * - Max file size: 5MB per file (configurable)
 * - Auto-rotation: session.jsonl → session.1.jsonl → session.2.jsonl
 * - Max rotations: 3 files per session (keeps latest)
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger, type Logger, type SessionKey } from "./types.ts";
import { encodeSessionDir } from "./session-store.ts";

export interface TranscriptEntry {
  /** ISO timestamp */
  ts: string;
  /** Event category */
  cat: "prompt" | "event" | "response" | "error" | "meta";
  /** Specific type within category */
  type: string;
  /** Session key */
  session: string;
  /** Payload (varies by type) */
  data?: Record<string, unknown>;
}

export interface TranscriptLoggerOptions {
  /** Max file size in MB before rotation. Default: 5 */
  maxFileSizeMB?: number;
  /** Max number of rotated files to keep. Default: 3 */
  maxRotations?: number;
}

const DEFAULT_MAX_FILE_SIZE_MB = 5;
const DEFAULT_MAX_ROTATIONS = 3;
const MB_TO_BYTES = 1024 * 1024;

export class TranscriptLogger {
  private log: Logger;
  private baseDir: string;
  private maxFileSizeBytes: number;
  private maxRotations: number;

  constructor(baseDir: string, options: TranscriptLoggerOptions = {}) {
    this.baseDir = baseDir;
    this.maxFileSizeBytes = (options.maxFileSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB) * MB_TO_BYTES;
    this.maxRotations = options.maxRotations ?? DEFAULT_MAX_ROTATIONS;
    this.log = createLogger("transcript");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
  }

  /** Log a prompt being sent to the agent */
  logPrompt(sessionKey: SessionKey, text: string, imageCount: number): void {
    this.append(sessionKey, {
      ts: new Date().toISOString(),
      cat: "prompt",
      type: "user_message",
      session: sessionKey,
      data: {
        text: text.length > 2000 ? text.slice(0, 2000) + "...[truncated]" : text,
        textLength: text.length,
        imageCount,
      },
    });
  }

  /** Log an agent event (text_delta, tool_execution, etc.) */
  logEvent(sessionKey: SessionKey, event: Record<string, unknown>): void {
    const type = (event.type as string) ?? "unknown";

    const data: Record<string, unknown> = { type };

    if (type === "message_update") {
      const ame = (event as any).assistantMessageEvent;
      if (ame?.type === "text_delta") {
        data.subtype = "text_delta";
        data.delta = ame.delta;
        data.deltaLen = ame.delta?.length ?? 0;
      } else if (ame) {
        data.subtype = ame.type;
      }
    } else if (type === "tool_execution_start") {
      data.toolName = (event as any).toolName;
      data.label = (event as any).args?.label;
    } else if (type === "tool_execution_end") {
      data.toolName = (event as any).toolName;
    } else if (type === "agent_end") {
      data.stopReason = (event as any).stopReason;
      data.messageCount = ((event as any).messages as any[])?.length;
    } else if (type === "message_end") {
      const msg = (event as any).message;
      data.role = msg?.role;
      data.stopReason = msg?.stopReason;
    } else if (type === "extension_ui_request") {
      data.method = (event as any).method;
      data.title = (event as any).title;
    }

    this.append(sessionKey, {
      ts: new Date().toISOString(),
      cat: "event",
      type,
      session: sessionKey,
      data,
    });
  }

  /** Log the final response sent to the user */
  logResponse(sessionKey: SessionKey, text: string, durationMs: number): void {
    this.append(sessionKey, {
      ts: new Date().toISOString(),
      cat: "response",
      type: "assistant_reply",
      session: sessionKey,
      data: {
        text: text.length > 2000 ? text.slice(0, 2000) + "...[truncated]" : text,
        textLength: text.length,
        durationMs,
      },
    });
  }

  /** Log an error */
  logError(sessionKey: SessionKey, error: string, context?: Record<string, unknown>): void {
    this.append(sessionKey, {
      ts: new Date().toISOString(),
      cat: "error",
      type: "error",
      session: sessionKey,
      data: { error, ...context },
    });
  }

  /** Log metadata (session start, session reset, etc.) */
  logMeta(sessionKey: SessionKey, type: string, data?: Record<string, unknown>): void {
    this.append(sessionKey, {
      ts: new Date().toISOString(),
      cat: "meta",
      type,
      session: sessionKey,
      data,
    });
  }

  /** Read the transcript for a session (last N lines) */
  readTranscript(sessionKey: SessionKey, lastN = 100): TranscriptEntry[] {
    const filePath = this.getFilePath(sessionKey);
    if (!existsSync(filePath)) return [];

    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const entries = lines.slice(-lastN).map((line) => {
        try {
          return JSON.parse(line) as TranscriptEntry;
        } catch {
          return null;
        }
      });
      return entries.filter(Boolean) as TranscriptEntry[];
    } catch {
      return [];
    }
  }

  /** List all sessions that have transcripts */
  listSessions(): string[] {
    try {
      return readdirSync(this.baseDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => basename(f, ".jsonl").replace(/__/g, ":"));
    } catch {
      return [];
    }
  }

  private getFilePath(sessionKey: SessionKey): string {
    const safeName = encodeSessionDir(sessionKey);
    return join(this.baseDir, `${safeName}.jsonl`);
  }

  private append(sessionKey: SessionKey, entry: TranscriptEntry): void {
    try {
      const filePath = this.getFilePath(sessionKey);
      
      // Check and rotate if needed before appending
      this.rotateIfNeeded(filePath);
      
      appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      this.log.error(`Failed to write transcript for ${sessionKey}:`, err);
    }
  }

  /**
   * Rotate transcript file if it exceeds max size.
   * Keeps up to maxRotations files: session.jsonl, session.1.jsonl, session.2.jsonl, ...
   */
  private rotateIfNeeded(filePath: string): void {
    if (!existsSync(filePath)) return;

    try {
      const stats = statSync(filePath);
      if (stats.size < this.maxFileSizeBytes) return;

      const basePath = filePath.replace(/\.jsonl$/, "");

      // Delete oldest rotation if at limit
      const oldestPath = `${basePath}.${this.maxRotations}.jsonl`;
      if (existsSync(oldestPath)) {
        unlinkSync(oldestPath);
      }

      // Shift existing rotations up
      for (let i = this.maxRotations - 1; i >= 1; i--) {
        const oldPath = `${basePath}.${i}.jsonl`;
        const newPath = `${basePath}.${i + 1}.jsonl`;
        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      // Rename current file to .1.jsonl
      renameSync(filePath, `${basePath}.1.jsonl`);
    } catch {
      // Silent fail — don't break logging on rotation error
    }
  }
}
