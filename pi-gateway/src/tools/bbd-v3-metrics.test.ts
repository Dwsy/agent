/**
 * BBD v3 D-17~D-19 — Delegation Metrics Tests
 *
 * D-17: delegation success increments counter
 * D-18: delegation latency tracked in percentiles
 * D-19: delegation errors increment error counter
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { DelegationMetrics } from "../core/delegate-metrics.ts";

describe("v3 D-17: delegation success counter", () => {
  test("recordStart increments delegationCount and active", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordStart();

    const snap = m.getSnapshot();
    expect(snap.delegationCount).toBe(2);
    expect(snap.activeDelegations).toBe(2);
  });

  test("recordComplete with completed increments success", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(150, "completed");

    m.recordStart();
    m.recordComplete(200, "completed");

    const snap = m.getSnapshot();
    expect(snap.success).toBe(2);
    expect(snap.activeDelegations).toBe(0);
  });

  test("active count never goes below 0", () => {
    const m = new DelegationMetrics();

    m.recordComplete(100, "completed"); // no prior start

    const snap = m.getSnapshot();
    expect(snap.activeDelegations).toBe(0);
  });
});

describe("v3 D-18: delegation latency percentiles", () => {
  test("p95 tracks delegation duration", () => {
    const m = new DelegationMetrics();

    // Simulate 20 delegations with varying durations
    for (let i = 1; i <= 20; i++) {
      m.recordStart();
      m.recordComplete(i * 100, "completed"); // 100ms to 2000ms
    }

    const snap = m.getSnapshot();
    expect(snap.p95DurationMs).toBeGreaterThanOrEqual(1800);
    expect(snap.p95DurationMs).toBeLessThanOrEqual(2000);
    expect(snap.avgDurationMs).toBeGreaterThan(0);
  });

  test("single delegation has exact p95", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(500, "completed");

    const snap = m.getSnapshot();
    expect(snap.p95DurationMs).toBe(500);
  });
});

describe("v3 D-19: delegation error counters", () => {
  test("timeout increments timeout counter", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(60000, "timeout");

    const snap = m.getSnapshot();
    expect(snap.timeout).toBe(1);
    expect(snap.success).toBe(0);
  });

  test("error increments error counter", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(100, "error");

    const snap = m.getSnapshot();
    expect(snap.error).toBe(1);
  });

  test("rejected increments rejected counter", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(5, "rejected");

    const snap = m.getSnapshot();
    expect(snap.rejected).toBe(1);
  });

  test("pool_exhausted increments poolExhausted counter", () => {
    const m = new DelegationMetrics();

    m.recordStart();
    m.recordComplete(10, "pool_exhausted");

    const snap = m.getSnapshot();
    expect(snap.poolExhausted).toBe(1);
  });

  test("mixed statuses tracked independently", () => {
    const m = new DelegationMetrics();

    m.recordStart(); m.recordComplete(100, "completed");
    m.recordStart(); m.recordComplete(200, "completed");
    m.recordStart(); m.recordComplete(60000, "timeout");
    m.recordStart(); m.recordComplete(50, "error");
    m.recordStart(); m.recordComplete(5, "rejected");
    m.recordStart(); m.recordComplete(10, "pool_exhausted");

    const snap = m.getSnapshot();
    expect(snap.delegationCount).toBe(6);
    expect(snap.success).toBe(2);
    expect(snap.timeout).toBe(1);
    expect(snap.error).toBe(1);
    expect(snap.rejected).toBe(1);
    expect(snap.poolExhausted).toBe(1);
    expect(snap.activeDelegations).toBe(0);
  });

  test("reset clears all counters", () => {
    const m = new DelegationMetrics();

    m.recordStart(); m.recordComplete(100, "completed");
    m.recordStart(); m.recordComplete(200, "timeout");

    m.reset();

    const snap = m.getSnapshot();
    expect(snap.delegationCount).toBe(0);
    expect(snap.success).toBe(0);
    expect(snap.timeout).toBe(0);
    expect(snap.activeDelegations).toBe(0);
    expect(snap.p95DurationMs).toBe(0);
  });
});
