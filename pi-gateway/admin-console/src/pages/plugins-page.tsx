import { useEffect, useMemo, useState } from 'react';
import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { PageHeader } from '../components/atoms/page-header';
import { DataStatus } from '../components/data-status';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { useGatewayWs } from '../hooks/use-gateway-ws';
import { fetchChannelCapabilityMatrix, fetchPlugins } from '../lib/api';

type HookItem = string | { pluginId?: string; event?: string };

function formatHook(hook: HookItem) {
  return typeof hook === 'string' ? hook : `${hook.pluginId ?? 'plugin'} -> ${hook.event ?? 'event'}`;
}

function RegistryBlock({
  title,
  items,
  query,
}: {
  title: string;
  items: string[];
  query: string;
}) {
  const filtered = items.filter((item) => item.toLowerCase().includes(query));

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Badge variant="light">{filtered.length}</Badge>
      </Group>
      <Stack gap={6}>
        {filtered.slice(0, 80).map((item) => (
          <Paper key={item} withBorder p="xs">
            <Text ff="monospace" size="xs">{item}</Text>
          </Paper>
        ))}
        {!filtered.length ? <Text c="dimmed" size="sm">empty</Text> : null}
      </Stack>
    </Paper>
  );
}

function capabilityBadges(matrix?: Record<string, Record<string, unknown>>) {
  if (!matrix) return [];
  const entries: Array<{ key: string; value: string }> = [];
  Object.entries(matrix).forEach(([group, values]) => {
    Object.entries(values ?? {}).forEach(([key, value]) => {
      entries.push({ key: `${group}.${key}`, value: String(value) });
    });
  });
  return entries;
}

export function PluginsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Plugins', { page: 'plugins' });
  }, []);

  const { connected } = useGatewayWs();
  const [query, setQuery] = useState('');

  const pluginsQuery = usePageDataSource('plugins', ['plugins'], fetchPlugins);
  const capabilitiesQuery = usePageDataSource('plugins', ['channel-capability-matrix'], fetchChannelCapabilityMatrix);
  const data = pluginsQuery.data;
  const capabilities = capabilitiesQuery.data ?? [];
  const normalizedQuery = query.trim().toLowerCase();

  const hooks = useMemo(() => (data?.hooks ?? []).map((hook) => formatHook(hook as HookItem)), [data?.hooks]);

  return (
    <Stack gap="md">
      <PageHeader
        title="Plugin Registry"
        description="Channels, tools, commands, hooks, services and channel capability matrix"
        action={<Badge color={connected ? 'green' : 'yellow'}>{connected ? 'WS online' : 'WS offline'}</Badge>}
      />

      <DataStatus label="Plugin registry" queries={[pluginsQuery, capabilitiesQuery]} />

      <Paper withBorder p="md">
        <Group gap="xl" justify="space-between">
          <Group gap="xl">
            <Text size="sm">channels: <b>{data?.channels.length ?? 0}</b></Text>
            <Text size="sm">tools: <b>{data?.tools.length ?? 0}</b></Text>
            <Text size="sm">commands: <b>{data?.commands.length ?? 0}</b></Text>
            <Text size="sm">hooks: <b>{data?.hooks.length ?? 0}</b></Text>
            <Text size="sm">services: <b>{data?.services.length ?? 0}</b></Text>
          </Group>
          <TextInput
            placeholder="Filter registry"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            w={260}
          />
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        <RegistryBlock title="Channels" items={data?.channels ?? []} query={normalizedQuery} />
        <RegistryBlock title="Tools" items={data?.tools ?? []} query={normalizedQuery} />
        <RegistryBlock title="Commands" items={data?.commands ?? []} query={normalizedQuery} />
        <RegistryBlock title="Hooks" items={hooks} query={normalizedQuery} />
        <RegistryBlock title="Services" items={data?.services ?? []} query={normalizedQuery} />
      </SimpleGrid>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Channel Capability Matrix</Title>
          <Text size="sm" c="dimmed">{capabilities.length} channels</Text>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Capabilities</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {capabilities.map((channel) => (
              <Table.Tr key={channel.id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text fw={600}>{channel.label}</Text>
                    <Text ff="monospace" size="xs" c="dimmed">{channel.id}</Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    {capabilityBadges(channel.matrix).map((entry) => (
                      <Badge key={`${channel.id}-${entry.key}`} variant="light" color={entry.value === 'false' || entry.value === 'none' ? 'gray' : 'blue'}>
                        {entry.key}: {entry.value}
                      </Badge>
                    ))}
                    {!channel.matrix ? <Text size="sm" c="dimmed">no matrix declared</Text> : null}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
