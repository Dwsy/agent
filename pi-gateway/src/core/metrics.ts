/**
 * Metrics Collector — in-memory metrics for pi-gateway observability.
 *
 * Design:
 * - Fixed-size ring buffer (10s sampling, 1h retention = 360 points)
 * - No persistence — resets on restart
 * - JSON snapshot via /api/metrics
 * - Latency percentiles via sorted insertion (no external deps)
 * - Subprocess RSS via `ps` (Darwin-compatible, 30s sampling)
 */

import { createLogger, type Logger, type SessionKey } from "./types.ts";
import { DelegationMetrics, type DelegationMetricsSnapshot } from "./delegate-metrics.ts";

// ============================================================================
// Quantile Tracker (sorted insertion, O(n) insert, O(1) lookup)
// ============================================================================

export class QuantileTracker {
  private entries: { value: number; ts: number }[] = [];
  private maxSize: number;
  private windowMs: number;

  constructor(maxSize = 1000, windowMs = 3_600_000) {
    this.maxSize = maxSize;
    this.windowMs = windowMs;
  }

  add(value: number): void {
    const now = Date.now();
    // Evict expired entries first
    this.evictExpired(now);
    // Append (unsorted — we sort on read since percentile calls are infrequent)
    this.entries.push({ value, ts: now });
    // Hard cap: drop oldest if over maxSize
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  percentile(p: number): number {
    this.evictExpired(Date.now());
    if (this.entries.length === 0) return 0;
    const sorted = this.entries.map(e => e.value).sort((a, b) => a - b);
    const idx = Math.min(
      Math.floor((p / 100) * sorted.length),
      sorted.length - 1,
    );
    return sorted[idx]!;
  }

  get count(): number {
    return this.entries.length;
  }

  reset(): void {
    this.entries.length = 0;
  }

  private evictExpired(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.entries.length > 0 && this.entries[0]!.ts < cutoff) {
      this.entries.shift();
    }
  }
}

// ============================================================================
// Ring Buffer (fixed array + write pointer)
// ============================================================================

export interface MetricsSample {
  timestamp: number;
  pool: {
    active: number;
    idle: number;
    total: number;
    maxCapacity: number;
  };
  queue: {
    sessions: number;
    totalPending: number;
  };
  sessions: {
    activeCount: number;
  };
  system: {
    gatewayRssMb: number;
    uptimeMs: number;
  };
}

class RingBuffer<T> {
  private buffer: (T | null)[];
  private writePtr = 0;
  private _size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity).fill(null);
  }

  push(item: T): void {
    this.buffer[this.writePtr] = item;
    this.writePtr = (this.writePtr + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  toArray(): T[] {
    if (this._size === 0) return [];
    const result: T[] = [];
    const start = this._size < this.capacity ? 0 : this.writePtr;
    for (let i = 0; i < this._size; i++) {
      const idx = (start + i) % this.capacity;
      const item = this.buffer[idx];
      if (item !== null) result.push(item);
    }
    return result;
  }

  get latest(): T | null {
    if (this._size === 0) return null;
    const idx = (this.writePtr - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  get size(): number {
    return this._size;
  }
}

// ============================================================================
// Counters
// ============================================================================

export interface MetricsCounters {
  processSpawns: number;
  processKills: number;
  processCrashes: number;
  rpcTimeouts: number;
  queueDrops: number;
  poolCapacityRejects: number;
  messagesProcessed: number;
  errorsTotal: number;
}

// ============================================================================
// Subprocess RSS Tracker
// ============================================================================

interface ProcessRss {
  pid: number;
  rssMb: number;
  timestamp: number;
}

async function getProcessRss(pid: number): Promise<number> {
  try {
    const proc = Bun.spawn(["ps", "-o", "rss=", "-p", String(pid)], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    const rssKb = parseInt(text.trim(), 10);
    return isNaN(rssKb) ? 0 : rssKb / 1024;
  } catch {
    return 0;
  }
}

// ============================================================================
// Metrics Collector
// ============================================================================

const SAMPLE_INTERVAL_MS = 10_000;   // 10s
const BUFFER_SIZE = 360;              // 1h at 10s intervals
const RSS_INTERVAL_MS = 30_000;       // 30s for subprocess RSS

export interface MetricsDataSource {
  getPoolStats(): { active: number; idle: number; total: number; maxCapacity: number };
  getQueueStats(): { sessions: number; totalPending: number };
  getActiveSessionCount(): number;
  getRpcPids(): number[];
}

export interface MetricsSnapshot {
  timestamp: number;
  current: MetricsSample | null;
  counters: MetricsCounters;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  rpcProcesses: ProcessRss[];
  history: MetricsSample[];
  delegation: DelegationMetricsSnapshot;
}

export class MetricsCollector {
  private ring = new RingBuffer<MetricsSample>(BUFFER_SIZE);
  private counters: MetricsCounters = {
    processSpawns: 0,
    processKills: 0,
    processCrashes: 0,
    rpcTimeouts: 0,
    queueDrops: 0,
    poolCapacityRejects: 0,
    messagesProcessed: 0,
    errorsTotal: 0,
  };
  private latencyTracker = new QuantileTracker(1000);
  private rpcProcessRss: ProcessRss[] = [];
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private rssTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();
  private log: Logger;
  private dataSource: MetricsDataSource | null = null;
  private delegationMetrics = new DelegationMetrics();

  constructor() {
    this.log = createLogger("metrics");
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(dataSource: MetricsDataSource): void {
    this.dataSource = dataSource;
    this.startTime = Date.now();

    // Main sampling loop (10s)
    this.sampleTimer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);

    // RSS sampling loop (30s)
    this.rssTimer = setInterval(() => this.sampleRss(), RSS_INTERVAL_MS);

    // Initial sample
    this.sample();
    this.log.info("Metrics collector started (10s sample, 1h retention)");
  }

  stop(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    if (this.rssTimer) {
      clearInterval(this.rssTimer);
      this.rssTimer = null;
    }
    this.log.info("Metrics collector stopped");
  }

  // ==========================================================================
  // Counter Increments (called by other modules)
  // ==========================================================================

  incProcessSpawn(): void { this.counters.processSpawns++; }
  incProcessKill(): void { this.counters.processKills++; }
  incProcessCrash(): void { this.counters.processCrashes++; this.counters.errorsTotal++; }
  incRpcTimeout(): void { this.counters.rpcTimeouts++; this.counters.errorsTotal++; }
  incQueueDrop(): void { this.counters.queueDrops++; this.counters.errorsTotal++; }
  incPoolCapacityReject(): void { this.counters.poolCapacityRejects++; this.counters.errorsTotal++; }
  incMessageProcessed(): void { this.counters.messagesProcessed++; }

  /** Record a message latency (prompt received → agent_end, in ms) */
  recordLatency(ms: number): void {
    this.latencyTracker.add(ms);
  }

  // ==========================================================================
  // Snapshot (for /api/metrics)
  // ==========================================================================

  getSnapshot(): MetricsSnapshot {
    return {
      timestamp: Date.now(),
      current: this.ring.latest,
      counters: { ...this.counters },
      latency: {
        p50: this.latencyTracker.percentile(50),
        p95: this.latencyTracker.percentile(95),
        p99: this.latencyTracker.percentile(99),
        count: this.latencyTracker.count,
      },
      rpcProcesses: [...this.rpcProcessRss],
      history: this.ring.toArray(),
      delegation: this.delegationMetrics.getSnapshot(),
    };
  }

  // ==========================================================================
  // Delegation Metrics (v3)
  // ==========================================================================

  /** Record delegation start */
  recordDelegationStart(): void {
    this.delegationMetrics.recordStart();
  }

  /** Record delegation completion */
  recordDelegationComplete(durationMs: number, status: "completed" | "timeout" | "error" | "rejected" | "pool_exhausted"): void {
    this.delegationMetrics.recordComplete(durationMs, status);
  }

  /** Get delegation metrics snapshot */
  getDelegationMetrics(): DelegationMetricsSnapshot {
    return this.delegationMetrics.getSnapshot();
  }

  // ==========================================================================
  // Internal Sampling
  // ==========================================================================

  private sample(): void {
    if (!this.dataSource) return;

    const pool = this.dataSource.getPoolStats();
    const queue = this.dataSource.getQueueStats();
    const mem = process.memoryUsage();

    const sample: MetricsSample = {
      timestamp: Date.now(),
      pool: { ...pool },
      queue: { sessions: queue.sessions, totalPending: queue.totalPending },
      sessions: { activeCount: this.dataSource.getActiveSessionCount() },
      system: {
        gatewayRssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        uptimeMs: Date.now() - this.startTime,
      },
    };

    this.ring.push(sample);
  }

  private async sampleRss(): Promise<void> {
    if (!this.dataSource) return;

    const pids = this.dataSource.getRpcPids();
    const results: ProcessRss[] = [];
    const now = Date.now();

    const rssResults = await Promise.all(pids.map(pid => getProcessRss(pid)));
    for (let i = 0; i < pids.length; i++) {
      results.push({ pid: pids[i]!, rssMb: rssResults[i]!, timestamp: now });
    }

    this.rpcProcessRss = results;
  }
}

// ============================================================================
// HTTP Handler (mounted by server.ts)
// ============================================================================

/**
 * Create a GET /api/metrics handler.
 * server.ts mounts this on the route — metrics module stays decoupled from HTTP layer.
 */
export function createMetricsHandler(collector: MetricsCollector): (req: Request) => Response {
  return (_req: Request) => {
    const snapshot = collector.getSnapshot();
    return new Response(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  };
}
