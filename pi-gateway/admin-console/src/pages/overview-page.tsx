import { useEffect, useMemo } from 'react';
import { Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../components/metric-card';
import { StatusPill } from '../components/status-pill';
import { PageHeader } from '../components/atoms/page-header';
import { DataStatus } from '../components/data-status';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchCronStatus, fetchGatewayHealth, fetchMetrics, fetchPool, fetchSessions } from '../lib/api';

function compactTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function OverviewPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Overview', { page: 'overview' });
  }, []);

  const healthQuery = usePageDataSource('overview', ['health'], fetchGatewayHealth);
  const sessionsQuery = usePageDataSource('overview', ['sessions'], fetchSessions);
  const poolQuery = usePageDataSource('overview', ['pool'], fetchPool);
  const cronStatusQuery = usePageDataSource('overview', ['cron-status'], fetchCronStatus);
  const metricsQuery = usePageDataSource('overview', ['metrics'], fetchMetrics);

  const healthy = healthQuery.data?.status === 'ok';
  const status = healthy ? 'healthy' : healthQuery.isError ? 'warning' : 'healthy';
  const metrics = metricsQuery.data;

  const topSessions = useMemo(() => {
    const items = sessionsQuery.data ?? [];
    return [...items]
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
      .slice(0, 8);
  }, [sessionsQuery.data]);

  const trend = useMemo(() => {
    const history = metrics?.history ?? [];
    return history.map((sample) => ({
      time: compactTime(sample.timestamp),
      pool: sample.pool.active,
      queued: sample.queue.totalPending,
      sessions: sample.sessions.activeCount,
      rss: Math.round(sample.system.gatewayRssMb),
    }));
  }, [metrics?.history]);

  return (
    <Stack gap="md">
      <PageHeader
        title="Gateway Overview"
        description="Runtime health, sessions and pool status"
        action={<StatusPill status={status} />}
      />

      <DataStatus
        label="Overview data"
        queries={[healthQuery, sessionsQuery, poolQuery, metricsQuery]}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
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
        <MetricCard
          label="Messages"
          value={String(metrics?.counters.messagesProcessed ?? 0)}
          delta={`errors ${metrics?.counters.errorsTotal ?? 0}`}
        />
        <MetricCard
          label="Latency p95"
          value={`${Math.round(metrics?.latency.p95 ?? 0)}ms`}
          delta={`p50 ${Math.round(metrics?.latency.p50 ?? 0)} / p99 ${Math.round(metrics?.latency.p99 ?? 0)}`}
        />
        <MetricCard
          label="Gateway RSS"
          value={`${Math.round(metrics?.current?.system.gatewayRssMb ?? 0)} MB`}
          delta={`${metrics?.rpcProcesses.length ?? 0} rpc processes sampled`}
        />
        <MetricCard
          label="Queue Pending"
          value={String(metrics?.current?.queue.totalPending ?? 0)}
          delta={`${metrics?.current?.queue.sessions ?? 0} queued sessions`}
        />
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Runtime Trend</Title>
          <Text size="sm" c="dimmed">{trend.length ? '10s samples, 1h retention' : 'waiting for metrics samples'}</Text>
        </Group>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="pool" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#228be6" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#228be6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="queued" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f08c00" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f08c00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={32} />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="pool" name="active pool" stroke="#228be6" fillOpacity={1} fill="url(#pool)" />
              <Area type="monotone" dataKey="queued" name="queued" stroke="#f08c00" fillOpacity={1} fill="url(#queued)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Recent Sessions</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Session Key</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Messages</Table.Th>
              <Table.Th>Streaming</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {topSessions.map((row) => (
              <Table.Tr key={row.sessionKey}>
                <Table.Td><Text ff="monospace" size="xs">{row.sessionKey}</Text></Table.Td>
                <Table.Td>{row.role ?? 'default'}</Table.Td>
                <Table.Td>{row.messageCount ?? 0}</Table.Td>
                <Table.Td>{row.isStreaming ? 'yes' : 'no'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {topSessions.length === 0 ? <Text c="dimmed" size="sm" mt="sm">no sessions yet</Text> : null}
      </Paper>
    </Stack>
  );
}
