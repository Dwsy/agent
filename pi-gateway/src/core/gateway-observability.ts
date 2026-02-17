/**
 * Gateway Observability — 网关可观测性模块
 */

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export type ObservabilityCategory =
  | "gateway"
  | "cron"
  | "api"
  | "rpc"
  | "session"
  | "channel"
  | "system";

export interface ObservabilityEvent {
  id: string;
  ts: number;
  level: ObservabilityLevel;
  category: ObservabilityCategory;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ObservabilitySummary {
  total: number;
  byLevel: Record<ObservabilityLevel, number>;
  byCategory: Record<string, number>;
  recentErrors: ObservabilityEvent[];
  topActions: Array<{ action: string; count: number }>;
  errorRatePct: number;
  windowMs: number | null;
}

export interface ListOptions {
  limit?: number;
  level?: ObservabilityLevel;
  category?: ObservabilityCategory;
  windowMs?: number;
}

export class GatewayObservability {
  private buffer: ObservabilityEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  record(
    level: ObservabilityLevel,
    category: ObservabilityCategory,
    action: string,
    message: string,
    meta?: Record<string, unknown>,
  ): ObservabilityEvent {
    const event: ObservabilityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      ts: Date.now(),
      level,
      category,
      action,
      message,
      meta,
    };

    this.buffer.unshift(event);
    if (this.buffer.length > this.maxSize) this.buffer.pop();
    return event;
  }

  list(options: ListOptions = {}): ObservabilityEvent[] {
    const { limit = 100, level, category, windowMs } = options;
    let events = this.filterByWindow(windowMs);

    if (level) events = events.filter((e) => e.level === level);
    if (category) events = events.filter((e) => e.category === category);

    return events.slice(0, limit);
  }

  summary(windowMs?: number): ObservabilitySummary {
    const scoped = this.filterByWindow(windowMs);

    const byLevel: Record<ObservabilityLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    const byCategory: Record<string, number> = {};
    const actionCounter = new Map<string, number>();

    for (const event of scoped) {
      byLevel[event.level]++;
      byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
      actionCounter.set(event.action, (actionCounter.get(event.action) ?? 0) + 1);
    }

    const recentErrors = scoped.filter((e) => e.level === "error").slice(0, 10);
    const topActions = [...actionCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([action, count]) => ({ action, count }));

    const total = scoped.length;
    const errorRatePct = total > 0 ? Math.round((byLevel.error / total) * 10000) / 100 : 0;

    return {
      total,
      byLevel,
      byCategory,
      recentErrors,
      topActions,
      errorRatePct,
      windowMs: windowMs ?? null,
    };
  }

  getRecentErrors(limit = 10): ObservabilityEvent[] {
    return this.buffer.filter((e) => e.level === "error").slice(0, limit);
  }

  clear(): void {
    this.buffer = [];
  }

  size(): number {
    return this.buffer.length;
  }

  private filterByWindow(windowMs?: number): ObservabilityEvent[] {
    if (!windowMs || windowMs <= 0) return this.buffer;
    const since = Date.now() - windowMs;
    return this.buffer.filter((e) => e.ts >= since);
  }
}

export function parseObservabilityWindow(input?: string | null): number | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  const table: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  if (table[value]) return table[value];

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return undefined;
}
