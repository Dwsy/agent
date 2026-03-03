import { useEffect } from 'react';
import { Paper, Stack, Table, Text, Title } from '@mantine/core';
import { PageHeader } from '../components/atoms/page-header';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchPool, fetchSessions } from '../lib/api';

export function AgentsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Agents', { page: 'agents' });
  }, []);

  const sessionsQuery = usePageDataSource('agents', ['sessions'], fetchSessions);
  const poolQuery = usePageDataSource('agents', ['pool'], fetchPool);

  const sessions = sessionsQuery.data ?? [];
  const processes = poolQuery.data?.processes ?? [];

  return (
    <Stack gap="md">
      <PageHeader title="Agent Sessions" description="Session controller and RPC process pool" />

      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Session Controller</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Session</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Messages</Table.Th>
              <Table.Th>RPC</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.map((row) => (
              <Table.Tr key={row.sessionKey}>
                <Table.Td><Text ff="monospace" size="xs">{row.sessionKey}</Text></Table.Td>
                <Table.Td>{row.role ?? 'default'}</Table.Td>
                <Table.Td>{row.messageCount ?? 0}</Table.Td>
                <Table.Td>{row.rpcProcessId ?? '-'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {sessions.length === 0 ? <Text c="dimmed" size="sm" mt="sm">no active sessions</Text> : null}
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4} mb="sm">RPC Pool Processes</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Process ID</Table.Th>
              <Table.Th>Session Key</Table.Th>
              <Table.Th>Alive</Table.Th>
              <Table.Th>Idle</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {processes.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td><Text ff="monospace" size="xs">{row.id}</Text></Table.Td>
                <Table.Td><Text ff="monospace" size="xs">{row.sessionKey}</Text></Table.Td>
                <Table.Td>{row.isAlive ? 'yes' : 'no'}</Table.Td>
                <Table.Td>{row.isIdle ? 'yes' : 'no'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {processes.length === 0 ? <Text c="dimmed" size="sm" mt="sm">no processes</Text> : null}
      </Paper>
    </Stack>
  );
}
