/**
 * System Events Queue — Gateway-layer queue for cross-cutting events.
 *
 * Used by:
 * - Cron main mode (inject cron results, heartbeat consumes)
 * - Async exec completions
 *
 * Supports optional file-based persistence (JSONL) for crash recovery.
 * Design aligned with OpenClaw's system-events.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

export interface SystemEvent {
  text: string;
  createdAt: number;
}

export class SystemEventsQueue {
  private events = new Map<string, SystemEvent[]>();
  private maxPerSession = 20;
  private maxAgeMs = 3600 * 1000; // 1 hour TTL
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private persistPath: string | null = null;

  constructor(gcIntervalMs = 30_000, dataDir?: string) {
    this.gcTimer = setInterval(() => this.gc(), gcIntervalMs);
    if (typeof this.gcTimer === "object" && "unref" in this.gcTimer) {
      this.gcTimer.unref();
    }
    if (dataDir) {
      this.persistPath = join(dataDir, "system-events.jsonl");
      this.restoreFromDisk();
    }
  }

  inject(sessionKey: string, eventText: string): void {
    if (!this.events.has(sessionKey)) {
      this.events.set(sessionKey, []);
    }
    const queue = this.events.get(sessionKey)!;
    queue.push({ text: eventText, createdAt: Date.now() });

    while (queue.length > this.maxPerSession) {
      queue.shift();
    }
    this.persistToDisk();
  }

  peek(sessionKey: string): string[] {
    this.evictExpired(sessionKey);
    return (this.events.get(sessionKey) ?? []).map((e) => e.text);
  }

  consume(sessionKey: string): string[] {
    const items = this.peek(sessionKey);
    this.events.delete(sessionKey);
    this.persistToDisk();
    return items;
  }

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

  gc(): void {
    for (const key of this.events.keys()) {
      this.evictExpired(key);
    }
  }

  getStats(): { sessions: number; totalEvents: number } {
    let total = 0;
    for (const queue of this.events.values()) {
      total += queue.length;
    }
    return { sessions: this.events.size, totalEvents: total };
  }

  dispose(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.persistToDisk();
  }

  private persistToDisk(): void {
    if (!this.persistPath) return;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const lines: string[] = [];
      for (const [sessionKey, queue] of this.events) {
        for (const evt of queue) {
          lines.push(JSON.stringify({ sessionKey, ...evt }));
        }
      }
      const tmpPath = this.persistPath + ".tmp";
      writeFileSync(tmpPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf-8");
      renameSync(tmpPath, this.persistPath);
    } catch {
      // Best-effort persistence
    }
  }

  private restoreFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const content = readFileSync(this.persistPath, "utf-8").trim();
      if (!content) return;
      const cutoff = Date.now() - this.maxAgeMs;
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const { sessionKey, text, createdAt } = JSON.parse(line) as { sessionKey: string; text: string; createdAt: number };
        if (createdAt <= cutoff) continue;
        if (!this.events.has(sessionKey)) this.events.set(sessionKey, []);
        this.events.get(sessionKey)!.push({ text, createdAt });
      }
    } catch {
      // Corrupted file — start fresh
    }
  }
}
