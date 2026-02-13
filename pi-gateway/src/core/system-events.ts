/**
 * System Events Queue — Gateway-layer in-memory queue for cross-cutting events.
 *
 * Used by:
 * - Cron main mode (inject cron results, heartbeat consumes)
 * - Async exec completions
 *
 * Design aligned with OpenClaw's system-events.ts
 */

export interface SystemEvent {
  text: string;
  createdAt: number;
}

export class SystemEventsQueue {
  private events = new Map<string, SystemEvent[]>();
  private maxPerSession = 20;
  private maxAgeMs = 3600 * 1000; // 1 hour TTL
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(gcIntervalMs = 30_000) {
    this.gcTimer = setInterval(() => this.gc(), gcIntervalMs);
    if (typeof this.gcTimer === "object" && "unref" in this.gcTimer) {
      this.gcTimer.unref();
    }
  }

  /**
   * Inject an event into the queue for a session.
   */
  inject(sessionKey: string, eventText: string): void {
    if (!this.events.has(sessionKey)) {
      this.events.set(sessionKey, []);
    }
    const queue = this.events.get(sessionKey)!;
    queue.push({ text: eventText, createdAt: Date.now() });

    // Evict oldest if over limit
    while (queue.length > this.maxPerSession) {
      queue.shift();
    }
  }

  /**
   * Peek at pending events without consuming.
   */
  peek(sessionKey: string): string[] {
    this.evictExpired(sessionKey);
    return (this.events.get(sessionKey) ?? []).map((e) => e.text);
  }

  /**
   * Peek and consume all events for a session.
   */
  consume(sessionKey: string): string[] {
    const items = this.peek(sessionKey);
    this.events.delete(sessionKey);
    return items;
  }

  /**
   * Check if there are pending events (without consuming).
   */
  hasPending(sessionKey: string): boolean {
    return this.peek(sessionKey).length > 0;
  }

  private evictExpired(sessionKey: string): void {
    const queue = this.events.get(sessionKey);
    if (!queue) return;
    const cutoff = Date.now() - this.maxAgeMs;
    const filtered = queue.filter((e) => e.createdAt > cutoff);
    if (filtered.length === 0) {
      this.events.delete(sessionKey);
    } else {
      this.events.set(sessionKey, filtered);
    }
  }

  /**
   * Cleanup all expired entries (call periodically).
   */
  gc(): void {
    for (const key of this.events.keys()) {
      this.evictExpired(key);
    }
  }

  /**
   * Get stats for monitoring.
   */
  getStats(): { sessions: number; totalEvents: number } {
    let total = 0;
    for (const queue of this.events.values()) {
      total += queue.length;
    }
    return { sessions: this.events.size, totalEvents: total };
  }

  /**
   * Stop the internal gc timer.
   */
  dispose(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }
}
