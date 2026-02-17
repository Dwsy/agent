import { useEffect } from 'react';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchPool, fetchSessions } from '../lib/api';

export function AgentsPage() {
  // 页面挂载埋点
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Agents', { page: 'agents' });
  }, []);

  // 使用 use-data-source 替换直接的 useQuery
  const sessionsQuery = usePageDataSource('agents', ['sessions'], fetchSessions);
  const poolQuery = usePageDataSource('agents', ['pool'], fetchPool);

  const sessions = sessionsQuery.data ?? [];
  const processes = poolQuery.data?.processes ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Session Controller</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2">Session</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Messages</th>
                <th className="pb-2">RPC</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {sessions.map((row) => (
                <tr key={row.sessionKey} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs">{row.sessionKey}</td>
                  <td className="py-2">{row.role ?? 'default'}</td>
                  <td className="py-2">{row.messageCount ?? 0}</td>
                  <td className="py-2">{row.rpcProcessId ?? '-'}</td>
                </tr>
              ))}
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    no active sessions
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">RPC Pool Processes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2">Process ID</th>
                <th className="pb-2">Session Key</th>
                <th className="pb-2">Alive</th>
                <th className="pb-2">Idle</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {processes.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs">{row.id}</td>
                  <td className="py-2 font-mono text-xs">{row.sessionKey}</td>
                  <td className="py-2">{row.isAlive ? 'yes' : 'no'}</td>
                  <td className="py-2">{row.isIdle ? 'yes' : 'no'}</td>
                </tr>
              ))}
              {processes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    no processes
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
