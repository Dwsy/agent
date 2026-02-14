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
import type { SessionStore } from "./session-store.ts";
import type { ChannelPlugin } from "../plugins/types.ts";
import { resolveDeliveryTarget } from "./channel-resolver.ts";

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

export interface HeartbeatDeliveryDeps {
  sessions: SessionStore;
  getChannels: () => Map<string, ChannelPlugin>;
  bindings?: Array<{ agentId?: string; match: { channel?: string; peer?: { id?: string }; guildId?: string } }>;
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

  if (didStrip && text.length === 0) {
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
  private running = new Set<string>();
  private wakeRequests = new Map<string, string>(); // agentId → reason
  private busyRetries = new Map<string, number>();

  constructor(
    private config: Config,
    private pool: RpcPool,
    private events: HeartbeatExecutorEvents = {},
    private systemEvents?: SystemEventsQueue,
    private onCronEventProcessed?: (jobId: string, status: "completed" | "error", resultPreview?: string) => void,
    private deliveryDeps?: HeartbeatDeliveryDeps,
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
   * @param reason — why the heartbeat was requested (e.g. "cron:jobId", "exec-event", "manual")
   */
  requestNow(agentId: string, reason?: string): void {
    this.wakeRequests.set(agentId, reason ?? "manual");
    setTimeout(() => this.checkWakeRequests(), 1000);
  }

  private async checkWakeRequests(): Promise<void> {
    const hbConfig = this.getHeartbeatConfig();
    if (!hbConfig?.enabled) return;

    const intervalMs = parseDuration(hbConfig.every) || 30 * 60 * 1000;
    const shouldRunScheduled = Date.now() - this.lastRun >= intervalMs * 0.9;

    const agentsToRun = new Map<string, string>(); // agentId → reason

    for (const [agentId, reason] of this.wakeRequests) {
      agentsToRun.set(agentId, reason);
    }
    this.wakeRequests.clear();

    if (shouldRunScheduled) {
      const defaultAgent = this.config.agents?.default ?? "default";
      if (!agentsToRun.has(defaultAgent)) {
        agentsToRun.set(defaultAgent, "interval");
      }
    }

    for (const [agentId, reason] of agentsToRun) {
      await this.runOnce(agentId, reason);
    }
  }

  /**
   * Execute a single heartbeat run.
   */
  async runOnce(agentId: string = "default", reason?: string): Promise<HeartbeatResult> {
    const hbConfig = this.getHeartbeatConfig(agentId);
    if (!hbConfig?.enabled) {
      return { status: "skipped", error: "disabled" };
    }

    if (this.running.has(agentId)) {
      this.log.debug(`Heartbeat already running for ${agentId}, skipping`);
      return { status: "skipped", error: "already_running" };
    }

    this.running.add(agentId);
    this.lastRun = Date.now();
    this.events.onHeartbeatStart?.(agentId);

    try {
      const result = await this.executeHeartbeat(agentId, hbConfig, reason);
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
   *
   * Key behaviors (aligned with OpenClaw heartbeat-runner.ts):
   * - reason="cron:*" or "exec-event" → use specialized prompt, skip HEARTBEAT.md empty check
   * - Reuse existing bound RPC process (no newSession) for session continuity
   * - Deliver alerts directly via channel plugin (no external callback dependency)
   */
  private async executeHeartbeat(agentId: string, hbConfig: HeartbeatConfig, reason?: string): Promise<HeartbeatResult> {
    if (hbConfig.activeHours && !isInActiveHours(hbConfig.activeHours)) {
      this.log.debug("Outside active hours, skipping");
      return { status: "skipped", error: "outside_active_hours" };
    }

    const sessionKey = resolveMainSessionKey(agentId);
    const isCronEvent = Boolean(reason?.startsWith("cron:"));
    const isExecEvent = reason === "exec-event";
    const isEventDriven = isCronEvent || isExecEvent;

    // skipWhenBusy — but retry if there are pending events
    if (hbConfig.skipWhenBusy) {
      const rpc = this.pool.getForSession(sessionKey);
      if (rpc && !rpc.isIdle) {
        if (isEventDriven && this.systemEvents?.hasPending(sessionKey)) {
          const retryCount = this.busyRetries.get(agentId) ?? 0;
          if (retryCount < 3) {
            this.busyRetries.set(agentId, retryCount + 1);
            this.log.debug(`Session ${sessionKey} busy with pending events, retry ${retryCount + 1}/3 in 5s`);
            setTimeout(() => this.runOnce(agentId, reason), 5000);
            return { status: "skipped", error: "session_busy_retry_scheduled" };
          }
          this.busyRetries.delete(agentId);
        }
        this.log.debug(`Session ${sessionKey} is busy, skipping heartbeat`);
        this.events.onHeartbeatSkip?.(agentId, "session-busy");
        return { status: "skipped", error: "session_busy" };
      }
      this.busyRetries.delete(agentId);
    }

    // Check HEARTBEAT.md — but DON'T skip for cron/exec events (OpenClaw pattern)
    const agentDef = this.config.agents?.list.find((a) => a.id === agentId);
    const workspace = agentDef?.workspace ?? process.cwd();
    const heartbeatPath = join(workspace, "HEARTBEAT.md");
    let heartbeatContent: string | null = null;
    if (existsSync(heartbeatPath)) {
      heartbeatContent = readFileSync(heartbeatPath, "utf-8");
      if (isHeartbeatContentEffectivelyEmpty(heartbeatContent) && !isEventDriven) {
        this.log.debug("HEARTBEAT.md effectively empty, skipping");
        this.events.onHeartbeatSkip?.(agentId, "empty-heartbeat-file");
        return { status: "skipped", error: "empty_heartbeat_md" };
      }
    }

    // Check system events
    const pendingEvents = this.systemEvents?.peek(sessionKey) ?? [];
    const hasPendingEvents = pendingEvents.length > 0;

    // Build prompt based on reason (OpenClaw: CRON_EVENT_PROMPT / EXEC_EVENT_PROMPT)
    let prompt: string;
    if (hasPendingEvents && isCronEvent) {
      const eventsBlock = pendingEvents.map((e) => `- ${e}`).join("\n");
      prompt = `${eventsBlock}\n\n${CRON_EVENT_PROMPT}`;
    } else if (hasPendingEvents && isExecEvent) {
      const eventsBlock = pendingEvents.map((e) => `- ${e}`).join("\n");
      prompt = `${eventsBlock}\n\n${EXEC_EVENT_PROMPT}`;
    } else if (hasPendingEvents) {
      const eventsBlock = pendingEvents.map((e) => `- ${e}`).join("\n");
      prompt = `${eventsBlock}\n\n${CRON_EVENT_PROMPT}`;
    } else {
      prompt = hbConfig.prompt;
    }

    // Acquire RPC — prefer existing bound process for session continuity
    const existingRpc = this.pool.getForSession(sessionKey);
    let rpc: import("./rpc-client.ts").RpcClient | null;
    let reusedExisting = false;

    if (existingRpc?.isIdle && existingRpc.isAlive) {
      rpc = existingRpc;
      reusedExisting = true;
      this.log.debug(`[heartbeat] Reusing bound RPC ${rpc.id} for ${sessionKey}`);
    } else {
      rpc = await this.acquireForHeartbeat(agentId, hbConfig);
      if (!rpc) {
        return { status: "skipped", error: "no_idle_process" };
      }
      rpc.sessionKey = sessionKey;
      await rpc.newSession();
    }

    try {
      const response = await rpc.promptAndCollect(prompt, hbConfig.messageTimeoutMs ?? 60000);

      // Consume system events after successful response
      if (hasPendingEvents) {
        this.systemEvents?.consume(sessionKey);
      }

      // Process response — for event-driven heartbeats, force delivery (don't suppress)
      const result = this.processResponse(response, hbConfig, isEventDriven);

      // Direct delivery for alerts (no external callback dependency)
      if (result.status === "alert" && result.response) {
        await this.deliverAlert(agentId, result.response);
      }

      return result;
    } finally {
      // Only release if we acquired a new process; keep existing bound process
      if (!reusedExisting) {
        this.pool.release(sessionKey);
      }
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
   * @param forceDeliver — for cron/exec events, deliver even if response looks like ack-only
   */
  private processResponse(response: string, hbConfig: HeartbeatConfig, forceDeliver = false): HeartbeatResult {
    const { shouldSkip, text, didStrip } = stripHeartbeatToken(response, hbConfig.ackMaxChars);
    if (shouldSkip && !forceDeliver) {
      return { status: "ok", response: text || undefined };
    }
    return { status: text ? "alert" : "ok", response: text || undefined };
  }

  /**
   * Deliver heartbeat alert directly via channel plugin.
   * Resolves delivery target from bindings or most recent active session.
   */
  private async deliverAlert(agentId: string, text: string): Promise<void> {
    if (!this.deliveryDeps) {
      this.log.debug(`[heartbeat] No delivery deps, skipping alert delivery for ${agentId}`);
      return;
    }

    const target = resolveDeliveryTarget(
      agentId,
      this.deliveryDeps.sessions,
      this.deliveryDeps.bindings,
    );
    if (!target) {
      this.log.warn(`[heartbeat] No delivery target for agent ${agentId} (no binding, no recent session)`);
      return;
    }

    const channel = this.deliveryDeps.getChannels().get(target.channel);
    if (!channel) {
      this.log.warn(`[heartbeat] Channel ${target.channel} not available for delivery`);
      return;
    }

    try {
      await channel.outbound.sendText(target.chatId, text, { parseMode: "Markdown" });
      this.log.info(`[heartbeat] Alert delivered to ${target.channel}:${target.chatId} (${text.length} chars)`);
    } catch (err: unknown) {
      this.log.error(`[heartbeat] Delivery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
