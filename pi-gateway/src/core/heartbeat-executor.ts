/**
 * Heartbeat Executor — v3.1 Periodic Agent Wake-up
 *
 * Regularly wakes up the default agent to check for pending tasks.
 * Uses findBestMatch pool strategy (reuse idle only, never spawn).
 *
 * Design aligned with docs/HEARTBEAT-CRON-DESIGN.md and
 * docs/HEARTBEAT-CRON-IMPLEMENTATION-SPEC.md
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RpcPool } from "./rpc-pool.ts";
import type { Config, HeartbeatConfig } from "./config.ts";
import type { Logger, MessageSource, SessionKey } from "./types.ts";
import { buildCapabilityProfile } from "./capability-profile.ts";
import { resolveSessionKey, resolveMainSessionKey } from "./session-router.ts";
import { createLogger } from "./types.ts";
import type { SystemEventsQueue } from "./system-events.ts";

// ============================================================================
// Constants & Types
// ============================================================================

export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";

export const DEFAULT_HEARTBEAT_PROMPT =
  "Read HEARTBEAT.md if it exists. Follow it strictly — do not infer or repeat tasks from prior conversations. If nothing needs attention, reply HEARTBEAT_OK.";

export const CRON_EVENT_PROMPT =
  "Scheduled tasks have fired and their details are shown above. " +
  "Process each task and relay the results. " +
  "If you completed all tasks successfully, include HEARTBEAT_OK at the end.";

export const EXEC_EVENT_PROMPT =
  "An async command you ran earlier has completed. The result is shown above. " +
  "Relay the output to the user — share relevant output on success, explain what went wrong on failure.";

export interface HeartbeatResult {
  status: "ok" | "alert" | "skipped" | "error";
  response?: string;
  error?: string;
}

export interface HeartbeatExecutorEvents {
  onHeartbeatStart?: (agentId: string) => void;
  onHeartbeatComplete?: (agentId: string, result: HeartbeatResult) => void;
  onHeartbeatSkip?: (agentId: string, reason: string) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if HEARTBEAT.md content is effectively empty (no actionable items).
 * Returns false for null/undefined (missing file) — let agent decide.
 */
export function isHeartbeatContentEffectivelyEmpty(content: string | null | undefined): boolean {
  if (content == null) return false;
  if (typeof content !== "string") return false;

  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    // ATX heading: # Header
    if (/^#+(\s|$)/.test(t)) continue;
    // Empty list item: - [ ] or * or -
    if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(t)) continue;
    return false; // Found actionable content
  }
  return true;
}

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/^[*`~_]+/, "")
    .replace(/[*`~_]+$/, "");
}

/**
 * Strip HEARTBEAT_OK token from edges of response.
 * Returns shouldSkip=true if response should be suppressed.
 */
export function stripHeartbeatToken(
  raw: string | null | undefined,
  ackMaxChars = 300,
): { shouldSkip: boolean; text: string; didStrip: boolean } {
  if (!raw?.trim()) {
    return { shouldSkip: true, text: "", didStrip: false };
  }

  let text = stripMarkup(raw).trim();
  if (!text.includes(HEARTBEAT_TOKEN)) {
    return { shouldSkip: false, text: raw.trim(), didStrip: false };
  }

  let didStrip = false;
  let changed = true;
  while (changed) {
    changed = false;
    const next = text.trim();
    if (next.startsWith(HEARTBEAT_TOKEN)) {
      text = next.slice(HEARTBEAT_TOKEN.length).trimStart();
      didStrip = true;
      changed = true;
      continue;
    }
    if (next.endsWith(HEARTBEAT_TOKEN)) {
      text = next.slice(0, next.length - HEARTBEAT_TOKEN.length).trimEnd();
      didStrip = true;
      changed = true;
    }
  }

  text = text.replace(/\s+/g, " ").trim();

  if (didStrip && text.length <= ackMaxChars) {
    return { shouldSkip: true, text, didStrip: true };
  }
  return { shouldSkip: false, text: text || raw.trim(), didStrip };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function isInActiveHours(activeHours: { start: string; end: string; timezone: string }): boolean {
  const now = new Date();

  const [startHour, startMin] = activeHours.start.split(":").map(Number);
  const [endHour, endMin] = activeHours.end.split(":").map(Number);

  // Use Intl.DateTimeFormat to get time in specified timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: activeHours.timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  const minutePart = parts.find((p) => p.type === "minute");
  const currentHour = hourPart ? parseInt(hourPart.value, 10) : now.getHours();
  const currentMinute = minutePart ? parseInt(minutePart.value, 10) : now.getMinutes();

  const currentMinutes = currentHour * 60 + currentMinute;
  const startMinutes = (startHour ?? 0) * 60 + (startMin ?? 0);
  const endMinutes = (endHour ?? 23) * 60 + (endMin ?? 59);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ============================================================================
// Heartbeat Executor
// ============================================================================

export class HeartbeatExecutor {
  private log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRun = 0;
  private running = new Set<string>(); // Prevent concurrent heartbeats
  private wakeRequests = new Set<string>();

  constructor(
    private config: Config,
    private pool: RpcPool,
    private events: HeartbeatExecutorEvents = {},
    private systemEvents?: SystemEventsQueue,
  ) {
    this.log = createLogger("heartbeat");
  }

  /**
   * Start the heartbeat timer.
   */
  start(): void {
    const hbConfig = this.getHeartbeatConfig();
    if (!hbConfig?.enabled) {
      this.log.info("Heartbeat disabled");
      return;
    }

    const intervalMs = parseDuration(hbConfig.every);
    if (!intervalMs || intervalMs < 60000) {
      this.log.warn(`Invalid heartbeat interval: ${hbConfig.every}, using 30m`);
    }
    const effectiveInterval = Math.max(intervalMs || 30 * 60 * 1000, 60000);

    this.timer = setInterval(() => this.checkWakeRequests(), effectiveInterval);
    this.log.info(`Heartbeat started (every ${hbConfig.every})`);

    // Run initial heartbeat after short delay
    setTimeout(() => this.checkWakeRequests(), 5000);
  }

  /**
   * Stop the heartbeat timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log.info("Heartbeat stopped");
    }
  }

  /**
   * Request immediate heartbeat execution for an agent.
   */
  requestNow(agentId: string): void {
    this.wakeRequests.add(agentId);
    // Schedule one-shot check
    setTimeout(() => this.checkWakeRequests(), 1000);
  }

  private async checkWakeRequests(): Promise<void> {
    const hbConfig = this.getHeartbeatConfig();
    if (!hbConfig?.enabled) return;

    // Normal scheduled heartbeat
    const intervalMs = parseDuration(hbConfig.every) || 30 * 60 * 1000;
    const shouldRunScheduled = Date.now() - this.lastRun >= intervalMs * 0.9;

    const agentsToRun = new Set<string>();

    // Add wake requests
    for (const agentId of this.wakeRequests) {
      agentsToRun.add(agentId);
    }
    this.wakeRequests.clear();

    // Add scheduled run for default agent
    if (shouldRunScheduled) {
      const defaultAgent = this.config.agents?.default ?? "default";
      agentsToRun.add(defaultAgent);
    }

    for (const agentId of agentsToRun) {
      await this.runOnce(agentId);
    }
  }

  /**
   * Execute a single heartbeat run.
   */
  async runOnce(agentId: string = "default"): Promise<HeartbeatResult> {
    const hbConfig = this.getHeartbeatConfig(agentId);
    if (!hbConfig?.enabled) {
      return { status: "skipped", error: "disabled" };
    }

    // Prevent concurrent execution for same agent
    if (this.running.has(agentId)) {
      this.log.debug(`Heartbeat already running for ${agentId}, skipping`);
      return { status: "skipped", error: "already_running" };
    }

    this.running.add(agentId);
    this.lastRun = Date.now();
    this.events.onHeartbeatStart?.(agentId);

    try {
      const result = await this.executeHeartbeat(agentId, hbConfig);
      this.events.onHeartbeatComplete?.(agentId, result);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const result: HeartbeatResult = { status: "error", error: errMsg };
      this.events.onHeartbeatComplete?.(agentId, result);
      return result;
    } finally {
      this.running.delete(agentId);
    }
  }

  /**
   * Core heartbeat execution logic.
   */
  private async executeHeartbeat(agentId: string, hbConfig: HeartbeatConfig): Promise<HeartbeatResult> {
    // Check active hours
    if (hbConfig.activeHours && !isInActiveHours(hbConfig.activeHours)) {
      this.log.debug("Outside active hours, skipping");
      return { status: "skipped", error: "outside_active_hours" };
    }

    // Check if busy (skipWhenBusy)
    if (hbConfig.skipWhenBusy) {
      const sessionKey = resolveMainSessionKey(agentId);
      const rpc = this.pool.getForSession(sessionKey);
      if (rpc && !rpc.isIdle) {
        this.log.debug(`Session ${sessionKey} is busy, skipping heartbeat`);
        this.events.onHeartbeatSkip?.(agentId, "session-busy");
        return { status: "skipped", error: "session_busy" };
      }
    }

    // Get agent workspace
    const agentDef = this.config.agents?.list.find((a) => a.id === agentId);
    const workspace = agentDef?.workspace ?? process.cwd();

    // Check HEARTBEAT.md
    const heartbeatPath = join(workspace, "HEARTBEAT.md");
    let heartbeatContent: string | null = null;
    if (existsSync(heartbeatPath)) {
      heartbeatContent = readFileSync(heartbeatPath, "utf-8");
      if (isHeartbeatContentEffectivelyEmpty(heartbeatContent)) {
        this.log.debug("HEARTBEAT.md effectively empty, skipping");
        this.events.onHeartbeatSkip?.(agentId, "empty-heartbeat-file");
        return { status: "skipped", error: "empty_heartbeat_md" };
      }
    }

    // Check system events
    const sessionKey = resolveMainSessionKey(agentId);
    const pendingEvents = this.systemEvents?.peek(sessionKey) ?? [];
    const hasCronEvents = pendingEvents.length > 0;

    // Build prompt
    let prompt: string;
    if (hasCronEvents) {
      const eventsBlock = pendingEvents.map((e) => `- ${e}`).join("\n");
      prompt = `${eventsBlock}\n\n${CRON_EVENT_PROMPT}`;
    } else if (heartbeatContent) {
      prompt = hbConfig.prompt;
    } else {
      // No HEARTBEAT.md and no events — let agent decide what to do
      prompt = hbConfig.prompt;
    }

    // Acquire RPC with bounded retry
    const rpc = await this.acquireForHeartbeat(agentId, hbConfig);
    if (!rpc) {
      return { status: "skipped", error: "no_idle_process" };
    }

    try {
      // Bind session (direct property assignment)
      rpc.sessionKey = sessionKey;
      await rpc.newSession();

      // Send heartbeat prompt
      const response = await rpc.promptAndCollect(prompt, hbConfig.messageTimeoutMs ?? 60000);

      // Consume system events after successful response
      if (hasCronEvents) {
        this.systemEvents?.consume(sessionKey);
      }

      // Process response
      return this.processResponse(response, hbConfig);
    } finally {
      // Always release RPC process back to idle pool.
      // NOTE (BG-002): No session_end hook here — release() returns the process
      // to the pool, it does not terminate the session. If the process is later
      // evicted (idle timeout / pool shrink), rpc-pool.ts fires onSessionEnd.
      this.pool.release(sessionKey);
    }
  }

  /**
   * Acquire RPC for heartbeat with bounded retry.
   */
  private async acquireForHeartbeat(agentId: string, hbConfig: HeartbeatConfig): Promise<import("./rpc-client.ts").RpcClient | null> {
    const profile = buildCapabilityProfile({
      config: this.config,
      role: "default",
      cwd: ".",
    });

    // Attempt 1: immediate
    let rpc = this.pool.findBestMatch(profile);
    if (rpc) return rpc;

    // Attempt 2-3: short waits
    const maxRetries = hbConfig.maxRetries ?? 2;
    const retryDelayMs = hbConfig.retryDelayMs ?? 5000;

    for (let i = 0; i < maxRetries; i++) {
      this.log.debug(`[heartbeat] No idle RPC, retry ${i + 1}/${maxRetries} in ${retryDelayMs}ms`);
      await sleep(retryDelayMs);
      rpc = this.pool.findBestMatch(profile);
      if (rpc) return rpc;
    }

    // All retries exhausted
    this.log.info(`[heartbeat] No idle RPC after ${maxRetries + 1} attempts, skipping`);
    this.events.onHeartbeatSkip?.(agentId, "no-idle-rpc");
    return null;
  }

  /**
   * Process heartbeat response.
   */
  private processResponse(response: string, hbConfig: HeartbeatConfig): HeartbeatResult {
    const { shouldSkip, text, didStrip } = stripHeartbeatToken(response, hbConfig.ackMaxChars);
    if (shouldSkip) {
      return { status: "ok", response: text || undefined };
    }
    return { status: "alert", response: text };
  }

  /**
   * Get heartbeat config (global or per-agent).
   */
  private getHeartbeatConfig(agentId: string = "default"): HeartbeatConfig {
    // Check per-agent override first
    const agentDef = this.config.agents?.list.find((a) => a.id === agentId);
    const agentHb = agentDef && "heartbeat" in agentDef
      ? (agentDef as unknown as { heartbeat?: Partial<HeartbeatConfig> }).heartbeat
      : undefined;

    // Global default
    const globalHb = (this.config as unknown as { heartbeat?: HeartbeatConfig }).heartbeat;

    // Merge with defaults
    return {
      enabled: agentHb?.enabled ?? globalHb?.enabled ?? false,
      every: agentHb?.every ?? globalHb?.every ?? "30m",
      activeHours: agentHb?.activeHours ?? globalHb?.activeHours,
      prompt: agentHb?.prompt ?? globalHb?.prompt ?? DEFAULT_HEARTBEAT_PROMPT,
      ackMaxChars: agentHb?.ackMaxChars ?? globalHb?.ackMaxChars ?? 300,
      skipWhenBusy: agentHb?.skipWhenBusy ?? globalHb?.skipWhenBusy ?? true,
      maxRetries: agentHb?.maxRetries ?? globalHb?.maxRetries ?? 2,
      retryDelayMs: agentHb?.retryDelayMs ?? globalHb?.retryDelayMs ?? 5000,
      messageTimeoutMs: agentHb?.messageTimeoutMs ?? globalHb?.messageTimeoutMs ?? 60000,
    };
  }
}
