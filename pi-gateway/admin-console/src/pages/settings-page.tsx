import { useMemo } from 'react';
import { PermissionGate } from '../components/permission-gate';
import { usePageDataSource, useDataMutation } from '../hooks/use-data-source';
import { fetchGatewayConfig, reloadGatewayConfig, restartGateway } from '../lib/api';

export function SettingsPage() {
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
  );
}
