import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/atoms/page-header';
import { useObservabilityMetrics, trackRuntimeEvent } from '../hooks/use-observability';
import { useGatewayObservability, type GatewayObservabilityEvent } from '../hooks/use-gateway-observability';

function levelColor(level: GatewayObservabilityEvent['level']) {
  if (level === 'error') return 'red';
  if (level === 'warn') return 'yellow';
  if (level === 'info') return 'blue';
  return 'gray';
}

export function MetricsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Metrics', { page: 'metrics' });
  }, []);

  const [windowRange, setWindowRange] = useState<'5m' | '15m' | '1h' | '6h' | '24h' | '7d'>('24h');

  const { events, summary, loading, backendAvailable, refresh, clearEvents } = useGatewayObservability({
    pollInterval: 5000,
    limit: 100,
    window: windowRange,
  });
  const { metricCount, clearMetrics } = useObservabilityMetrics();

  const recentErrors = useMemo(() => events.filter((event) => event.level === 'error').slice(0, 8), [events]);

  return (
    <Stack gap="md">
      <PageHeader
        title="Observability"
        description="Gateway event stream and metrics"
        action={<Badge color={backendAvailable ? 'green' : 'yellow'}>{backendAvailable ? 'Backend' : 'Local fallback'}</Badge>}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Paper p="md" withBorder>
          <Text size="xs" c="dimmed">Total Events</Text>
          <Title order={3}>{summary.total}</Title>
        </Paper>
        <Paper p="md" withBorder>
          <Text size="xs" c="dimmed">Errors</Text>
          <Title order={3}>{summary.byLevel.error}</Title>
        </Paper>
        <Paper p="md" withBorder>
          <Text size="xs" c="dimmed">Warnings</Text>
          <Title order={3}>{summary.byLevel.warn}</Title>
        </Paper>
        <Paper p="md" withBorder>
          <Text size="xs" c="dimmed">Frontend Metrics</Text>
          <Title order={3}>{metricCount}</Title>
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Group>
            <Select
              value={windowRange}
              onChange={(value) => setWindowRange((value as typeof windowRange) ?? '24h')}
              data={[
                { value: '5m', label: '5m' },
                { value: '15m', label: '15m' },
                { value: '1h', label: '1h' },
                { value: '6h', label: '6h' },
                { value: '24h', label: '24h' },
                { value: '7d', label: '7d' },
              ]}
              w={100}
            />
            <ActionIcon variant="light" onClick={refresh} loading={loading}>
              <RefreshCw size={14} />
            </ActionIcon>
            <ActionIcon variant="light" color="gray" onClick={clearEvents}>
              <Trash2 size={14} />
            </ActionIcon>
            <ActionIcon variant="light" color="gray" onClick={clearMetrics}>
              <Trash2 size={14} />
            </ActionIcon>
          </Group>
          <Text size="sm" c="dimmed">error rate: {summary.errorRatePct}%</Text>
        </Group>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>Level</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Message</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {events.map((event) => (
              <Table.Tr key={event.id}>
                <Table.Td>{new Date(event.ts).toLocaleTimeString()}</Table.Td>
                <Table.Td><Badge color={levelColor(event.level)} variant="light">{event.level}</Badge></Table.Td>
                <Table.Td>{event.category}</Table.Td>
                <Table.Td>{event.message}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Recent Errors</Title>
        <Stack gap={6}>
          {recentErrors.map((error) => (
            <Paper key={error.id} p="xs" withBorder>
              <Group justify="space-between">
                <Text size="sm">{error.message}</Text>
                <Text size="xs" c="dimmed">{new Date(error.ts).toLocaleTimeString()}</Text>
              </Group>
            </Paper>
          ))}
          {!recentErrors.length ? <Text c="dimmed" size="sm">No recent errors</Text> : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
