/**
 * Pool Waiting List — backpressure layer for RPC pool capacity.
 *
 * When pool.acquire() would throw "at capacity", callers enqueue here instead.
 * Entries are sorted by priority (desc) and drained when a process becomes idle.
 * TTL prevents indefinite waiting — expired entries get a friendly error.
 */

import type { RpcClient } from "./rpc-client.ts";
import { createLogger, type Logger, type SessionKey } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export interface WaitingEntry {
  sessionKey: SessionKey;
  resolve: (client: RpcClient) => void;
  reject: (error: Error) => void;
  priority: number;
  enqueuedAt: number;
  ttlMs: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface PoolWaitingListConfig {
  /** Default TTL for waiting entries in ms. Default: 30000 */
  defaultTtlMs: number;
  /** Max entries in the waiting list. Default: 50 */
  maxSize: number;
}

const DEFAULT_CONFIG: PoolWaitingListConfig = {
  defaultTtlMs: 30_000,
  maxSize: 50,
};

// ============================================================================
// Pool Waiting List
// ============================================================================

export class PoolWaitingList {
  private waiting: WaitingEntry[] = []; // sorted by priority desc
  private log: Logger;
  private config: PoolWaitingListConfig;

  /** Metrics counters */
  private _totalEnqueued = 0;
  private _totalDrained = 0;
  private _totalExpired = 0;

  constructor(config?: Partial<PoolWaitingListConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = createLogger("pool-wait");
  }

  get size(): number {
    return this.waiting.length;
  }

  get stats() {
    return {
      waiting: this.waiting.length,
      totalEnqueued: this._totalEnqueued,
      totalDrained: this._totalDrained,
      totalExpired: this._totalExpired,
    };
  }

  /**
   * Enqueue a waiting entry. Returns a promise that resolves with an RpcClient
   * when one becomes available, or rejects on TTL expiry.
   */
  enqueue(sessionKey: SessionKey, priority: number, ttlMs?: number): Promise<RpcClient> {
    if (this.waiting.length >= this.config.maxSize) {
      // Check if we can evict a lower priority entry
      const lowest = this.waiting.length > 0
        ? this.waiting[this.waiting.length - 1]
        : null;
      if (lowest && priority > lowest.priority) {
        this.evictEntry(lowest, "evicted by higher priority");
      } else {
        return Promise.reject(new Error("服务繁忙请稍后 (waiting list full)"));
      }
    }

    this._totalEnqueued++;
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;

    return new Promise<RpcClient>((resolve, reject) => {
      const entry: WaitingEntry = {
        sessionKey,
        resolve,
        reject,
        priority,
        enqueuedAt: Date.now(),
        ttlMs: effectiveTtl,
        timer: setTimeout(() => {
          this.expireEntry(entry);
        }, effectiveTtl),
      };

      // Insert sorted by priority desc, FIFO within same priority
      const idx = this.waiting.findIndex(e => e.priority < priority);
      this.waiting.splice(idx === -1 ? this.waiting.length : idx, 0, entry);

      this.log.debug(`Enqueued ${sessionKey} (priority=${priority}, ttl=${effectiveTtl}ms, waiting=${this.waiting.length})`);
    });
  }

  /**
   * Called when a pool process becomes idle. Drains the highest priority
   * waiting entry and resolves it with the client.
   * Returns true if an entry was drained, false if the list is empty.
   */
  drain(client: RpcClient): boolean {
    if (this.waiting.length === 0) return false;

    const entry = this.waiting.shift()!;
    clearTimeout(entry.timer);
    this._totalDrained++;

    this.log.debug(`Drained ${entry.sessionKey} (priority=${entry.priority}, waited=${Date.now() - entry.enqueuedAt}ms)`);
    entry.resolve(client);
    return true;
  }

  /**
   * Cancel all waiting entries (e.g. on gateway shutdown).
   */
  cancelAll(reason = "Gateway shutting down"): void {
    for (const entry of this.waiting) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.waiting = [];
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private expireEntry(entry: WaitingEntry): void {
    const idx = this.waiting.indexOf(entry);
    if (idx === -1) return; // Already drained

    this.waiting.splice(idx, 1);
    this._totalExpired++;

    this.log.debug(`Expired ${entry.sessionKey} (waited=${Date.now() - entry.enqueuedAt}ms)`);
    entry.reject(new Error("服务繁忙请稍后 (queue timeout)"));
  }

  private evictEntry(entry: WaitingEntry, reason: string): void {
    const idx = this.waiting.indexOf(entry);
    if (idx === -1) return;

    clearTimeout(entry.timer);
    this.waiting.splice(idx, 1);
    this._totalExpired++;

    this.log.debug(`Evicted ${entry.sessionKey}: ${reason}`);
    entry.reject(new Error(`服务繁忙请稍后 (${reason})`));
  }
}
