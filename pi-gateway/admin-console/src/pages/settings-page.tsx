import { useEffect, useMemo, useState, useCallback } from 'react';
import { Activity, Trash2, BarChart3 } from 'lucide-react';
import { PermissionGate } from '../components/permission-gate';
import { usePageDataSource, useDataMutation } from '../hooks/use-data-source';
import { fetchGatewayConfig, reloadGatewayConfig, restartGateway } from '../lib/api';
import { useObservabilityEvents, useObservabilityMetrics, trackRuntimeEvent } from '../hooks/use-observability';
import { useObservabilityStore } from '../store/observability-store';
import { cn } from '../lib/cn';

/**
 * 观测面板组件
 */
function ObservabilityPanel() {
  const { eventCount, clearEvents } = useObservabilityEvents();
  const { metricCount, clearMetrics } = useObservabilityMetrics();
  const events = useObservabilityStore((state) => state.events);
  
  const errorCount = events.filter((e) => e.level === 'error').length;
  const warningCount = events.filter((e) => e.level === 'warn').length;

  return (
    <div className="rounded-xl border border-slate-800 bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-sky-400" />
        <h2 className="text-sm font-semibold text-slate-200">Observability Panel</h2>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="text-xs">Events</span>
          </div>
          <p className="text-xl font-semibold text-slate-200">{eventCount}</p>
          {errorCount > 0 && (
            <p className="text-xs text-rose-400 mt-1">{errorCount} errors</p>
          )}
          {warningCount > 0 && errorCount === 0 && (
            <p className="text-xs text-amber-400 mt-1">{warningCount} warnings</p>
          )}
        </div>
        
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-xs">Metrics</span>
          </div>
          <p className="text-xl font-semibold text-slate-200">{metricCount}</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={clearEvents}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Events
        </button>
        <button
          onClick={clearMetrics}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
            'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Metrics
        </button>
      </div>
    </div>
  );
}

/**
 * API Token 配置组件
 */
function ApiTokenConfig() {
  const [token, setToken] = useState(() => localStorage.getItem('gateway_api_token') || '');
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    localStorage.setItem('gateway_api_token', token);
    setSaved(true);
    trackRuntimeEvent('info', 'API token saved', { hasToken: !!token });
    setTimeout(() => setSaved(false), 2000);
  }, [token]);

  const handleClear = useCallback(() => {
    localStorage.removeItem('gateway_api_token');
    setToken('');
    setSaved(false);
    trackRuntimeEvent('info', 'API token cleared');
  }, []);

  return (
    <div className="rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">API Authentication</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Gateway API Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your gateway token (e.g., 5213)"
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-600 focus:outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">
            Token is stored in localStorage and attached to all API requests.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!token}
            className="rounded border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saved ? '✓ Saved' : 'Save Token'}
          </button>
          <button
            onClick={handleClear}
            disabled={!token}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  // 页面挂载埋点
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Settings', { page: 'settings' });
  }, []);

  // 使用 use-data-source 替换直接的 useQuery
  const configQuery = usePageDataSource('settings', ['gateway-config'], fetchGatewayConfig);

  // 使用 useDataMutation 替换 useMutation
  const reloadMutation = useDataMutation({
    mutationFn: reloadGatewayConfig,
    invalidateKeys: [['gateway-config'], ['health']],
  });

  const restartMutation = useDataMutation({
    mutationFn: restartGateway,
  });

  const configText = useMemo(() => JSON.stringify(configQuery.data ?? {}, null, 2), [configQuery.data]);

  return (
    <div className="space-y-4">
      {/* API Token 配置 */}
      <ApiTokenConfig />
      
      {/* 观测面板 */}
      <ObservabilityPanel />
      
      <div className="space-y-3 rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="text-sm font-semibold">Gateway Settings</h2>

      <div className="flex gap-2">
        {/* Reload 按钮需要 action:gateway.reload 权限 */}
        <PermissionGate
          resource="gateway"
          action="execute"
          fallback={
            <button
              type="button"
              disabled
              className="rounded border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed"
              title="Permission required: gateway:execute"
            >
              Reload Config
            </button>
          }
        >
          <button
            type="button"
            onClick={() => reloadMutation.mutate()}
            disabled={reloadMutation.isPending}
            className="rounded border border-sky-700 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-900/20 disabled:opacity-50"
          >
            {reloadMutation.isPending ? 'Reloading...' : 'Reload Config'}
          </button>
        </PermissionGate>

        {/* Restart 按钮需要 action:gateway.execute 权限 */}
        <PermissionGate
          resource="gateway"
          action="execute"
          fallback={
            <button
              type="button"
              disabled
              className="rounded border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed"
              title="Permission required: gateway:execute"
            >
              Restart Gateway
            </button>
          }
        >
          <button
            type="button"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="rounded border border-rose-700 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-900/20 disabled:opacity-50"
          >
            {restartMutation.isPending ? 'Restarting...' : 'Restart Gateway'}
          </button>
        </PermissionGate>
      </div>

      <div className="text-xs text-slate-400">
        {reloadMutation.data?.message ? `reload: ${reloadMutation.data.message}` : null}
        {restartMutation.error ? ' restart failed/disabled' : null}
      </div>

      <pre className="max-h-[480px] overflow-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
        {configText}
      </pre>
      </div>
    </div>
  );
}
