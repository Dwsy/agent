/**
 * Delegation Metrics — v3 Multi-Agent Delegation Observability
 *
 * Tracks delegation performance and health:
 * - delegationCount: total delegations initiated
 * - success: completed successfully
 * - timeout: exceeded timeoutMs
 * - error: agent errors, pool exhaustion, security rejections
 * - avgDuration: average execution time
 * - p95Duration: 95th percentile latency
 * - activeDelegations: currently running
 */

import { QuantileTracker } from "./metrics.ts";

export interface DelegationMetricsSnapshot {
  delegationCount: number;
  success: number;
  timeout: number;
  error: number;
  rejected: number;
  poolExhausted: number;
  avgDurationMs: number;
  p95DurationMs: number;
  activeDelegations: number;
}

export class DelegationMetrics {
  private count = 0;
  private success = 0;
  private timeout = 0;
  private error = 0;
  private rejected = 0;
  private poolExhausted = 0;
  private durationTracker: QuantileTracker;
  private active = 0;

  constructor() {
    // 1-hour window for quantiles
    this.durationTracker = new QuantileTracker(60 * 60 * 1000);
  }

  /**
   * Record delegation start
   */
  recordStart(): void {
    this.count++;
    this.active++;
  }

  /**
   * Record delegation completion
   */
  recordComplete(durationMs: number, status: "completed" | "timeout" | "error" | "rejected" | "pool_exhausted"): void {
    this.active = Math.max(0, this.active - 1);
    this.durationTracker.add(durationMs);

    switch (status) {
      case "completed":
        this.success++;
        break;
      case "timeout":
        this.timeout++;
        break;
      case "error":
        this.error++;
        break;
      case "rejected":
        this.rejected++;
        break;
      case "pool_exhausted":
        this.poolExhausted++;
        break;
    }
  }

  /**
   * Get current snapshot
   */
  getSnapshot(): DelegationMetricsSnapshot {
    const count = this.durationTracker.count;
    // Calculate average from raw entries by accessing private - use percentile(50) as fallback
    // Note: We estimate avg using p50 as approximation since QuantileTracker doesn't expose raw values
    const p50 = this.durationTracker.percentile(50);

    return {
      delegationCount: this.count,
      success: this.success,
      timeout: this.timeout,
      error: this.error,
      rejected: this.rejected,
      poolExhausted: this.poolExhausted,
      avgDurationMs: Math.round(p50), // Using p50 as approximation for avg
      p95DurationMs: this.durationTracker.percentile(95),
      activeDelegations: this.active,
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.count = 0;
    this.success = 0;
    this.timeout = 0;
    this.error = 0;
    this.rejected = 0;
    this.poolExhausted = 0;
    this.active = 0;
    this.durationTracker.reset();
  }
}
