import { useEffect, useMemo, useState } from 'react';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Trash2, 
  XCircle,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  Server,
  Monitor
} from 'lucide-react';
import { 
  useObservabilityEvents, 
  useObservabilityMetrics,
  trackRuntimeEvent
} from '../hooks/use-observability';
import { useGatewayObservability, type GatewayObservabilityEvent } from '../hooks/use-gateway-observability';
import { cn } from '../lib/cn';

/**
 * 事件级别图标
 */
function LevelIcon({ level }: { level: GatewayObservabilityEvent['level'] }) {
  const iconClass = 'h-4 w-4';
  switch (level) {
    case 'debug':
      return <Activity className={cn(iconClass, 'text-slate-400')} />;
    case 'info':
      return <CheckCircle className={cn(iconClass, 'text-sky-400')} />;
    case 'warn':
      return <AlertTriangle className={cn(iconClass, 'text-amber-400')} />;
    case 'error':
      return <XCircle className={cn(iconClass, 'text-rose-400')} />;
    default:
      return <Activity className={cn(iconClass, 'text-slate-400')} />;
  }
}

/**
 * 格式化时间戳
 */
function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * 事件列表项组件
 */
function EventItem({ event }: { event: GatewayObservabilityEvent }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div 
      className={cn(
        'border-b border-slate-800 py-2 px-3 hover:bg-slate-800/30 transition-colors cursor-pointer',
        expanded && 'bg-slate-800/20'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <LevelIcon level={event.level} />
        <span className="text-xs text-slate-500 w-14 shrink-0">
          {event.category}
        </span>
        <span className="text-xs text-slate-400 w-16 shrink-0">
          {formatTime(event.ts)}
        </span>
        <span className={cn(
          'text-sm flex-1 truncate',
          event.level === 'error' && 'text-rose-300',
          event.level === 'warn' && 'text-amber-300',
          event.level === 'info' && 'text-sky-300',
          event.level === 'debug' && 'text-slate-400'
        )}>
          {event.message}
        </span>
      </div>
      {expanded && event.meta && (
        <div className="mt-2 ml-10 text-xs text-slate-500">
          <pre className="bg-slate-900/50 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(event.meta, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  colorClass,
  subtitle 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  colorClass: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <p className="text-2xl font-semibold text-slate-200 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
        </div>
        <div className={cn('p-2 rounded-lg bg-slate-800/50', colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/**
 * 级别过滤标签
 */
function LevelFilter({ 
  level, 
  count, 
  active, 
  onClick 
}: { 
  level: GatewayObservabilityEvent['level'] | 'all'; 
  count: number; 
  active: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    all: 'bg-slate-700 text-slate-300',
    debug: 'bg-slate-700 text-slate-400',
    info: 'bg-sky-900/30 text-sky-400',
    warn: 'bg-amber-900/30 text-amber-400',
    error: 'bg-rose-900/30 text-rose-400',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-all',
        active ? colors[level] : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
      )}
    >
      {level === 'all' ? 'All' : level} ({count})
    </button>
  );
}

/**
 * 指标页面组件
 */
export function MetricsPage() {
  // 页面挂载埋点
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Metrics', { page: 'metrics' });
  }, []);

  // 网关观测性数据（优先后端）
  const { 
    events, 
    summary, 
    stats, 
    loading, 
    error, 
    backendAvailable, 
    refresh, 
    clearEvents 
  } = useGatewayObservability({ pollInterval: 5000, limit: 100 });

  // 前端本地指标（保留原有功能）
  const { metrics, metricCount, clearMetrics } = useObservabilityMetrics();
  
  const [levelFilter, setLevelFilter] = useState<GatewayObservabilityEvent['level'] | 'all'>('all');

  // 过滤后的事件
  const filteredEvents = useMemo(() => {
    if (levelFilter === 'all') return events;
    return events.filter((e) => e.level === levelFilter);
  }, [events, levelFilter]);

  // 按类别分组的指标
  const metricsByName = useMemo(() => {
    const grouped: Record<string, { name: string; value: number; ts: number }[]> = {};
    metrics.forEach((m) => {
      if (!grouped[m.name]) grouped[m.name] = [];
      grouped[m.name].push({ name: m.name, value: m.value, ts: m.ts });
    });
    return grouped;
  }, [metrics]);

  // 最近错误
  const recentErrors = useMemo(() => {
    return events.filter((e) => e.level === 'error').slice(0, 5);
  }, [events]);

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-sky-400" />
          <h1 className="text-lg font-semibold text-slate-200">Observability Metrics</h1>
          <div className="flex items-center gap-1.5 ml-3">
            {backendAvailable ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded">
                <Server className="h-3 w-3" />
                Backend
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/20 px-2 py-0.5 rounded" title={error || 'Backend unavailable'}>
                <Monitor className="h-3 w-3" />
                Local
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={clearEvents}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Events
          </button>
          <button
            onClick={clearMetrics}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Metrics
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total Events"
          value={summary.total}
          icon={Activity}
          colorClass="text-sky-400"
          subtitle={`${stats.errors} errors`}
        />
        <StatCard
          title="Errors"
          value={stats.errors}
          icon={XCircle}
          colorClass="text-rose-400"
          subtitle="Last 24h"
        />
        <StatCard
          title="Warnings"
          value={stats.warnings}
          icon={AlertTriangle}
          colorClass="text-amber-400"
        />
        <StatCard
          title="Metrics"
          value={metricCount}
          icon={Clock}
          colorClass="text-emerald-400"
          subtitle={`${Object.keys(metricsByName).length} types`}
        />
      </div>

      {/* 两列布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 事件列表 */}
        <div className="rounded-xl border border-slate-800 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-300">Recent Events</h2>
            <div className="flex items-center gap-1">
              {(['all', 'error', 'warn', 'info', 'debug'] as const).map((level) => (
                <LevelFilter
                  key={level}
                  level={level}
                  count={level === 'all' ? summary.total : summary.byLevel[level] ?? 0}
                  active={levelFilter === level}
                  onClick={() => setLevelFilter(level)}
                />
              ))}
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-slate-500 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-slate-500 text-sm">
                No events recorded
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventItem key={event.id} event={event} />
              ))
            )}
          </div>
        </div>

        {/* 右侧列 */}
        <div className="space-y-4">
          {/* 最近错误 */}
          <div className="rounded-xl border border-slate-800 bg-card p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              Recent Errors
            </h2>
            {recentErrors.length === 0 ? (
              <p className="text-slate-500 text-sm">No errors recorded</p>
            ) : (
              <div className="space-y-2">
                {recentErrors.map((err) => (
                  <div 
                    key={err.id} 
                    className="flex items-center gap-2 text-sm p-2 rounded bg-rose-900/10 border border-rose-900/20"
                  >
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(err.ts)}
                    </span>
                    <span className="text-rose-300 truncate flex-1">{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分类统计 */}
          <div className="rounded-xl border border-slate-800 bg-card p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              Events by Category
            </h2>
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {Object.entries(summary.byCategory).map(([category, count]) => (
                <div 
                  key={category} 
                  className="flex items-center justify-between text-sm p-2 rounded bg-slate-800/30"
                >
                  <span className="text-slate-400">{category}</span>
                  <span className="text-emerald-400 text-xs font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(summary.byCategory).length === 0 && (
                <p className="text-slate-500 text-sm">No categories recorded</p>
              )}
            </div>
          </div>

          {/* 指标概览 */}
          <div className="rounded-xl border border-slate-800 bg-card p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-400" />
              Metric Types ({Object.keys(metricsByName).length})
            </h2>
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {Object.entries(metricsByName).map(([name, items]) => (
                <div 
                  key={name} 
                  className="flex items-center justify-between text-sm p-2 rounded bg-slate-800/30"
                >
                  <span className="text-slate-400">{name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs">{items.length} samples</span>
                    <span className="text-emerald-400 text-xs">
                      latest: {Math.round(items[0]?.value ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
              {Object.keys(metricsByName).length === 0 && (
                <p className="text-slate-500 text-sm">No metrics recorded</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
