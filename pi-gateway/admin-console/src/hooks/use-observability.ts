/**
 * useObservability Hook
 * 可观测性工具 Hook，封装事件追踪和指标收集
 */
import { useCallback, useMemo } from 'react';
import {
  useObservabilityStore,
  trackEvent,
  trackMetric,
  type ObservabilityLevel,
  type ObservabilityEvent,
  type ObservabilityMetric,
} from '../store/observability-store';

/**
 * 使用观测性事件的 Hook
 */
export function useObservabilityEvents() {
  const events = useObservabilityStore((state) => state.events);
  const clearEvents = useObservabilityStore((state) => state.clearEvents);

  const eventCount = events.length;

  const getEventsByLevel = useCallback(
    (level: ObservabilityLevel) => events.filter((e) => e.level === level),
    [events]
  );

  const getEventsByCategory = useCallback(
    (category: ObservabilityEvent['category']) =>
      events.filter((e) => e.category === category),
    [events]
  );

  const getRecentEvents = useCallback(
    (count: number) => events.slice(0, count),
    [events]
  );

  return useMemo(
    () => ({
      events,
      eventCount,
      clearEvents,
      getEventsByLevel,
      getEventsByCategory,
      getRecentEvents,
    }),
    [events, eventCount, clearEvents, getEventsByLevel, getEventsByCategory, getRecentEvents]
  );
}

/**
 * 使用观测性指标的 Hook
 */
export function useObservabilityMetrics() {
  const metrics = useObservabilityStore((state) => state.metrics);
  const clearMetrics = useObservabilityStore((state) => state.clearMetrics);

  const metricCount = metrics.length;

  const getMetricsByName = useCallback(
    (name: string) => metrics.filter((m) => m.name === name),
    [metrics]
  );

  const getLatestMetric = useCallback(
    (name: string): ObservabilityMetric | undefined => {
      return metrics.find((m) => m.name === name);
    },
    [metrics]
  );

  const getMetricStats = useCallback(
    (name: string) => {
      const values = metrics
        .filter((m) => m.name === name)
        .map((m) => m.value);
      
      if (values.length === 0) return null;

      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      return { count: values.length, sum, avg, min, max };
    },
    [metrics]
  );

  return useMemo(
    () => ({
      metrics,
      metricCount,
      clearMetrics,
      getMetricsByName,
      getLatestMetric,
      getMetricStats,
    }),
    [metrics, metricCount, clearMetrics, getMetricsByName, getLatestMetric, getMetricStats]
  );
}

/**
 * 综合观测性 Hook
 */
export function useObservability() {
  const events = useObservabilityEvents();
  const metrics = useObservabilityMetrics();

  const clearAll = useCallback(() => {
    events.clearEvents();
    metrics.clearMetrics();
  }, [events, metrics]);

  return useMemo(
    () => ({
      ...events,
      ...metrics,
      clearAll,
    }),
    [events, metrics, clearAll]
  );
}

/**
 * 追踪配置事件的便捷函数
 */
export function trackConfigEvent(
  level: ObservabilityLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  trackEvent({
    level,
    category: 'config',
    message,
    meta,
  });
}

/**
 * 追踪查询事件的便捷函数
 */
export function trackQueryEvent(
  level: ObservabilityLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  trackEvent({
    level,
    category: 'query',
    message,
    meta,
  });
}

/**
 * 追踪变更事件的便捷函数
 */
export function trackMutationEvent(
  level: ObservabilityLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  trackEvent({
    level,
    category: 'mutation',
    message,
    meta,
  });
}

/**
 * 追踪权限事件的便捷函数
 */
export function trackPermissionEvent(
  level: ObservabilityLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  trackEvent({
    level,
    category: 'permission',
    message,
    meta,
  });
}

/**
 * 追踪运行时事件的便捷函数
 */
export function trackRuntimeEvent(
  level: ObservabilityLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  trackEvent({
    level,
    category: 'runtime',
    message,
    meta,
  });
}

/**
 * 记录查询耗时指标
 */
export function recordQueryDuration(queryKey: string, durationMs: number, tags?: Record<string, string>): void {
  trackMetric({
    name: 'query_duration_ms',
    value: durationMs,
    tags: { queryKey, ...tags },
  });
}

/**
 * 记录变更耗时指标
 */
export function recordMutationDuration(mutationName: string, durationMs: number, tags?: Record<string, string>): void {
  trackMetric({
    name: 'mutation_duration_ms',
    value: durationMs,
    tags: { mutationName, ...tags },
  });
}

/**
 * 记录错误计数指标
 */
export function recordErrorCount(errorType: string, tags?: Record<string, string>): void {
  trackMetric({
    name: 'error_count',
    value: 1,
    tags: { errorType, ...tags },
  });
}
