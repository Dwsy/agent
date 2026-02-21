import { useEffect, useMemo } from 'react';
import { Activity, Trash2, BarChart3, Route, FolderKanban, Users } from 'lucide-react';
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

function RouteMappingPanel({ config }: { config: Record<string, unknown> }) {
  const agents = (((config.agents as any)?.list ?? []) as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id ?? ''),
    role: String(a.role ?? ''),
    workspace: String(a.workspace ?? ''),
  }));

  const bindings = (((config.agents as any)?.bindings ?? []) as Array<Record<string, unknown>>).map((b) => {
    const match = (b.match ?? {}) as Record<string, any>;
    const peer = match.peer ? `${match.peer.kind ?? 'peer'}:${match.peer.id ?? '*'}` : '-';
    const parentPeer = match.parentPeer ? `${match.parentPeer.kind ?? 'parent'}:${match.parentPeer.id ?? '*'}` : '-';
    const roles = Array.isArray(match.roles) ? match.roles.join(',') : '-';
    return {
      agentId: String(b.agentId ?? ''),
      channel: String(match.channel ?? '*'),
      accountId: String(match.accountId ?? '*'),
      guildId: String(match.guildId ?? '-'),
      roles,
      peer,
      parentPeer,
    };
  });

  const workspaceEntries = Object.entries(((config.roles as any)?.workspaceDirs ?? {}) as Record<string, string>);

  return (
    <div className="rounded-xl border border-slate-800 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-slate-200">Role / Workspace / Channel / Agent Mapping</h2>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 lg:col-span-1">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            <Users className="h-3.5 w-3.5 text-sky-400" /> Agents
          </div>
          <div className="space-y-2 text-xs">
            {agents.length === 0 ? (
              <p className="text-slate-500">No agents configured (single-agent mode).</p>
            ) : (
              agents.map((a) => (
                <div key={a.id} className="rounded border border-slate-700 bg-slate-900 p-2">
                  <p className="font-mono text-slate-100">{a.id}</p>
                  <p className="text-slate-400">role: {a.role || '-'}</p>
                  <p className="text-slate-400 break-all">workspace: {a.workspace || '-'}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 lg:col-span-1">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            <FolderKanban className="h-3.5 w-3.5 text-emerald-400" /> Role Workspaces
          </div>
          <div className="space-y-2 text-xs">
            {workspaceEntries.length === 0 ? (
              <p className="text-slate-500">No explicit roles.workspaceDirs mapping.</p>
            ) : (
              workspaceEntries.map(([role, workspace]) => (
                <div key={role} className="rounded border border-slate-700 bg-slate-900 p-2">
                  <p className="font-mono text-slate-100">{role}</p>
                  <p className="text-slate-400 break-all">{workspace}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 lg:col-span-1">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            <Route className="h-3.5 w-3.5 text-amber-400" /> Agent Bindings
          </div>
          <div className="max-h-64 overflow-auto space-y-2 text-xs">
            {bindings.length === 0 ? (
              <p className="text-slate-500">No agents.bindings configured.</p>
            ) : (
              bindings.map((b, idx) => (
                <div key={`${b.agentId}-${idx}`} className="rounded border border-slate-700 bg-slate-900 p-2">
                  <p className="font-mono text-slate-100">agent: {b.agentId}</p>
                  <p className="text-slate-400">channel={b.channel} account={b.accountId}</p>
                  <p className="text-slate-400">guild={b.guildId} roles={b.roles}</p>
                  <p className="text-slate-400">peer={b.peer} parentPeer={b.parentPeer}</p>
                </div>
              ))
            )}
          </div>
        </section>
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
      {/* 观测面板 */}
      <ObservabilityPanel />
      <RouteMappingPanel config={(configQuery.data ?? {}) as Record<string, unknown>} />
      
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
