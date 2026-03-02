/**
 * Model Health — error classification, health tracking, and fallback model selection.
 *
 * Tracks per-model failure state and selects the best available model
 * from a configured fallback chain [primary, ...fallbacks].
 */

import type { ModelFailoverConfig } from "./config.ts";

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorCategory = "rate_limit" | "auth" | "billing" | "timeout" | "overloaded" | "connection" | "empty_response" | "unknown";

const ERROR_PATTERNS: Array<{ category: ErrorCategory; patterns: RegExp[] }> = [
  {
    category: "rate_limit",
    patterns: [/429/i, /rate.?limit/i, /quota/i, /too many requests/i, /retry.?after/i],
  },
  {
    category: "auth",
    patterns: [/401/i, /403/i, /unauthorized/i, /forbidden/i, /invalid.?api.?key/i],
  },
  {
    category: "billing",
    patterns: [/402/i, /payment/i, /billing/i, /insufficient.?funds/i],
  },
  {
    category: "timeout",
    patterns: [/timeout/i, /timed?\s*out/i, /ETIMEDOUT/i, /CRON_TIMEOUT/i],
  },
  {
    category: "overloaded",
    patterns: [/503/i, /overloaded/i, /capacity/i, /unavailable/i, /529/i],
  },
  {
    category: "connection",
    patterns: [/connection.?error/i, /ECONNREFUSED/i, /ECONNRESET/i, /ENOTFOUND/i, /EHOSTUNREACH/i, /socket.?hang.?up/i, /network.?error/i, /fetch.?failed/i],
  },
  {
    category: "empty_response",
    patterns: [/empty.?response/i, /empty_response/i],
  },
];

export function classifyError(errorText: string): ErrorCategory {
  for (const { category, patterns } of ERROR_PATTERNS) {
    if (patterns.some((p) => p.test(errorText))) return category;
  }
  return "unknown";
}

/** Whether this error category is transient (worth retrying with fallback). */
export function isTransient(category: ErrorCategory): boolean {
  return category === "rate_limit" || category === "timeout" || category === "overloaded" || category === "connection" || category === "empty_response";
}

// ============================================================================
// Health State
// ============================================================================

export interface ModelHealthState {
  model: string;
  failures: number;
  lastFailure: number;
  lastError?: string;
  lastCategory?: ErrorCategory;
  cooldownUntil: number;
  probeBackoffMs?: number;
}

// ============================================================================
// ModelHealthTracker
// ============================================================================

export class ModelHealthTracker {
  private states = new Map<string, ModelHealthState>();
  private config: ModelFailoverConfig;

  constructor(config: ModelFailoverConfig) {
    this.config = config;
  }

  updateConfig(config: ModelFailoverConfig, options?: { resetStates?: boolean }): void {
    this.config = config;
    if (options?.resetStates) {
      this.states.clear();
    }
  }

  /** Record a failure for a model. Returns the error category. */
  recordFailure(model: string, errorText: string): ErrorCategory {
    const category = classifyError(errorText);
    const now = Date.now();
    const state = this.states.get(model) ?? {
      model,
      failures: 0,
      lastFailure: 0,
      cooldownUntil: 0,
      probeBackoffMs: this.config.cooldownMs ?? 60_000,
    };

    state.failures++;
    state.lastFailure = now;
    state.lastError = errorText.slice(0, 200);
    state.lastCategory = category;

    if (isTransient(category)) {
      const baseCooldownMs = this.config.cooldownMs ?? 60_000;
      const prevBackoff = state.probeBackoffMs ?? baseCooldownMs;
      const nextBackoff = Math.min(prevBackoff * 2, 10 * 60_000);
      state.probeBackoffMs = nextBackoff;
      state.cooldownUntil = now + nextBackoff;
    } else if (category === "auth" || category === "billing") {
      // Permanent errors: long cooldown
      state.cooldownUntil = now + 3_600_000; // 1 hour
    }

    this.states.set(model, state);
    return category;
  }

  /** Record a success — reset failure count and cooldown. */
  recordSuccess(model: string): void {
    const state = this.states.get(model);
    if (state) {
      state.failures = 0;
      state.cooldownUntil = 0;
      state.lastError = undefined;
      state.lastCategory = undefined;
      state.probeBackoffMs = this.config.cooldownMs ?? 60_000;
    }
  }

  /** Explicitly record empty assistant response (treated as transient failure). */
  recordEmptyResponse(model: string): ErrorCategory {
    return this.recordFailure(model, "EMPTY_RESPONSE");
  }

  /** Whether cooldown just expired and this request is a probe attempt. */
  shouldProbe(model: string): boolean {
    const state = this.states.get(model);
    if (!state) return false;
    return state.cooldownUntil > 0 && Date.now() >= state.cooldownUntil;
  }

  /** Check if a model is currently in cooldown. */
  isInCooldown(model: string): boolean {
    const state = this.states.get(model);
    if (!state) return false;
    return Date.now() < state.cooldownUntil;
  }

  /**
   * Select the best available model from the fallback chain.
   * Returns the first model not in cooldown. If all are in cooldown,
   * returns the primary as probe candidate.
   */
  selectModel(primary: string, fallbacks: string[]): string | null {
    const chain = [primary, ...fallbacks];
    for (const model of chain) {
      if (!this.isInCooldown(model)) return model;
    }
    // All in cooldown — return primary as probe candidate.
    return primary;
  }

  /** Get health state for a model (for diagnostics). */
  getState(model: string): ModelHealthState | undefined {
    return this.states.get(model);
  }

  /** Get all tracked states (for /status endpoint). */
  getAllStates(): ModelHealthState[] {
    return Array.from(this.states.values());
  }
}
