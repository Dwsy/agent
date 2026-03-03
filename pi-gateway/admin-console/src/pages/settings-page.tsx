import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, PasswordInput, Stack, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PageHeader } from '../components/atoms/page-header';
import { PermissionGate } from '../components/permission-gate';
import { useDataMutation, usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchGatewayConfig, reloadGatewayConfig, restartGateway } from '../lib/api';

function ApiTokenConfig() {
  const [token, setToken] = useState(() => localStorage.getItem('gateway_api_token') || '');

  const handleSave = () => {
    localStorage.setItem('gateway_api_token', token);
    notifications.show({ color: 'green', title: 'Saved', message: 'Gateway API token saved' });
  };

  const handleClear = () => {
    localStorage.removeItem('gateway_api_token');
    setToken('');
    notifications.show({ color: 'gray', title: 'Cleared', message: 'Gateway API token removed' });
  };

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">API Authentication</Title>
      <Stack gap="sm">
        <PasswordInput
          label="Gateway API Token"
          placeholder="Enter token"
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
        />
        <Group>
          <Button size="xs" onClick={handleSave} disabled={!token}>Save Token</Button>
          <Button size="xs" variant="light" color="gray" onClick={handleClear} disabled={!token}>Clear</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function SettingsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Settings', { page: 'settings' });
  }, []);

  const configQuery = usePageDataSource('settings', ['gateway-config'], fetchGatewayConfig);

  const reloadMutation = useDataMutation({
    mutationFn: reloadGatewayConfig,
    invalidateKeys: [['gateway-config'], ['health']],
  });

  const restartMutation = useDataMutation({
    mutationFn: restartGateway,
  });

  const configText = useMemo(() => JSON.stringify(configQuery.data ?? {}, null, 2), [configQuery.data]);

  return (
    <Stack gap="md">
      <PageHeader title="Gateway Settings" description="Runtime config and privileged actions" />

      <ApiTokenConfig />

      <Paper withBorder p="md">
        <Group mb="sm">
          <PermissionGate resource="gateway" action="execute">
            <Button size="xs" onClick={() => reloadMutation.mutate()} loading={reloadMutation.isPending}>
              Reload Config
            </Button>
          </PermissionGate>

          <PermissionGate resource="gateway" action="execute">
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => restartMutation.mutate()}
              loading={restartMutation.isPending}
            >
              Restart Gateway
            </Button>
          </PermissionGate>
        </Group>

        <Textarea
          label="Gateway Config"
          value={configText}
          minRows={20}
          maxRows={30}
          autosize
          readOnly
          styles={{ input: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
        />
      </Paper>
    </Stack>
  );
}
