/**
 * Message deduplication cache — prevents duplicate processing from
 * webhook retries, network jitter, or rapid re-sends.
 *
 * Fingerprint: `${senderId}:${channel}:${hash(text)}` with LRU eviction.
 */

import type { InboundMessage } from "./types.ts";

export interface DedupConfig {
  enabled: boolean;
  /** Max entries in LRU cache */
  cacheSize: number;
  /** TTL in ms — duplicates within this window are rejected */
  ttlMs: number;
}

const DEFAULT_CONFIG: DedupConfig = {
  enabled: true,
  cacheSize: 1000,
  ttlMs: 60_000,
};

export class DeduplicationCache {
  private cache = new Map<string, number>(); // fingerprint → timestamp
  private config: DedupConfig;

  constructor(config?: Partial<DedupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a message is a duplicate. If not, records it.
   * Returns true if the message should be skipped (duplicate).
   */
  isDuplicate(msg: InboundMessage): boolean {
    if (!this.config.enabled) return false;

    const fp = this.fingerprint(msg);
    const now = Date.now();
    const existing = this.cache.get(fp);

    if (existing !== undefined && now - existing < this.config.ttlMs) {
      return true;
    }

    // Record and maintain LRU size
    this.cache.set(fp, now);
    if (this.cache.size > this.config.cacheSize) {
      this.evictOldest();
    }

    return false;
  }

  get size(): number {
    return this.cache.size;
  }

  private fingerprint(msg: InboundMessage): string {
    const hash = Bun.hash(msg.text.slice(0, 256)).toString(36);
    return `${msg.source.senderId}:${msg.source.channel}:${hash}`;
  }

  private evictOldest(): void {
    const now = Date.now();
    // First pass: remove expired entries
    for (const [key, ts] of this.cache) {
      if (now - ts > this.config.ttlMs) {
        this.cache.delete(key);
      }
    }
    // If still over capacity, remove oldest entries
    while (this.cache.size > this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
      else break;
    }
  }
}
