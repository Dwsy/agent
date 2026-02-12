/**
 * RPC Process Pool — manages a pool of `pi --mode rpc` subprocesses.
 *
 * Design:
 * - Pool maintains [min, max] pi processes
 * - Each process is bound to a session key while active
 * - Idle processes are reused or reclaimed after timeout
 * - Health checks detect crashed processes and respawn
 *
 * Aligned with OpenClaw's "Pi agent runtime in RPC mode" pattern.
 */

import { RpcClient, type RpcClientOptions } from "./rpc-client.ts";
import type { Config } from "./config.ts";
import { createLogger, type Logger, type SessionKey } from "./types.ts";
import { getSessionDir } from "./session-store.ts";
import { getCwdForRole } from "./session-router.ts";
import { buildCapabilityProfile, type CapabilityProfile } from "./capability-profile.ts";
import type { MetricsCollector } from "./metrics.ts";
import type { ExecGuard } from "./exec-guard.ts";
import { PoolWaitingList } from "./pool-waiting-list.ts";

/** Check if `superset` contains all elements of `subset`. */
function isSuperset(superset: string[], subset: string[]): boolean {
  if (subset.length === 0) return true;
  const set = new Set(superset);
  return subset.every(s => set.has(s));
}

// ============================================================================
// Types
// ============================================================================

export interface RpcPoolStats {
  total: number;
  active: number;
  idle: number;
  maxCapacity: number;
}

// ============================================================================
// Pool
// ============================================================================

export class RpcPool {
  private clients = new Map<string, RpcClient>();
  private sessionBindings = new Map<SessionKey, string>();  // sessionKey -> clientId
  private waitingList = new PoolWaitingList();
  private nextId = 0;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private log: Logger;

  constructor(
    private config: Config,
    private metrics?: MetricsCollector,
    private execGuard?: ExecGuard,
    private onSessionEnd?: (sessionKey: SessionKey) => void,
  ) {
    this.log = createLogger("rpc-pool");
  }

  setConfig(config: Config): void {
    this.config = config;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the pool: spawn min processes and start maintenance loop.
   */
  async start(): Promise<void> {
    this.log.info(`Starting pool (min=${this.poolConfig.min}, max=${this.poolConfig.max})`);

    // Spawn min processes
    const prewarmProfile = this.buildDefaultProfile();
    const startPromises: Promise<unknown>[] = [];
    for (let i = 0; i < this.poolConfig.min; i++) {
      startPromises.push(this.spawnClient(prewarmProfile));
    }
    await Promise.allSettled(startPromises);

    // Maintenance loop: health checks + idle reclamation
    this.maintenanceTimer = setInterval(() => this.maintenance(), 30_000);

    this.log.info(`Pool started with ${this.clients.size} processes`);
  }

  /**
   * Stop all processes and clear the pool.
   */
  async stop(): Promise<void> {
    this.log.info("Stopping pool...");

    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }

    // Cancel all waiting entries before stopping processes
    this.waitingList.cancelAll("Pool shutting down");

    const stops = Array.from(this.clients.values()).map((c) => c.stop());
    await Promise.allSettled(stops);

    this.clients.clear();
    this.sessionBindings.clear();
    this.log.info("Pool stopped");
  }

  // ==========================================================================
  // Session Binding
  // ==========================================================================

  /**
   * Acquire an RPC client for a session.
   * Returns an existing bound client, or assigns an idle one, or spawns a new one.
   */
  async acquire(sessionKey: SessionKey, profile: CapabilityProfile, priority?: number): Promise<RpcClient> {
    const targetCwd = profile.cwd;

    // Already bound?
    const existingId = this.sessionBindings.get(sessionKey);
    if (existingId) {
      const existing = this.clients.get(existingId);
      if (existing?.isAlive) {
        if (!this.matchesProfile(existing, profile)) {
          // Session role/CWD changed: recycle old process to avoid running in wrong workspace.
          this.log.warn(
            `Bound process ${existing.id} profile mismatch for ${sessionKey} (have cwd=${existing.cwd ?? "<none>"}, sig=${existing.signature?.slice(0, 12) ?? "<none>"}; need cwd=${targetCwd}, sig=${profile.signature.slice(0, 12)}), respawning`,
          );
          await existing.stop().catch(() => {});
          this.clients.delete(existingId);
          this.sessionBindings.delete(sessionKey);
        } else {
          existing.lastActivity = Date.now();
          return existing;
        }
      } else {
        // Dead process — clean up
        this.sessionBindings.delete(sessionKey);
        this.clients.delete(existingId);
      }
    }

    // Find an idle process with matching profile (cwd + capability signature)
    // Find an idle process: prefer exact match, fall back to hard match with soft superset
    let hardCandidate: RpcClient | null = null;
    for (const client of this.clients.values()) {
      if (!client.isIdle || !client.isAlive) continue;
      if (this.matchesProfile(client, profile)) {
        // Exact match — best case
        client.sessionKey = sessionKey;
        client.lastActivity = Date.now();
        this.sessionBindings.set(sessionKey, client.id);
        this.log.debug(`Reusing idle process ${client.id} for ${sessionKey} (exact match)`);
        try {
          await client.newSession();
          await this.initializeRpcState(client);
        } catch (err) {
          this.log.warn(`Failed to reset session on reuse: ${err}`);
        }
        return client;
      }
      if (!hardCandidate && this.matchesHardProfile(client, profile)) {
        hardCandidate = client;
      }
    }

    // Hard match with soft superset — acceptable reuse
    if (hardCandidate) {
      hardCandidate.sessionKey = sessionKey;
      hardCandidate.lastActivity = Date.now();
      this.sessionBindings.set(sessionKey, hardCandidate.id);
      this.log.debug(`Reusing idle process ${hardCandidate.id} for ${sessionKey} (hard match, soft superset)`);
      try {
        await hardCandidate.newSession();
        await this.initializeRpcState(hardCandidate);
      } catch (err) {
        this.log.warn(`Failed to reset session on reuse: ${err}`);
      }
      return hardCandidate;
    }

    // At capacity?
    if (this.clients.size >= this.poolConfig.max) {
      // Evict the least recently used idle process
      const evicted = this.evictLeastRecentIdle();
      if (!evicted) {
        // Instead of throwing, enqueue to waiting list with backpressure
        this.log.info(`Pool at capacity (${this.poolConfig.max}), enqueuing ${sessionKey} to waiting list (priority=${priority ?? 5})`);
        const client = await this.waitingList.enqueue(sessionKey, priority ?? 5);
        // Waiting entry resolved — set up the client for this session
        client.clearEventListeners();
        client.sessionKey = sessionKey;
        client.lastActivity = Date.now();
        this.sessionBindings.set(sessionKey, client.id);
        try {
          await client.newSession();
          await this.initializeRpcState(client);
        } catch (err) {
          this.log.warn(`Failed to initialize waited client for ${sessionKey}: ${err}`);
        }
        return client;
      }
    }

    // Spawn a new process
    const client = await this.spawnClient(profile, sessionKey);
    client.sessionKey = sessionKey;
    this.sessionBindings.set(sessionKey, client.id);
    this.log.info(`Spawned new process ${client.id} for ${sessionKey}`);
    await this.initializeRpcState(client);
    return client;
  }

  /**
   * Release a session binding. The process returns to idle.
   */
  release(sessionKey: SessionKey): void {
    const clientId = this.sessionBindings.get(sessionKey);
    if (!clientId) return;

    const client = this.clients.get(clientId);
    if (client) {
      client.sessionKey = null;
      client.lastActivity = Date.now();

      // Drain waiting list: if someone is waiting for a process, hand it over
      if (client.isAlive && this.waitingList.size > 0) {
        const drained = this.waitingList.drain(client);
        if (drained) {
          this.log.debug(`Released ${sessionKey} → drained to waiting entry`);
          this.sessionBindings.delete(sessionKey);
          return;
        }
      }
    }
    this.sessionBindings.delete(sessionKey);
    this.log.debug(`Released ${sessionKey} from process ${clientId}`);
  }

  /**
   * Get the client bound to a session, if any.
   */
  getForSession(sessionKey: SessionKey): RpcClient | null {
    const id = this.sessionBindings.get(sessionKey);
    if (!id) return null;
    return this.clients.get(id) ?? null;
  }

  /**
   * Find a client by its child process PID.
   * Used by gateway-tools extension to resolve session from PID.
   */
  getByPid(pid: number): RpcClient | null {
    for (const client of this.clients.values()) {
      if (client.pid === pid) return client;
    }
    return null;
  }

  // ==========================================================================
  // Stats
  // ==========================================================================

  getStats(): RpcPoolStats & { waitingList: { waiting: number; totalEnqueued: number; totalDrained: number; totalExpired: number } } {
    let active = 0;
    let idle = 0;
    for (const client of this.clients.values()) {
      if (client.isAlive) {
        if (client.isIdle) idle++;
        else active++;
      }
    }
    return {
      total: this.clients.size,
      active,
      idle,
      maxCapacity: this.poolConfig.max,
      waitingList: this.waitingList.stats,
    };
  }

  getAllClients(): RpcClient[] {
    return Array.from(this.clients.values());
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private get poolConfig() {
    return this.config.agent.pool;
  }

  private buildDefaultProfile(): CapabilityProfile {
    const cwd = this.resolveDefaultCwd();
    return buildCapabilityProfile({
      config: this.config,
      role: "default",
      cwd,
    });
  }

  private resolveDefaultCwd(): string {
    try {
      return getCwdForRole("default", this.config);
    } catch {
      return process.cwd();
    }
  }

  /**
   * Exact match: hard signature + full signature must both match.
   * Used for session-bound process validation.
   */
  private matchesProfile(client: RpcClient, profile: CapabilityProfile): boolean {
    return (client.cwd ?? "") === profile.cwd && (client.signature ?? "") === profile.signature;
  }

  /**
   * Hard-only match: role+cwd+tools+env match, soft resources are superset.
   * Used for flexible pool reuse when exact match unavailable.
   */
  private matchesHardProfile(client: RpcClient, profile: CapabilityProfile): boolean {
    if ((client.cwd ?? "") !== profile.cwd) return false;
    if ((client.hardSignature ?? "") !== profile.hardSignature) return false;
    // Soft: client must have superset of requested resources
    const clientSoft = client.softResources;
    if (!clientSoft) return false;
    const needed = profile.softResources;
    return isSuperset(clientSoft.skills, needed.skills)
      && isSuperset(clientSoft.extensions, needed.extensions)
      && isSuperset(clientSoft.promptTemplates, needed.promptTemplates);
  }

  /**
   * Find the best idle process for a profile.
   * Priority: exact match > hard match with soft superset > null (spawn new).
   * Used by delegate_to_agent routing.
   */
  findBestMatch(profile: CapabilityProfile): RpcClient | null {
    let hardMatch: RpcClient | null = null;
    for (const client of this.clients.values()) {
      if (!client.isIdle || !client.isAlive) continue;
      if (this.matchesProfile(client, profile)) return client; // exact — best
      if (!hardMatch && this.matchesHardProfile(client, profile)) hardMatch = client;
    }
    return hardMatch;
  }

  /**
   * Initialize RPC process state after binding to a session.
   * Ensures auto-compaction and auto-retry are enabled (aligned with OpenClaw defaults).
   */
  private async initializeRpcState(client: RpcClient): Promise<void> {
    try {
      await client.setAutoCompaction(true);
      await client.setAutoRetry(true);
      // Align with OpenClaw runtime defaults for incremental steering/follow-up handling.
      await client.setSteeringMode("one-at-a-time");
      await client.setFollowUpMode("one-at-a-time");
    } catch (err) {
      this.log.warn(`Failed to initialize RPC state for ${client.id}: ${err}`);
    }
  }

  private async spawnClient(profile: CapabilityProfile, sessionKey?: SessionKey): Promise<RpcClient> {
    const id = `rpc-${++this.nextId}`;
    const piPath = this.config.agent.piCliPath ?? "pi";
    const extraArgs: string[] = [...profile.args];

    // Exec guard check before spawn
    if (this.execGuard) {
      const check = this.execGuard.check(piPath, extraArgs, { caller: "rpc-pool.spawnClient" });
      if (!check.allowed) {
        throw new Error(`ExecGuard blocked spawn: ${check.reason}`);
      }
    }

    // Session persistence: always set --session-dir so pi writes JSONL transcripts.
    // If we have a session key, use a session-specific dir. Otherwise use a pool temp dir.
    if (sessionKey) {
      const sessionDir = getSessionDir(this.config.session.dataDir, sessionKey);
      extraArgs.push("--session-dir", sessionDir);
    } else {
      // Pre-warmed pool process: use temp dir, will be re-bound later
      const poolDir = getSessionDir(this.config.session.dataDir, `_pool_${id}`);
      extraArgs.push("--session-dir", poolDir);
    }

    const clientOpts: RpcClientOptions = {
      piCliPath: this.config.agent.piCliPath,
      cwd: profile.cwd,
      signature: profile.signature,
      hardSignature: profile.hardSignature,
      softResources: profile.softResources,
      env: profile.env,
      args: extraArgs.length > 0 ? extraArgs : undefined,
    };

    const client = new RpcClient(id, clientOpts);
    this.clients.set(id, client);

    try {
      await client.start();
      this.metrics?.incProcessSpawn();
    } catch (err) {
      this.clients.delete(id);

      // Model fallback: if spawn failed due to invalid model/provider config
      const errMsg = String(err).toLowerCase();
      const isModelError =
        (errMsg.includes("model") && errMsg.includes("not found")) ||
        (errMsg.includes("provider") && errMsg.includes("not found")) ||
        errMsg.includes("unknown model") ||
        errMsg.includes("unknown provider") ||
        errMsg.includes("invalid model") ||
        errMsg.includes("invalid provider");
      const hasModelArgs = extraArgs.some(a => a === "--provider" || a === "--model");

      if (isModelError && hasModelArgs) {
        this.log.warn(`Model error detected, retrying without --provider/--model: ${String(err).slice(0, 200)}`);
        return this.spawnClientWithoutModel(profile, sessionKey);
      }

      throw err;
    }

    return client;
  }

  /**
   * Retry spawn without --provider/--model args (model fallback).
   */
  private async spawnClientWithoutModel(profile: CapabilityProfile, sessionKey?: SessionKey): Promise<RpcClient> {
    const id = `rpc-${++this.nextId}`;
    const piPath = this.config.agent.piCliPath ?? "pi";

    // Strip --provider and --model (and their values) from args
    const extraArgs = stripModelArgs(profile.args);

    // ExecGuard check (same as spawnClient)
    if (this.execGuard) {
      const check = this.execGuard.check(piPath, extraArgs, { caller: "rpc-pool.spawnClientWithoutModel" });
      if (!check.allowed) {
        throw new Error(`ExecGuard blocked fallback spawn: ${check.reason}`);
      }
    }

    if (sessionKey) {
      const sessionDir = getSessionDir(this.config.session.dataDir, sessionKey);
      extraArgs.push("--session-dir", sessionDir);
    } else {
      const poolDir = getSessionDir(this.config.session.dataDir, `_pool_${id}`);
      extraArgs.push("--session-dir", poolDir);
    }

    const clientOpts: RpcClientOptions = {
      piCliPath: this.config.agent.piCliPath,
      cwd: profile.cwd,
      signature: profile.signature,
      hardSignature: profile.hardSignature,
      softResources: profile.softResources,
      env: profile.env,
      args: extraArgs.length > 0 ? extraArgs : undefined,
    };

    const client = new RpcClient(id, clientOpts);
    this.clients.set(id, client);

    try {
      await client.start();
      this.log.warn(`Model fallback succeeded — running with default model for ${sessionKey ?? "pool"}`);
      this.metrics?.incProcessSpawn();
    } catch (retryErr) {
      this.clients.delete(id);
      throw retryErr;
    }

    return client;
  }

  private evictLeastRecentIdle(): boolean {
    let oldest: RpcClient | null = null;
    for (const client of this.clients.values()) {
      if (client.isIdle && client.isAlive) {
        if (!oldest || client.lastActivity < oldest.lastActivity) {
          oldest = client;
        }
      }
    }

    if (!oldest) return false;

    this.log.debug(`Evicting idle process ${oldest.id}`);
    const evictedSessionKey = oldest.sessionKey;
    this.clients.delete(oldest.id);
    if (evictedSessionKey) {
      this.sessionBindings.delete(evictedSessionKey);
      this.onSessionEnd?.(evictedSessionKey);
    }
    oldest.stop().catch(() => {});
    this.metrics?.incProcessKill();
    return true;
  }

  private async maintenance(): Promise<void> {
    const now = Date.now();
    const idleTimeout = this.poolConfig.idleTimeoutMs;

    for (const [id, client] of this.clients) {
      // Remove dead processes
      if (!client.isAlive) {
        this.log.warn(`Process ${id} died, removing from pool`);
        // Clean up any session binding
        if (client.sessionKey) {
          this.sessionBindings.delete(client.sessionKey);
          this.onSessionEnd?.(client.sessionKey);
        }
        this.clients.delete(id);
        this.metrics?.incProcessCrash();
        continue;
      }

      // Reclaim idle processes beyond min
      if (
        client.isIdle &&
        this.clients.size > this.poolConfig.min &&
        now - client.lastActivity > idleTimeout
      ) {
        this.log.debug(`Reclaiming idle process ${id} (idle ${Math.round((now - client.lastActivity) / 1000)}s)`);
        if (client.sessionKey) {
          this.sessionBindings.delete(client.sessionKey);
          this.onSessionEnd?.(client.sessionKey);
        }
        this.clients.delete(id);
        client.stop().catch(() => {});
        this.metrics?.incProcessKill();
      }
    }

    // Ensure min processes
    while (this.clients.size < this.poolConfig.min) {
      try {
        await this.spawnClient(this.buildDefaultProfile());
      } catch (err) {
        this.log.error("Failed to spawn replacement process:", err);
        break;
      }
    }
  }
}

/**
 * Strip --provider and --model flags (and their values) from args array.
 */
export function stripModelArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" || args[i] === "--model") {
      i++; // skip the value
      continue;
    }
    result.push(args[i]);
  }
  return result;
}
