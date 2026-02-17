/**
 * Gateway Observability — 网关可观测性模块
 *
 * 内存环形缓冲记录事件，提供统计汇总接口
 */

export type ObservabilityLevel = 'debug' | 'info' | 'warn' | 'error';

export type ObservabilityCategory =
  | 'gateway'
  | 'cron'
  | 'api'
  | 'rpc'
  | 'session'
  | 'channel'
  | 'system';

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
}

export interface ListOptions {
  limit?: number;
  level?: ObservabilityLevel;
  category?: ObservabilityCategory;
}

export class GatewayObservability {
  private buffer: ObservabilityEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /**
   * 记录事件
   */
  record(
    level: ObservabilityLevel,
    category: ObservabilityCategory,
    action: string,
    message: string,
    meta?: Record<string, unknown>
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
    if (this.buffer.length > this.maxSize) {
      this.buffer.pop();
    }

    return event;
  }

  /**
   * 列出事件（支持过滤）
   */
  list(options: ListOptions = {}): ObservabilityEvent[] {
    const { limit = 100, level, category } = options;

    let events = this.buffer;

    if (level) {
      events = events.filter((e) => e.level === level);
    }

    if (category) {
      events = events.filter((e) => e.category === category);
    }

    return events.slice(0, limit);
  }

  /**
   * 获取统计汇总
   */
  summary(): ObservabilitySummary {
    const byLevel: Record<ObservabilityLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    const byCategory: Record<string, number> = {};

    for (const event of this.buffer) {
      byLevel[event.level]++;
      byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
    }

    const recentErrors = this.buffer
      .filter((e) => e.level === 'error')
      .slice(0, 10);

    return {
      total: this.buffer.length,
      byLevel,
      byCategory,
      recentErrors,
    };
  }

  /**
   * 获取最近错误列表
   */
  getRecentErrors(limit = 10): ObservabilityEvent[] {
    return this.buffer
      .filter((e) => e.level === 'error')
      .slice(0, limit);
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * 获取缓冲区大小
   */
  size(): number {
    return this.buffer.length;
  }
}
