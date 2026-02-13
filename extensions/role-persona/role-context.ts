/**
 * Shared state and helpers for role-persona extension modules.
 * All mutable session state lives here so split modules can access it.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { log } from "./logger.ts";
import { config } from "./config.ts";

// ── Memory operation log (in-session only, not persisted) ──

export interface MemoryLogEntry {
  time: string;
  source: "compaction" | "auto-extract" | "tool" | "manual";
  op: "learning" | "preference" | "event" | "reinforce" | "consolidate";
  content: string;
  stored: boolean;
  detail?: string;
}

const SPINNER_INTERVAL = config.ui.spinnerIntervalMs;
const SPINNER_FRAMES = config.ui.spinnerFrames;

/**
 * Encapsulates all mutable session state for the role-persona extension.
 * Passed to sub-modules so they can read/write shared state.
 */
export class RoleContext {
  currentRole: string | null = null;
  currentRolePath: string | null = null;

  // Auto-memory state
  autoMemoryInFlight = false;
  autoMemoryBgScheduled = false;
  autoMemoryPendingTurns = 0;
  autoMemoryLastAt = 0;
  autoMemoryLastMessages: unknown[] | null = null;
  autoMemoryLastFlushLen = 0;
  isFirstUserMessage = true;

  // Spinner state
  private _spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private _spinnerFrame = 0;

  // Memory operation log
  readonly memoryLog: MemoryLogEntry[] = [];

  constructor(readonly pi: ExtensionAPI) {}

  // ── Helpers ──

  normalizePath(path: string): string {
    return path.replace(/\/$/, "");
  }

  notify(ctx: ExtensionContext, message: string, level?: string): void {
    if (ctx.hasUI) {
      ctx.ui.notify(message, (level as any) ?? "info");
    } else {
      this.pi.sendMessage({ customType: "role-notify", content: message, display: true }, { triggerTurn: false });
    }
  }

  memLogPush(entry: Omit<MemoryLogEntry, "time">): void {
    const now = new Date();
    this.memoryLog.push({
      ...entry,
      time: [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
      ].join(":"),
    });
  }

  // ── Spinner ──

  startMemoryCheckpointSpinner(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    this.stopMemoryCheckpointSpinner();
    this._spinnerFrame = 0;
    ctx.ui.setStatus("memory-checkpoint", SPINNER_FRAMES[this._spinnerFrame]);
    this._spinnerTimer = setInterval(() => {
      this._spinnerFrame = (this._spinnerFrame + 1) % SPINNER_FRAMES.length;
      ctx.ui.setStatus("memory-checkpoint", SPINNER_FRAMES[this._spinnerFrame]);
    }, SPINNER_INTERVAL);
  }

  stopMemoryCheckpointSpinner(): void {
    if (this._spinnerTimer) {
      clearInterval(this._spinnerTimer);
      this._spinnerTimer = null;
    }
  }

  setMemoryCheckpointResult(ctx: ExtensionContext, reason: string, learnings: number, prefs: number): void {
    if (!ctx.hasUI) return;
    const badge = reason === "keyword" ? "✳"
      : reason === "batch-5-turns" ? "✶"
      : reason === "interval-30m" ? "✦"
      : "✧";
    const reasonLabel = reason === "keyword" ? "关键词"
      : reason === "batch-5-turns" ? "5轮"
      : reason === "interval-30m" ? "30m"
      : reason === "session-shutdown" ? "退出"
      : reason === "compaction" ? "压缩"
      : "check";
    ctx.ui.setStatus("memory-checkpoint", `${badge} ${reasonLabel} ${learnings}L ${prefs}P`);
  }
}
