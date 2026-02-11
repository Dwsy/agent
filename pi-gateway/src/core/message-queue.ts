/**
 * Per-session message queue — ensures serial processing per session.
 *
 * Aligned with OpenClaw's serial execution model and pi-mom's ChannelQueue:
 * - Messages for the same session are processed one at a time
 * - Different sessions can process concurrently
 * - Queue size is capped to prevent unbounded growth
 * - Priority-based ordering within each session queue
 */

import { createLogger, type Logger, type SessionKey, type MessageSource, type ImageContent } from "./types.ts";
import type { MetricsCollector } from "./metrics.ts";

// ============================================================================
// Types
// ============================================================================

export type QueuedWork = () => Promise<void>;

/** Prioritized work item with metadata for collect merge and drop summarization. */
export interface PrioritizedWork {
  work: QueuedWork;
  /** Numeric priority — higher = more urgent. DM=10, group=5, webhook=3, allowlist=+2 */
  priority: number;
  /** Enqueue timestamp for TTL and ordering */
  enqueuedAt: number;
  /** TTL in ms. 0 = no expiry */
  ttl: number;
  /** Original message source for collect grouping */
  source?: MessageSource;
  /** Original text for collect merge prompt */
  text?: string;
  /** Human-readable summary for drop policy. Fallback: text.slice(0, 140) */
  summaryLine?: string;
  /** Images attached to this message (for collect mode image concat) */
  images?: ImageContent[];
  /**
   * When set by collect mode, processMessage should use this text instead of msg.text.
   * Mutated by SessionQueue.drain() before calling work().
   */
  collectMergedText?: string;
  /**
   * Optional: called before merged work executes in collect mode.
   * Used by dispatch layer to trigger setTyping on first item, concat images, etc.
   */
  onBeforeCollectWork?: (batch: PrioritizedWork[]) => Promise<void>;
}

export interface QueueStats {
  sessions: number;
  totalPending: number;
  dropCount: number;
  details: Array<{ sessionKey: SessionKey; pending: number; processing: boolean }>;
}

// ============================================================================
// Session Queue (single session)
// ============================================================================

/** Callback when an item is evicted due to queue full + lower priority. */
export type EvictionCallback = (item: PrioritizedWork) => void;

/** Callback to execute a merged batch of items. */
export type CollectExecutor = (batch: PrioritizedWork[], mergedPrompt: string) => Promise<void>;

/** Queue mode configuration. */
export interface QueueModeConfig {
  /** Queue processing mode. "collect" merges messages, "individual" processes one by one. */
  mode: "collect" | "individual";
  /** Debounce window in ms for collect mode. Default: 1500 */
  collectDebounceMs: number;
  /** Max dropped summaries to include in collect prompt overflow section. */
  maxDroppedSummaries: number;
}

const DEFAULT_QUEUE_MODE: QueueModeConfig = {
  mode: "collect",
  collectDebounceMs: 1500,
  maxDroppedSummaries: 5,
};

class SessionQueue {
  private queue: PrioritizedWork[] = [];
  private processing = false;
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private droppedSummaries: string[] = [];
  private log: Logger;
  private onEvicted?: EvictionCallback;
  private modeConfig: QueueModeConfig;
  /** Metrics: total collect merges for this session. */
  collectMergeCount = 0;

  constructor(
    readonly sessionKey: SessionKey,
    private maxSize: number,
    log: Logger,
    onEvicted?: EvictionCallback,
    modeConfig?: Partial<QueueModeConfig>,
  ) {
    this.log = log;
    this.onEvicted = onEvicted;
    this.modeConfig = { ...DEFAULT_QUEUE_MODE, ...modeConfig };
  }

  get pending(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0 && !this.processing;
  }

  /** Get the lowest priority item in the queue (for global eviction). */
  get lowestPriorityItem(): PrioritizedWork | null {
    if (this.queue.length === 0) return null;
    return this.queue.reduce((min, x) => x.priority < min.priority ? x : min);
  }

  /**
   * Clear all pending items, cancel collect debounce timer, and reset dropped summaries.
   * Used by interrupt mode to discard queued messages before redispatching.
   * Returns the number of items cleared.
   */
  clearCollectBuffer(): number {
    const cleared = this.queue.length;
    if (this.collectTimer) {
      clearTimeout(this.collectTimer);
      this.collectTimer = null;
    }
    this.queue.length = 0;
    this.droppedSummaries = [];
    if (cleared > 0) {
      this.log.info(`Cleared collect buffer for ${this.sessionKey}: ${cleared} items discarded`);
    }
    return cleared;
  }

  enqueue(item: PrioritizedWork): boolean {
    if (this.queue.length >= this.maxSize) {
      // Evict lowest priority item if new item has higher priority
      const lowest = this.lowestPriorityItem;
      if (lowest && item.priority > lowest.priority) {
        this.queue.splice(this.queue.indexOf(lowest), 1);
        this.log.debug(`Evicted priority=${lowest.priority} item from ${this.sessionKey} for priority=${item.priority}`);
        this.recordDroppedSummary(lowest);
        this.onEvicted?.(lowest);
      } else {
        this.log.warn(`Queue full for ${this.sessionKey} (max ${this.maxSize}), dropping message`);
        return false;
      }
    }
    // Insert sorted by priority desc, FIFO within same priority
    const idx = this.queue.findIndex(x => x.priority < item.priority);
    this.queue.splice(idx === -1 ? this.queue.length : idx, 0, item);
    this.scheduleProcess();
    return true;
  }

  /** Remove a specific item (for global eviction). */
  evict(item: PrioritizedWork): boolean {
    const idx = this.queue.indexOf(item);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    this.onEvicted?.(item);
    return true;
  }

  // --------------------------------------------------------------------------
  // Processing
  // --------------------------------------------------------------------------

  private scheduleProcess(): void {
    // Don't schedule if already processing — new items will be picked up by the while loop
    if (this.processing) return;

    if (this.modeConfig.mode === "individual") {
      // Individual mode: process immediately, no debounce
      void this.drain();
      return;
    }

    // Collect mode: reset debounce timer on each new message
    if (this.collectTimer) clearTimeout(this.collectTimer);
    this.collectTimer = setTimeout(() => {
      this.collectTimer = null;
      void this.drain();
    }, this.modeConfig.collectDebounceMs);
  }

  /**
   * Async while loop drain — processes batches until queue is empty
   * AND all dropped summaries have been flushed.
   * Not recursive to avoid stack overflow under high-frequency enqueue.
   *
   * Design note: collect debounce (1500ms) is handled here at the queue layer.
   * Channel plugins (e.g. Telegram) should set their own debounce to 0 to avoid
   * double-debouncing. The queue is the single source of truth for message coalescing.
   */
  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // Also drain if there are pending dropped summaries (OpenClaw: droppedCount > 0)
      while (this.queue.length > 0 || this.droppedSummaries.length > 0) {
        const batch = this.queue.splice(0, this.queue.length);

        if (batch.length === 0 && this.droppedSummaries.length > 0) {
          // No items but have dropped summaries — generate summary-only prompt
          // This can happen when all items were evicted but summaries remain
          this.log.info(`Flushing ${this.droppedSummaries.length} dropped summaries for ${this.sessionKey}`);
          this.droppedSummaries = []; // Clear to exit loop
          break;
        }

        if (batch.length === 1 || this.modeConfig.mode === "individual") {
          // Single item or individual mode: process each separately
          for (const item of batch) {
            try {
              await item.work();
            } catch (err) {
              this.log.error(`Queue error for ${this.sessionKey}:`, err);
            }
          }
        } else {
          // Collect mode: merge batch into single prompt
          this.collectMergeCount++;
          const mergedPrompt = this.buildCollectPrompt(batch);
          this.log.info(`Collect merged ${batch.length} messages for ${this.sessionKey}`);

          // Set merged text on the last item. The work closure captures this item
          // by reference, so processMessage will see collectMergedText.
          // Safe from races: processing=true prevents concurrent drain,
          // and finally ensures cleanup even on exception.
          const lastItem = batch[batch.length - 1];
          lastItem.collectMergedText = mergedPrompt;
          try {
            if (lastItem.onBeforeCollectWork) {
              await lastItem.onBeforeCollectWork(batch);
            }
            await lastItem.work();
          } catch (err) {
            this.log.error(`Queue collect error for ${this.sessionKey}:`, err);
          } finally {
            lastItem.collectMergedText = undefined;
          }
        }
        // Loop continues if new items arrived during execution
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Build a merged prompt from multiple queued messages.
   * Format aligned with OpenClaw buildCollectPrompt().
   */
  buildCollectPrompt(items: PrioritizedWork[]): string {
    const lines: string[] = ["[Queued messages while agent was busy]", ""];

    for (let i = 0; i < items.length; i++) {
      lines.push("---");
      const imgTag = items[i].images?.length ? " (with image)" : "";
      lines.push(`Queued #${i + 1}${imgTag}`);
      lines.push(items[i].text ?? "(no text)");
      lines.push("");
    }

    // Append overflow section for dropped messages
    if (this.droppedSummaries.length > 0) {
      lines.push("---");
      lines.push("[Dropped messages (summarized)]");
      const summaries = this.droppedSummaries.slice(-this.modeConfig.maxDroppedSummaries);
      const overflow = this.droppedSummaries.length - summaries.length;
      for (const s of summaries) {
        lines.push(s);
      }
      if (overflow > 0) {
        lines.push(`(and ${overflow} more dropped)`);
      }
      // Clear after including in prompt
      this.droppedSummaries = [];
    }

    return lines.join("\n");
  }

  /** Record a dropped message summary for inclusion in next collect prompt. */
  private recordDroppedSummary(item: PrioritizedWork): void {
    const summary = item.summaryLine ?? (item.text ?? "").slice(0, 140);
    const ellipsis = !item.summaryLine && (item.text?.length ?? 0) > 140 ? "..." : "";
    this.droppedSummaries.push(`[Dropped] ${summary}${ellipsis}`);
  }
}

// ============================================================================
// Message Queue Manager (all sessions)
// ============================================================================

export class MessageQueueManager {
  private queues = new Map<SessionKey, SessionQueue>();
  private log: Logger;
  private maxQueueSize: number;
  private globalMaxPending: number;
  private modeConfig: Partial<QueueModeConfig>;
  private _dropCount = 0;
  /** Sliding window for enqueue rate (timestamps of recent enqueues) */
  private enqueueTimestamps: number[] = [];
  private readonly RATE_WINDOW_MS = 10_000; // 10s sliding window

  constructor(
    maxQueueSize = 15,
    modeConfig?: Partial<QueueModeConfig>,
    private metrics?: MetricsCollector,
    globalMaxPending = 100,
  ) {
    this.log = createLogger("queue");
    this.maxQueueSize = maxQueueSize;
    this.globalMaxPending = globalMaxPending;
    this.modeConfig = modeConfig ?? {};
  }

  /**
   * Enqueue prioritized work for a session. Returns false if the queue is full.
   */
  enqueue(sessionKey: SessionKey, item: PrioritizedWork): boolean;
  /**
   * Enqueue work for a session (backward compat). Returns false if the queue is full.
   * Wraps into PrioritizedWork with default priority=5.
   */
  enqueue(sessionKey: SessionKey, work: QueuedWork): boolean;
  enqueue(sessionKey: SessionKey, itemOrWork: PrioritizedWork | QueuedWork): boolean {
    const item: PrioritizedWork = typeof itemOrWork === "function"
      ? { work: itemOrWork, priority: 5, enqueuedAt: Date.now(), ttl: 0 }
      : itemOrWork;

    // Global pending cap: check total across all sessions
    if (this.getTotalPending() >= this.globalMaxPending) {
      const evicted = this.evictGlobalLowestPriority(item.priority);
      if (!evicted) {
        this._dropCount++;
        this.metrics?.incQueueDrop();
        this.log.warn(`Global pending cap reached (${this.globalMaxPending}), dropping priority=${item.priority} message`);
        return false;
      }
    }

    let queue = this.queues.get(sessionKey);
    if (!queue) {
      queue = new SessionQueue(sessionKey, this.maxQueueSize, this.log, (evicted) => {
        this._dropCount++;
        this.metrics?.incQueueDrop();
        this.log.info(`Evicted item from ${sessionKey} (priority=${evicted.priority}, summary="${evicted.summaryLine ?? evicted.text?.slice(0, 50) ?? "?"}")`);
      }, this.modeConfig);
      this.queues.set(sessionKey, queue);
    }
    const ok = queue.enqueue(item);
    if (ok) {
      this.enqueueTimestamps.push(Date.now());
    } else {
      this._dropCount++;
      this.metrics?.incQueueDrop();
    }
    return ok;
  }

  /**
   * Enqueue rate: messages/sec over the last 10s sliding window.
   */
  private getEnqueueRate(): number {
    const now = Date.now();
    const cutoff = now - this.RATE_WINDOW_MS;
    // Trim old entries
    while (this.enqueueTimestamps.length > 0 && this.enqueueTimestamps[0] < cutoff) {
      this.enqueueTimestamps.shift();
    }
    return this.enqueueTimestamps.length / (this.RATE_WINDOW_MS / 1000);
  }

  /**
   * Get total pending items across all sessions.
   */
  private getTotalPending(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.pending;
    }
    return total;
  }

  /**
   * Find and evict the lowest priority item across all sessions.
   * Returns true if an item was evicted, false if all items have >= priority.
   */
  private evictGlobalLowestPriority(incomingPriority: number): boolean {
    let lowestQueue: SessionQueue | null = null;
    let lowestItem: PrioritizedWork | null = null;

    for (const queue of this.queues.values()) {
      const candidate = queue.lowestPriorityItem;
      if (candidate && (!lowestItem || candidate.priority < lowestItem.priority)) {
        lowestItem = candidate;
        lowestQueue = queue;
      }
    }

    if (!lowestQueue || !lowestItem || lowestItem.priority >= incomingPriority) {
      return false;
    }

    return lowestQueue.evict(lowestItem);
  }

  /**
   * Get queue stats for monitoring.
   */
  getStats(): QueueStats & { collectMergeCount: number; enqueueRate: number } {
    const details: QueueStats["details"] = [];
    let totalPending = 0;
    let collectMergeCount = 0;

    for (const [key, queue] of this.queues) {
      details.push({
        sessionKey: key,
        pending: queue.pending,
        processing: queue.isProcessing,
      });
      totalPending += queue.pending;
      collectMergeCount += queue.collectMergeCount;
    }

    return {
      sessions: this.queues.size,
      totalPending,
      dropCount: this._dropCount,
      collectMergeCount,
      enqueueRate: this.getEnqueueRate(),
      details,
    };
  }

  /**
   * Clean up empty queues.
   */
  cleanup(): void {
    for (const [key, queue] of this.queues) {
      if (queue.isEmpty) {
        this.queues.delete(key);
      }
    }
  }

  /**
   * Clear collect buffer for a specific session (interrupt mode).
   * Discards all pending items, cancels debounce timer, resets dropped summaries.
   * Returns the number of items cleared.
   */
  clearCollectBuffer(sessionKey: SessionKey): number {
    const queue = this.queues.get(sessionKey);
    if (!queue) return 0;
    return queue.clearCollectBuffer();
  }
}
