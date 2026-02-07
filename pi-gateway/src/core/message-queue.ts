/**
 * Per-session message queue — ensures serial processing per session.
 *
 * Aligned with OpenClaw's serial execution model and pi-mom's ChannelQueue:
 * - Messages for the same session are processed one at a time
 * - Different sessions can process concurrently
 * - Queue size is capped to prevent unbounded growth
 */

import { createLogger, type Logger, type SessionKey } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export type QueuedWork = () => Promise<void>;

export interface QueueStats {
  sessions: number;
  totalPending: number;
  details: Array<{ sessionKey: SessionKey; pending: number; processing: boolean }>;
}

// ============================================================================
// Session Queue (single session)
// ============================================================================

class SessionQueue {
  private queue: QueuedWork[] = [];
  private processing = false;
  private log: Logger;

  constructor(
    readonly sessionKey: SessionKey,
    private maxSize: number,
    log: Logger,
  ) {
    this.log = log;
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

  enqueue(work: QueuedWork): boolean {
    if (this.queue.length >= this.maxSize) {
      this.log.warn(`Queue full for ${this.sessionKey} (max ${this.maxSize}), dropping message`);
      return false;
    }
    this.queue.push(work);
    this.processNext();
    return true;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const work = this.queue.shift()!;

    try {
      await work();
    } catch (err) {
      this.log.error(`Queue error for ${this.sessionKey}:`, err);
    }

    this.processing = false;
    this.processNext();
  }
}

// ============================================================================
// Message Queue Manager (all sessions)
// ============================================================================

export class MessageQueueManager {
  private queues = new Map<SessionKey, SessionQueue>();
  private log: Logger;
  private maxQueueSize: number;

  constructor(maxQueueSize = 10) {
    this.log = createLogger("queue");
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Enqueue work for a session. Returns false if the queue is full.
   */
  enqueue(sessionKey: SessionKey, work: QueuedWork): boolean {
    let queue = this.queues.get(sessionKey);
    if (!queue) {
      queue = new SessionQueue(sessionKey, this.maxQueueSize, this.log);
      this.queues.set(sessionKey, queue);
    }
    return queue.enqueue(work);
  }

  /**
   * Get queue stats for monitoring.
   */
  getStats(): QueueStats {
    const details: QueueStats["details"] = [];
    let totalPending = 0;

    for (const [key, queue] of this.queues) {
      details.push({
        sessionKey: key,
        pending: queue.pending,
        processing: queue.isProcessing,
      });
      totalPending += queue.pending;
    }

    return { sessions: this.queues.size, totalPending, details };
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
}
