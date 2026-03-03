import { useEffect, useMemo } from 'react';
import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../components/metric-card';
import { StatusPill } from '../components/status-pill';
import { PageHeader } from '../components/atoms/page-header';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchCronStatus, fetchGatewayHealth, fetchPool, fetchSessions } from '../lib/api';

const trend = [
  { day: 'Mon', req: 1200 },
  { day: 'Tue', req: 1680 },
  { day: 'Wed', req: 1410 },
  { day: 'Thu', req: 1900 },
  { day: 'Fri', req: 2260 },
  { day: 'Sat', req: 1510 },
  { day: 'Sun', req: 1320 },
];

export function OverviewPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Overview', { page: 'overview' });
  }, []);

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
      .slice(0, 8);
  }, [sessionsQuery.data]);

  return (
    <Stack gap="md">
      <PageHeader
        title="Gateway Overview"
        description="Runtime health, sessions and pool status"
        action={<StatusPill status={status} />}
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
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Traffic Trend (scaffold)</Title>
          <Badge variant="light">demo data</Badge>
        </Group>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#228be6" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#228be6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="req" stroke="#228be6" fillOpacity={1} fill="url(#req)" />
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
