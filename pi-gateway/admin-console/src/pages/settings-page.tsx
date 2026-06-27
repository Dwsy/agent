import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, PasswordInput, Select, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PageHeader } from '../components/atoms/page-header';
import { DataStatus } from '../components/data-status';
import { PermissionGate } from '../components/permission-gate';
import { useDataMutation, usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import {
  fetchConfigBackups,
  fetchGatewayConfig,
  fetchRawGatewayConfig,
  reloadGatewayConfig,
  restartGateway,
  restoreRawGatewayConfig,
  saveRawGatewayConfig,
  validateRawGatewayConfig,
  type ConfigValidationResult,
} from '../lib/api';

function ApiTokenConfig() {
  const [token, setToken] = useState(() => localStorage.getItem('gateway_api_token') || '');

  const notifyTokenUpdated = () => {
    window.dispatchEvent(new Event('gateway-token-updated'));
  };

  const handleSave = () => {
    localStorage.setItem('gateway_api_token', token);
    notifyTokenUpdated();
    notifications.show({ color: 'green', title: 'Saved', message: 'Gateway API token saved' });
  };

  const handleClear = () => {
    localStorage.removeItem('gateway_api_token');
    notifyTokenUpdated();
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

function validationColor(result: ConfigValidationResult | null) {
  if (!result) return 'gray';
  return result.valid ? 'green' : 'red';
}

function formatBackupLabel(filename: string) {
  return filename.replace(/^pi-gateway\.jsonc\./, '').replace(/\.bak$/, '');
}

export function SettingsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Settings', { page: 'settings' });
  }, []);

  const configQuery = usePageDataSource('settings', ['gateway-config'], fetchGatewayConfig);
  const rawConfigQuery = usePageDataSource('settings', ['gateway-config-raw'], fetchRawGatewayConfig);
  const backupsQuery = usePageDataSource('settings', ['gateway-config-backups'], fetchConfigBackups);

  const [rawText, setRawText] = useState('');
  const [rawMtimeMs, setRawMtimeMs] = useState<number | null>(null);
  const [validation, setValidation] = useState<ConfigValidationResult | null>(null);
  const [validatedText, setValidatedText] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadMutation = useDataMutation({
    mutationFn: reloadGatewayConfig,
    invalidateKeys: [['gateway-config'], ['gateway-config-raw']],
  });

  const restartMutation = useDataMutation({
    mutationFn: restartGateway,
  });

  useEffect(() => {
    if (!rawConfigQuery.data) return;
    setRawText(rawConfigQuery.data.text);
    setRawMtimeMs(rawConfigQuery.data.mtimeMs);
    setValidation(null);
    setValidatedText(null);
  }, [rawConfigQuery.data?.path, rawConfigQuery.data?.mtimeMs]);

  const configText = useMemo(() => JSON.stringify(configQuery.data ?? {}, null, 2), [configQuery.data]);
  const hasUnsavedChanges = rawConfigQuery.data ? rawText !== rawConfigQuery.data.text : false;
  const validationStale = validation !== null && validatedText !== rawText;
  const canSaveRawConfig = Boolean(validation?.valid && !validationStale && rawText.trim());

  const backupOptions = useMemo(() => {
    return (backupsQuery.data ?? []).map((backup) => ({
      value: backup.filename,
      label: `${formatBackupLabel(backup.filename)} · ${Math.round(backup.size / 1024)} KB`,
    }));
  }, [backupsQuery.data]);

  const refreshConfig = async () => {
    await Promise.all([configQuery.refetch(), rawConfigQuery.refetch(), backupsQuery.refetch()]);
  };

  const handleValidate = async () => {
    setBusy(true);
    try {
      const result = await validateRawGatewayConfig(rawText);
      setValidation(result.validation);
      setValidatedText(rawText);
      notifications.show({
        color: result.validation.valid ? 'green' : 'red',
        title: result.validation.valid ? 'Config valid' : 'Config invalid',
        message: `${result.validation.stats.error} errors, ${result.validation.stats.warning} warnings`,
      });
    } catch (error) {
      notifications.show({ color: 'red', title: 'Validation failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!canSaveRawConfig) {
      notifications.show({ color: 'yellow', title: 'Validate first', message: 'Run validation on the current editor content before saving.' });
      return;
    }
    if (!window.confirm('Save raw JSONC config and reload gateway?')) return;
    setBusy(true);
    try {
      const result = await saveRawGatewayConfig({ text: rawText, expectedMtimeMs: rawMtimeMs });
      setValidation(result.validation);
      setValidatedText(rawText);
      setRawMtimeMs(result.mtimeMs);
      notifications.show({ color: 'green', title: 'Config saved', message: result.backupPath ? `Backup: ${result.backupPath}` : 'Saved without existing backup' });
      await refreshConfig();
    } catch (error) {
      notifications.show({ color: 'red', title: 'Save failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('Restore selected backup and reload gateway?')) return;
    setBusy(true);
    try {
      const result = await restoreRawGatewayConfig(selectedBackup ?? undefined);
      setValidation(result.validation);
      setValidatedText(null);
      setRawMtimeMs(result.mtimeMs);
      notifications.show({ color: 'green', title: 'Config restored', message: result.restoredFrom });
      await refreshConfig();
    } catch (error) {
      notifications.show({ color: 'red', title: 'Restore failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <PageHeader title="Gateway Settings" description="Runtime config, raw JSONC editor and privileged actions" />

      <DataStatus label="Settings data" queries={[configQuery, rawConfigQuery, backupsQuery]} />

      <ApiTokenConfig />

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Group>
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
          <Text size="sm" c="dimmed">{rawConfigQuery.data?.path ?? 'config path unavailable'}</Text>
        </Group>

        <Textarea
          label="Redacted Runtime Config"
          value={configText}
          minRows={12}
          maxRows={18}
          autosize
          readOnly
          styles={{ input: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
        />
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Group>
            <Title order={4}>Raw JSONC Config</Title>
            <Badge color={validationStale ? 'yellow' : validationColor(validation)}>
              {validation ? (validationStale ? 'stale validation' : validation.valid ? 'valid' : 'invalid') : 'not validated'}
            </Badge>
            {hasUnsavedChanges ? <Badge color="yellow" variant="light">unsaved</Badge> : null}
          </Group>
          <Group>
            <Button size="xs" variant="light" onClick={handleValidate} loading={busy}>Validate</Button>
            <PermissionGate resource="gateway" action="execute">
              <Button size="xs" onClick={handleSave} loading={busy} disabled={!canSaveRawConfig}>Save + Reload</Button>
            </PermissionGate>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Save is enabled only after the current editor content validates successfully.
        </Text>

        <Textarea
          value={rawText}
          onChange={(event) => setRawText(event.currentTarget.value)}
          minRows={22}
          maxRows={36}
          autosize
          spellCheck={false}
          styles={{ input: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } }}
        />

        {validation ? (
          <Table mt="md" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Severity</Table.Th>
                <Table.Th>Path</Table.Th>
                <Table.Th>Message</Table.Th>
                <Table.Th>Suggestion</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {validation.issues.map((issue, index) => (
                <Table.Tr key={`${issue.path}-${index}`}>
                  <Table.Td><Badge color={issue.severity === 'error' ? 'red' : issue.severity === 'warning' ? 'yellow' : 'blue'}>{issue.severity}</Badge></Table.Td>
                  <Table.Td><Text ff="monospace" size="xs">{issue.path}</Text></Table.Td>
                  <Table.Td>{issue.message}</Table.Td>
                  <Table.Td>{issue.suggestion ?? '-'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Backups</Title>
          <Text size="sm" c="dimmed">{backupsQuery.data?.length ?? 0} backups</Text>
        </Group>
        <Group align="flex-end">
          <Select
            label="Backup"
            placeholder="Latest backup"
            data={backupOptions}
            value={selectedBackup}
            onChange={setSelectedBackup}
            clearable
            w={360}
          />
          <PermissionGate resource="gateway" action="execute">
            <Button size="xs" variant="light" color="yellow" onClick={handleRestore} loading={busy} disabled={!backupOptions.length}>
              Restore Backup
            </Button>
          </PermissionGate>
        </Group>
      </Paper>
    </Stack>
  );
}
