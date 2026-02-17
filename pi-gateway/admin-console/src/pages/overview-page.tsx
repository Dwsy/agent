import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../components/metric-card';
import { StatusPill } from '../components/status-pill';
import { fetchGatewayHealth } from '../lib/api';

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
  const healthQuery = useQuery({
    queryKey: ['gateway-health'],
    queryFn: fetchGatewayHealth,
    retry: 1,
    staleTime: 15_000
  });

  const status = healthQuery.data?.ok ? 'healthy' : healthQuery.isError ? 'warning' : 'healthy';

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gateway Status" value={healthQuery.data?.ok ? 'Online' : 'Checking...'} delta="Realtime health check" />
        <MetricCard label="Active Sessions" value="128" delta="+12% this week" />
        <MetricCard label="Cron Jobs" value="16" delta="2 need attention" />
        <MetricCard label="Error Rate" value="0.21%" delta="-0.08% vs yesterday" />
      </section>

      <section className="rounded-xl border border-slate-800 bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Traffic Trend</h2>
          <StatusPill status={status} />
        </div>
        <div className="h-64">
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
    </div>
  );
}
