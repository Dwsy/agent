import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PageHeader } from '../components/atoms/page-header';
import { DataStatus } from '../components/data-status';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { useGatewayWs } from '../hooks/use-gateway-ws';
import {
  fetchModels,
  fetchPool,
  fetchSessionMessages,
  fetchSessions,
  fetchSessionStatus,
  resetSession,
  updateSessionModel,
  updateSessionThinking,
  type ModelItem,
  type SessionItem,
  type SessionMessagesResponse,
  type SessionStatusResponse,
} from '../lib/api';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((level) => ({ value: level, label: level }));

function formatModel(model: ModelItem) {
  const id = model.model ?? model.id ?? '';
  return model.provider && id ? `${model.provider}/${id}` : id;
}

function sessionTitle(sessionKey: string) {
  const parts = sessionKey.split(':');
  if (parts.length >= 5) return `${parts[1]} · ${parts[2]} · ${parts.slice(4).join(':')}`;
  return sessionKey;
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AgentsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Agents', { page: 'agents' });
  }, []);

  const { connected, request } = useGatewayWs();
  const sessionsQuery = usePageDataSource('agents', ['sessions'], fetchSessions);
  const poolQuery = usePageDataSource('agents', ['pool'], fetchPool);

  const [selected, setSelected] = useState<SessionItem | null>(null);
  const [status, setStatus] = useState<SessionStatusResponse | null>(null);
  const [messages, setMessages] = useState<SessionMessagesResponse | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const sessions = sessionsQuery.data ?? [];
  const processes = poolQuery.data?.processes ?? [];

  const modelOptions = useMemo(() => {
    return models
      .map((model) => {
        const value = formatModel(model);
        if (!value) return null;
        return { value, label: model.name ? `${model.name} · ${value}` : value };
      })
      .filter((item): item is { value: string; label: string } => Boolean(item));
  }, [models]);

  const refreshDetail = useCallback(async (sessionKey: string) => {
    setLoadingDetail(true);
    try {
      const [nextStatus, nextMessages, nextModels] = await Promise.all([
        fetchSessionStatus(sessionKey).catch(() => null),
        fetchSessionMessages(sessionKey).catch(() => null),
        fetchModels(sessionKey).catch(() => []),
      ]);
      setStatus(nextStatus);
      setMessages(nextMessages);
      setModels(nextModels);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    request<{ roles: string[] }>('session.listRoles')
      .then((payload) => setRoles(payload.roles ?? []))
      .catch(() => setRoles([]));
  }, [connected, request]);

  const openSession = (session: SessionItem) => {
    setSelected(session);
    void refreshDetail(session.sessionKey);
  };

  const mutateSession = async (action: () => Promise<unknown>, success: string) => {
    if (!selected) return;
    try {
      await action();
      notifications.show({ color: 'green', title: 'Done', message: success });
      await Promise.all([refreshDetail(selected.sessionKey), sessionsQuery.refetch(), poolQuery.refetch()]);
    } catch (error) {
      notifications.show({ color: 'red', title: 'Action failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Stack gap="md">
      <PageHeader title="Agent Sessions" description="Session controller and RPC process pool" />

      <DataStatus label="Agent data" queries={[sessionsQuery, poolQuery]} />

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Session Controller</Title>
          <Text size="sm" c="dimmed">{sessions.length} sessions</Text>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Session</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Messages</Table.Th>
              <Table.Th>Streaming</Table.Th>
              <Table.Th>RPC</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.map((row) => (
              <Table.Tr key={row.sessionKey} onClick={() => openSession(row)} style={{ cursor: 'pointer' }}>
                <Table.Td>
                  <Text ff="monospace" size="xs">{sessionTitle(row.sessionKey)}</Text>
                </Table.Td>
                <Table.Td>{row.role ?? 'default'}</Table.Td>
                <Table.Td>{row.messageCount ?? 0}</Table.Td>
                <Table.Td>
                  <Badge color={row.isStreaming ? 'blue' : 'gray'} variant="light">{row.isStreaming ? 'yes' : 'no'}</Badge>
                </Table.Td>
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

      <Drawer
        opened={Boolean(selected)}
        onClose={() => setSelected(null)}
        position="right"
        size="xl"
        title={selected ? sessionTitle(selected.sessionKey) : 'Session'}
      >
        {selected ? (
          <Stack gap="md">
            <Code block>{selected.sessionKey}</Code>
            <Group>
              <Badge color={selected.isStreaming ? 'blue' : 'gray'}>{selected.isStreaming ? 'streaming' : 'idle'}</Badge>
              <Badge variant="light">messages {status?.messageCount ?? selected.messageCount ?? 0}</Badge>
              {loadingDetail ? <Badge color="yellow">loading</Badge> : null}
            </Group>

            <Paper withBorder p="md">
              <Title order={5} mb="sm">Runtime Controls</Title>
              <Stack gap="sm">
                <Select
                  label="Model"
                  searchable
                  data={modelOptions}
                  value={status?.resolvedModel ?? null}
                  placeholder={modelOptions.length ? 'Select model' : 'No active RPC models'}
                  onChange={(value) => value && mutateSession(() => updateSessionModel(selected.sessionKey, value), `Model switched to ${value}`)}
                />
                <Select
                  label="Thinking Level"
                  data={THINKING_LEVELS}
                  value={status?.resolvedThinkingLevel ?? null}
                  placeholder="Select thinking level"
                  onChange={(value) => value && mutateSession(() => updateSessionThinking(selected.sessionKey, value), `Thinking level switched to ${value}`)}
                />
                <Select
                  label="Role"
                  data={roles.map((role) => ({ value: role, label: role }))}
                  value={selected.role ?? null}
                  placeholder={connected ? 'Select role' : 'WebSocket offline'}
                  disabled={!connected || !roles.length}
                  onChange={(role) => role && mutateSession(() => request('session.setRole', { sessionKey: selected.sessionKey, role }), `Role switched to ${role}`)}
                />
                <Group>
                  <Button size="xs" variant="light" onClick={() => mutateSession(() => resetSession(selected.sessionKey), 'Session reset')}>
                    Reset
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={!connected}
                    onClick={() => mutateSession(() => request('sessions.compact', { sessionKey: selected.sessionKey }), 'Session compacted')}
                  >
                    Compact
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => refreshDetail(selected.sessionKey)}>
                    Refresh
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <Paper withBorder p="md">
              <Title order={5} mb="sm">Status</Title>
              <Code block>{compactJson(status ?? selected)}</Code>
            </Paper>

            <Paper withBorder p="md">
              <Group justify="space-between" mb="sm">
                <Title order={5}>Messages</Title>
                <Text size="sm" c="dimmed">{messages?.messages.length ?? 0}</Text>
              </Group>
              <ScrollArea h={300}>
                <Stack gap="xs">
                  {(messages?.messages ?? []).map((message, index) => (
                    <Paper key={`${message.role}-${index}`} withBorder p="xs">
                      <Text size="xs" c="dimmed" mb={4}>{message.role ?? 'message'}</Text>
                      <Code block>{typeof message.content === 'string' ? message.content : compactJson(message.content ?? message)}</Code>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            </Paper>
            <Divider />
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  );
}
