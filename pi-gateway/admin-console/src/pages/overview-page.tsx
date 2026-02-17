import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../components/metric-card';
import { StatusPill } from '../components/status-pill';
import { usePageDataSource } from '../hooks/use-data-source';
import { fetchCronStatus, fetchGatewayHealth, fetchPool, fetchSessions } from '../lib/api';

const trend = [
  { day: 'Mon', req: 1200 },
  { day: 'Tue', req: 1680 },
  { day: 'Wed', req: 1410 },
  { day: 'Thu', req: 1900 },
  { day: 'Fri', req: 2260 },
  { day: 'Sat', req: 1510 },
  { day: 'Sun', req: 1320 }
];

export function OverviewPage() {
  // 使用 use-data-source 替换直接的 useQuery
  const healthQuery = usePageDataSource('overview', ['health'], fetchGatewayHealth);
  const sessionsQuery = usePageDataSource('overview', ['sessions'], fetchSessions);
  const poolQuery = usePageDataSource('overview', ['pool'], fetchPool);
  const cronStatusQuery = usePageDataSource('overview', ['cron-status'], fetchCronStatus);

  const healthy = healthQuery.data?.status === 'ok';
  const status = healthy ? 'healthy' : healthQuery.isError ? 'warning' : 'healthy';

  const topSessions = useMemo(() => {
    const items = sessionsQuery.data ?? [];
    return [...items]
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
      .slice(0, 5);
  }, [sessionsQuery.data]);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gateway Status" value={healthy ? 'Online' : 'Degraded'} delta={`${Math.round(healthQuery.data?.uptime ?? 0)}s uptime`} />
        <MetricCard label="Active Sessions" value={String(healthQuery.data?.sessions ?? 0)} delta={`${sessionsQuery.data?.length ?? 0} loaded`} />
        <MetricCard
          label="RPC Processes"
          value={String(poolQuery.data?.stats.totalProcesses ?? poolQuery.data?.processes.length ?? 0)}
          delta={`running ${poolQuery.data?.stats.running ?? 0} / idle ${poolQuery.data?.stats.idle ?? 0}`}
        />
        <MetricCard
          label="Cron Jobs"
          value={cronStatusQuery.data ? String(cronStatusQuery.data.total) : '--'}
          delta={cronStatusQuery.data ? `active ${cronStatusQuery.data.active}, paused ${cronStatusQuery.data.paused}` : 'cron disabled or unavailable'}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Traffic Trend (scaffold)</h2>
          <StatusPill status={status} />
        </div>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="day" stroke="#94A3B8" />
              <YAxis stroke="#94A3B8" />
              <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155' }} />
              <Area type="monotone" dataKey="req" stroke="#38BDF8" fillOpacity={1} fill="url(#req)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Recent Sessions</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2">Session Key</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Messages</th>
                <th className="pb-2">Streaming</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {topSessions.map((row) => (
                <tr key={row.sessionKey} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs text-slate-300">{row.sessionKey}</td>
                  <td className="py-2">{row.role ?? 'default'}</td>
                  <td className="py-2">{row.messageCount ?? 0}</td>
                  <td className="py-2">{row.isStreaming ? 'yes' : 'no'}</td>
                </tr>
              ))}
              {topSessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    no sessions yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
