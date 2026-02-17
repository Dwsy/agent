/**
 * useGatewayObservability Hook
 * 优先读取后端网关观测数据，后端不可用时回退到前端本地数据
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useObservabilityStore, type ObservabilityEvent, type ObservabilityLevel } from '../store/observability-store';

export type GatewayObservabilityEvent = {
  id: string;
  ts: number;
  level: ObservabilityLevel;
  category: string;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type GatewayObservabilitySummary = {
  total: number;
  byLevel: Record<ObservabilityLevel, number>;
  byCategory: Record<string, number>;
  recentErrors: GatewayObservabilityEvent[];
};

type FetchState = {
  loading: boolean;
  error: string | null;
  backendAvailable: boolean;
};

const API_BASE = '/api';

async function fetchEvents(limit = 100, level?: ObservabilityLevel, category?: string): Promise<GatewayObservabilityEvent[]> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (level) params.set('level', level);
  if (category) params.set('category', category);
  
  const res = await fetch(`${API_BASE}/observability/events?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

async function fetchSummary(): Promise<GatewayObservabilitySummary> {
  const res = await fetch(`${API_BASE}/observability/summary`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.summary;
}

function mapFrontendEvent(e: ObservabilityEvent): GatewayObservabilityEvent {
  return {
    id: e.id,
    ts: e.ts,
    level: e.level,
    category: e.category,
    action: 'frontend',
    message: e.message,
    meta: e.meta,
  };
}

/**
 * 使用网关观测性数据（优先后端，回退前端）
 */
export function useGatewayObservability(options: { 
  pollInterval?: number; 
  limit?: number;
  level?: ObservabilityLevel;
  category?: string;
} = {}) {
  const { pollInterval = 5000, limit = 100, level, category } = options;
  
  // 后端数据
  const [events, setEvents] = useState<GatewayObservabilityEvent[]>([]);
  const [summary, setSummary] = useState<GatewayObservabilitySummary | null>(null);
  const [state, setState] = useState<FetchState>({ loading: true, error: null, backendAvailable: false });
  
  // 前端本地数据（fallback）
  const frontendEvents = useObservabilityStore((s) => s.events);
  const clearFrontendEvents = useObservabilityStore((s) => s.clearEvents);

  // 获取后端数据
  const fetchBackend = useCallback(async () => {
    try {
      const [evts, sum] = await Promise.all([
        fetchEvents(limit, level, category),
        fetchSummary(),
      ]);
      setEvents(evts);
      setSummary(sum);
      setState({ loading: false, error: null, backendAvailable: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ 
        loading: false, 
        error: msg, 
        backendAvailable: false 
      }));
    }
  }, [limit, level, category]);

  // 初始加载 + 轮询
  useEffect(() => {
    fetchBackend();
    if (pollInterval <= 0) return;
    const timer = setInterval(fetchBackend, pollInterval);
    return () => clearInterval(timer);
  }, [fetchBackend, pollInterval]);

  // 合并后的数据（后端优先，否则前端）
  const mergedEvents = useMemo((): GatewayObservabilityEvent[] => {
    if (state.backendAvailable) return events;
    // 回退到前端本地数据
    return frontendEvents.map(mapFrontendEvent);
  }, [events, frontendEvents, state.backendAvailable]);

  const mergedSummary = useMemo((): GatewayObservabilitySummary => {
    if (state.backendAvailable && summary) return summary;
    // 从前端数据计算汇总
    const byLevel: Record<ObservabilityLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    const byCategory: Record<string, number> = {};
    frontendEvents.forEach((e) => {
      byLevel[e.level]++;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    });
    return {
      total: frontendEvents.length,
      byLevel,
      byCategory,
      recentErrors: frontendEvents
        .filter((e) => e.level === 'error')
        .slice(0, 10)
        .map(mapFrontendEvent),
    };
  }, [summary, frontendEvents, state.backendAvailable]);

  const clearEvents = useCallback(() => {
    // 清空前端本地数据
    clearFrontendEvents();
    // 如果后端可用，尝试刷新
    if (state.backendAvailable) {
      fetchBackend();
    }
  }, [clearFrontendEvents, fetchBackend, state.backendAvailable]);

  const stats = useMemo(() => {
    const errors = mergedEvents.filter((e) => e.level === 'error').length;
    const warnings = mergedEvents.filter((e) => e.level === 'warn').length;
    const infos = mergedEvents.filter((e) => e.level === 'info').length;
    const debugs = mergedEvents.filter((e) => e.level === 'debug').length;
    return { errors, warnings, infos, debugs };
  }, [mergedEvents]);

  return {
    events: mergedEvents,
    summary: mergedSummary,
    stats,
    loading: state.loading,
    error: state.error,
    backendAvailable: state.backendAvailable,
    refresh: fetchBackend,
    clearEvents,
  };
}
