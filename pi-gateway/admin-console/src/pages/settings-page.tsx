import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGatewayConfig, reloadGatewayConfig, restartGateway } from '../lib/api';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ['gateway-config'], queryFn: fetchGatewayConfig, refetchInterval: 30000 });

  const reloadMutation = useMutation({
    mutationFn: reloadGatewayConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-config'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    }
  });

  const restartMutation = useMutation({ mutationFn: restartGateway });

  const configText = useMemo(() => JSON.stringify(configQuery.data ?? {}, null, 2), [configQuery.data]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="text-sm font-semibold">Gateway Settings</h2>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reloadMutation.mutate()}
          className="rounded border border-sky-700 px-3 py-1.5 text-xs text-sky-300"
        >
          Reload Config
        </button>
        <button
          type="button"
          onClick={() => restartMutation.mutate()}
          className="rounded border border-rose-700 px-3 py-1.5 text-xs text-rose-300"
        >
          Restart Gateway
        </button>
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
