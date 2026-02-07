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
import { homedir } from "node:os";

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
  private nextId = 0;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private log: Logger;

  constructor(private config: Config) {
    this.log = createLogger("rpc-pool");
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
    const prewarmCwd = this.resolveTargetCwd();
    const startPromises: Promise<unknown>[] = [];
    for (let i = 0; i < this.poolConfig.min; i++) {
      startPromises.push(this.spawnClient(prewarmCwd));
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
  async acquire(sessionKey: SessionKey, cwd?: string): Promise<RpcClient> {
    const targetCwd = this.resolveTargetCwd(cwd);

    // Already bound?
    const existingId = this.sessionBindings.get(sessionKey);
    if (existingId) {
      const existing = this.clients.get(existingId);
      if (existing?.isAlive) {
        if (!this.cwdMatches(existing, targetCwd)) {
          // Session role/CWD changed: recycle old process to avoid running in wrong workspace.
          this.log.warn(
            `Bound process ${existing.id} cwd mismatch for ${sessionKey} (have: ${existing.cwd ?? "<none>"}, need: ${targetCwd}), respawning`,
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

    // Find an idle process with matching CWD
    for (const client of this.clients.values()) {
      if (client.isIdle && client.isAlive && this.cwdMatches(client, targetCwd)) {
        client.sessionKey = sessionKey;
        client.lastActivity = Date.now();
        this.sessionBindings.set(sessionKey, client.id);
        this.log.debug(`Reusing idle process ${client.id} for ${sessionKey}`);

        // New session for the reused process
        try {
          await client.newSession();
          await this.initializeRpcState(client);
        } catch (err) {
          this.log.warn(`Failed to reset session on reuse: ${err}`);
        }

        return client;
      }
    }

    // At capacity?
    if (this.clients.size >= this.poolConfig.max) {
      // Evict the least recently used idle process
      const evicted = this.evictLeastRecentIdle();
      if (!evicted) {
        throw new Error(`RPC pool at capacity (${this.poolConfig.max}). No idle processes to evict.`);
      }
    }

    // Spawn a new process
    const client = await this.spawnClient(targetCwd, sessionKey);
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

  // ==========================================================================
  // Stats
  // ==========================================================================

  getStats(): RpcPoolStats {
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

  private resolveTargetCwd(cwd?: string): string {
    if (cwd) return cwd;
    try {
      return getCwdForRole("default", this.config);
    } catch {
      return process.cwd();
    }
  }

  private cwdMatches(client: RpcClient, cwd: string): boolean {
    return (client.cwd ?? "") === cwd;
  }

  /**
   * Initialize RPC process state after binding to a session.
   * Ensures auto-compaction and auto-retry are enabled (aligned with OpenClaw defaults).
   */
  private async initializeRpcState(client: RpcClient): Promise<void> {
    try {
      await client.setAutoCompaction(true);
      await client.setAutoRetry(true);
    } catch (err) {
      this.log.warn(`Failed to initialize RPC state for ${client.id}: ${err}`);
    }
  }

  private async spawnClient(cwd?: string, sessionKey?: SessionKey): Promise<RpcClient> {
    const id = `rpc-${++this.nextId}`;

    // Parse model config: "provider/modelId" format
    const extraArgs: string[] = [];
    const modelStr = this.config.agent.model;
    if (modelStr && modelStr.includes("/")) {
      const slashIdx = modelStr.indexOf("/");
      extraArgs.push("--provider", modelStr.slice(0, slashIdx));
      extraArgs.push("--model", modelStr.slice(slashIdx + 1));
    }
    if (this.config.agent.thinkingLevel && this.config.agent.thinkingLevel !== "off") {
      extraArgs.push("--thinking", this.config.agent.thinkingLevel);
    }
    if (this.config.agent.systemPrompt?.trim()) {
      extraArgs.push("--system-prompt", expandHome(this.config.agent.systemPrompt.trim()));
    }
    if (this.config.agent.appendSystemPrompt?.trim()) {
      extraArgs.push("--append-system-prompt", expandHome(this.config.agent.appendSystemPrompt.trim()));
    }
    if (this.config.agent.noExtensions) {
      extraArgs.push("--no-extensions");
    }
    if (this.config.agent.noSkills) {
      extraArgs.push("--no-skills");
    }
    if (this.config.agent.noPromptTemplates) {
      extraArgs.push("--no-prompt-templates");
    }
    for (const ext of this.config.agent.extensions ?? []) {
      if (!ext?.trim()) continue;
      extraArgs.push("--extension", expandHome(ext.trim()));
    }
    for (const skill of this.config.agent.skills ?? []) {
      if (!skill?.trim()) continue;
      extraArgs.push("--skill", expandHome(skill.trim()));
    }
    for (const template of this.config.agent.promptTemplates ?? []) {
      if (!template?.trim()) continue;
      extraArgs.push("--prompt-template", expandHome(template.trim()));
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
      cwd,
      args: extraArgs.length > 0 ? extraArgs : undefined,
    };

    const client = new RpcClient(id, clientOpts);
    this.clients.set(id, client);

    try {
      await client.start();
    } catch (err) {
      this.clients.delete(id);
      throw err;
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
    this.clients.delete(oldest.id);
    oldest.stop().catch(() => {});
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
        }
        this.clients.delete(id);
        continue;
      }

      // Reclaim idle processes beyond min
      if (
        client.isIdle &&
        this.clients.size > this.poolConfig.min &&
        now - client.lastActivity > idleTimeout
      ) {
        this.log.debug(`Reclaiming idle process ${id} (idle ${Math.round((now - client.lastActivity) / 1000)}s)`);
        this.clients.delete(id);
        client.stop().catch(() => {});
      }
    }

    // Ensure min processes
    while (this.clients.size < this.poolConfig.min) {
      try {
        await this.spawnClient(this.resolveTargetCwd());
      } catch (err) {
        this.log.error("Failed to spawn replacement process:", err);
        break;
      }
    }
  }
}

function expandHome(input: string): string {
  return input.replace(/^~(?=\/|$)/, homedir());
}
