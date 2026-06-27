import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Pause, Pencil, Play, Plus, RotateCw, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/atoms/page-header';
import { DataStatus } from '../components/data-status';
import { PermissionGate } from '../components/permission-gate';
import { usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import {
  addCronJob,
  deleteCronJob,
  fetchCronJobs,
  fetchCronRuns,
  pauseCronJob,
  resumeCronJob,
  runCronJob,
  updateCronJob,
  type CronJob,
  type CronRun,
} from '../lib/api';

type CronForm = {
  id: string;
  kind: string;
  expr: string;
  timezone: string;
  task: string;
  delivery: string;
  deleteAfterRun: boolean;
  timeoutMs: string;
};

const EMPTY_FORM: CronForm = {
  id: '',
  kind: 'every',
  expr: '30m',
  timezone: '',
  task: '',
  delivery: '',
  deleteAfterRun: false,
  timeoutMs: '',
};

function jobTask(job: CronJob) {
  return job.payload?.text ?? '';
}

function buildPayload(form: CronForm) {
  return {
    schedule: {
      kind: form.kind,
      expr: form.expr,
      ...(form.timezone.trim() ? { timezone: form.timezone.trim() } : {}),
    },
    task: form.task,
    ...(form.delivery ? { delivery: form.delivery } : {}),
    deleteAfterRun: form.deleteAfterRun,
    ...(form.timeoutMs.trim() ? { timeoutMs: Number(form.timeoutMs) } : {}),
  };
}

function formatTime(ts?: number) {
  return ts ? new Date(ts).toLocaleString() : '-';
}

export function AlertsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Alerts', { page: 'alerts' });
  }, []);

  const cronQuery = usePageDataSource('alerts', ['cron-jobs'], fetchCronJobs);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CronJob | null>(null);
  const [form, setForm] = useState<CronForm>(EMPTY_FORM);
  const [runsFor, setRunsFor] = useState<string>('');
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [saving, setSaving] = useState(false);

  const jobs = cronQuery.data ?? [];
  const failed = jobs.filter((job) => job.lastRun?.status === 'error' || job.lastRun?.status === 'timeout');

  const runTitle = useMemo(() => (runsFor ? `Run History: ${runsFor}` : 'Run History'), [runsFor]);

  const refreshJobs = async () => {
    await cronQuery.refetch();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (job: CronJob) => {
    setEditing(job);
    setForm({
      id: job.id,
      kind: job.schedule?.kind ?? 'every',
      expr: job.schedule?.expr ?? '',
      timezone: job.schedule?.timezone ?? '',
      task: jobTask(job),
      delivery: job.delivery ?? '',
      deleteAfterRun: Boolean(job.deleteAfterRun),
      timeoutMs: job.timeoutMs ? String(job.timeoutMs) : '',
    });
    setModalOpen(true);
  };

  const showError = (title: string, error: unknown) => {
    notifications.show({ color: 'red', title, message: error instanceof Error ? error.message : String(error) });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (editing) {
        await updateCronJob(editing.id, payload);
        notifications.show({ color: 'green', title: 'Cron updated', message: editing.id });
      } else {
        await addCronJob({ id: form.id, ...payload });
        notifications.show({ color: 'green', title: 'Cron added', message: form.id });
      }
      setModalOpen(false);
      await refreshJobs();
    } catch (error) {
      showError('Save failed', error);
    } finally {
      setSaving(false);
    }
  };

  const loadRuns = async (id: string) => {
    try {
      setRunsFor(id);
      setRuns(await fetchCronRuns(id));
    } catch (error) {
      showError('Load runs failed', error);
    }
  };

  const doAction = async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      notifications.show({ color: 'green', title: 'Done', message: success });
      await refreshJobs();
      if (runsFor) await loadRuns(runsFor);
    } catch (error) {
      showError('Action failed', error);
    }
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Alerts & Cron"
        description="Cron runtime alerts, schedule management and run history"
        action={
          <PermissionGate resource="cron" action="execute">
            <Button size="xs" leftSection={<Plus size={14} />} onClick={openCreate}>New Job</Button>
          </PermissionGate>
        }
      />

      <DataStatus label="Cron data" queries={[cronQuery]} />

      <Paper withBorder p="md">
        <Group gap="xl">
          <Text size="sm">failed cron jobs: <b>{failed.length}</b></Text>
          <Text size="sm">total cron jobs: <b>{jobs.length}</b></Text>
          <Text size="sm" c="dimmed">manage schedules without editing config by hand</Text>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">Cron Jobs</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job</Table.Th>
              <Table.Th>Schedule</Table.Th>
              <Table.Th>Task</Table.Th>
              <Table.Th>Last Run</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((job) => {
              const paused = job.paused === true || job.enabled === false;
              return (
                <Table.Tr key={job.id}>
                  <Table.Td><Text ff="monospace" size="xs">{job.id}</Text></Table.Td>
                  <Table.Td>{job.schedule ? `${job.schedule.kind}:${job.schedule.expr}` : '-'}</Table.Td>
                  <Table.Td><Text size="sm" lineClamp={2}>{jobTask(job) || '-'}</Text></Table.Td>
                  <Table.Td>
                    <Badge
                      color={job.lastRun?.status === 'error' ? 'red' : job.lastRun?.status === 'timeout' ? 'yellow' : 'gray'}
                      variant="light"
                    >
                      {job.lastRun?.status ?? 'never'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <PermissionGate resource="cron" action="execute">
                        <ActionIcon
                          variant="light"
                          color={paused ? 'green' : 'yellow'}
                          onClick={() => doAction(() => paused ? resumeCronJob(job.id) : pauseCronJob(job.id), paused ? 'resumed' : 'paused')}
                        >
                          {paused ? <Play size={14} /> : <Pause size={14} />}
                        </ActionIcon>
                      </PermissionGate>
                      <PermissionGate resource="cron" action="execute">
                        <ActionIcon variant="light" onClick={() => doAction(() => runCronJob(job.id), 'triggered')}>
                          <RotateCw size={14} />
                        </ActionIcon>
                      </PermissionGate>
                      <ActionIcon variant="light" color="gray" onClick={() => openEdit(job)}>
                        <Pencil size={14} />
                      </ActionIcon>
                      <ActionIcon variant="light" color="blue" onClick={() => loadRuns(job.id)}>
                        <Play size={14} />
                      </ActionIcon>
                      <PermissionGate resource="cron" action="execute">
                        <ActionIcon variant="light" color="red" onClick={() => doAction(() => deleteCronJob(job.id), 'deleted')}>
                          <Trash2 size={14} />
                        </ActionIcon>
                      </PermissionGate>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {!jobs.length ? <Text c="dimmed" size="sm" mt="sm">cron disabled or no jobs</Text> : null}
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>{runTitle}</Title>
          {runsFor ? <Button size="xs" variant="subtle" onClick={() => loadRuns(runsFor)}>Refresh</Button> : null}
        </Group>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Finished</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Error</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runs.map((run, index) => (
              <Table.Tr key={`${run.startedAt}-${index}`}>
                <Table.Td><Badge color={run.status === 'error' ? 'red' : run.status === 'timeout' ? 'yellow' : 'green'} variant="light">{run.status}</Badge></Table.Td>
                <Table.Td>{formatTime(run.startedAt)}</Table.Td>
                <Table.Td>{formatTime(run.finishedAt)}</Table.Td>
                <Table.Td>{run.durationMs ?? '-'}</Table.Td>
                <Table.Td><Text size="sm" c={run.error ? 'red' : 'dimmed'}>{run.error ?? '-'}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!runsFor ? <Text c="dimmed" size="sm">select a job to inspect run history</Text> : null}
        {runsFor && !runs.length ? <Text c="dimmed" size="sm">no recorded runs</Text> : null}
      </Paper>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.id}` : 'New Cron Job'} size="lg">
        <Stack gap="sm">
          <TextInput
            label="Job ID"
            value={form.id}
            onChange={(event) => setForm((prev) => ({ ...prev, id: event.currentTarget.value }))}
            disabled={Boolean(editing)}
          />
          <Group grow>
            <Select
              label="Schedule Kind"
              data={[
                { value: 'every', label: 'every' },
                { value: 'cron', label: 'cron' },
                { value: 'at', label: 'at' },
              ]}
              value={form.kind}
              onChange={(kind) => setForm((prev) => ({ ...prev, kind: kind ?? 'every' }))}
            />
            <TextInput
              label="Expression"
              value={form.expr}
              onChange={(event) => setForm((prev) => ({ ...prev, expr: event.currentTarget.value }))}
            />
          </Group>
          <TextInput
            label="Timezone"
            placeholder="Asia/Shanghai"
            value={form.timezone}
            onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.currentTarget.value }))}
          />
          <Textarea
            label="Task"
            minRows={4}
            value={form.task}
            onChange={(event) => setForm((prev) => ({ ...prev, task: event.currentTarget.value }))}
          />
          <Group grow>
            <Select
              label="Delivery"
              clearable
              data={[
                { value: 'announce', label: 'announce' },
                { value: 'silent', label: 'silent' },
              ]}
              value={form.delivery || null}
              onChange={(delivery) => setForm((prev) => ({ ...prev, delivery: delivery ?? '' }))}
            />
            <TextInput
              label="Timeout ms"
              value={form.timeoutMs}
              onChange={(event) => setForm((prev) => ({ ...prev, timeoutMs: event.currentTarget.value }))}
            />
          </Group>
          <Checkbox
            label="Delete after run"
            checked={form.deleteAfterRun}
            onChange={(event) => setForm((prev) => ({ ...prev, deleteAfterRun: event.currentTarget.checked }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setModalOpen(false)}>Cancel</Button>
            <PermissionGate resource="cron" action="execute">
              <Button onClick={handleSave} loading={saving} disabled={!form.id.trim() || !form.expr.trim() || !form.task.trim()}>
                Save
              </Button>
            </PermissionGate>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
