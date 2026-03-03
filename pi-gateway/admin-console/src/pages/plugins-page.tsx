import { useEffect } from 'react';
import { Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from '../components/atoms/page-header';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchPlugins } from '../lib/api';

type HookItem = string | { pluginId?: string; event?: string };

function Block({
  title,
  items,
  formatItem,
}: {
  title: string;
  items: readonly (string | HookItem)[];
  formatItem?: (item: HookItem, index: number) => string;
}) {
  return (
    <Paper withBorder p="md">
      <Title order={4}>{title}</Title>
      <Stack gap={6} mt="sm">
        {items.slice(0, 20).map((item, index) => {
          const display = formatItem ? formatItem(item as HookItem, index) : String(item);
          return (
            <Paper key={`${String(item)}-${index}`} withBorder p="xs">
              <Text ff="monospace" size="xs">{display}</Text>
            </Paper>
          );
        })}
        {items.length === 0 ? <Text c="dimmed" size="sm">empty</Text> : null}
      </Stack>
    </Paper>
  );
}

export function PluginsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Plugins', { page: 'plugins' });
  }, []);

  const pluginsQuery = usePageDataSource('plugins', ['plugins'], fetchPlugins);
  const data = pluginsQuery.data;

  return (
    <Stack gap="md">
      <PageHeader title="Plugin Registry" description="Channels, tools, commands, hooks and services" />

      <Paper withBorder p="md">
        <Group gap="xl">
          <Text size="sm">channels: {data?.channels.length ?? 0}</Text>
          <Text size="sm">tools: {data?.tools.length ?? 0}</Text>
          <Text size="sm">commands: {data?.commands.length ?? 0}</Text>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        <Block title="Channels" items={data?.channels ?? []} />
        <Block title="Tools" items={data?.tools ?? []} />
        <Block title="Commands" items={data?.commands ?? []} />
        <Block
          title="Hooks"
          items={data?.hooks ?? []}
          formatItem={(hook) => (typeof hook === 'string' ? hook : `${hook.pluginId} → ${hook.event}`)}
        />
        <Block title="Services" items={data?.services ?? []} />
      </SimpleGrid>
    </Stack>
  );
}
