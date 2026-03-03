import { useEffect } from 'react';
import { ActionIcon, Badge, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { Pause, Play } from 'lucide-react';
import { PageHeader } from '../components/atoms/page-header';
import { PermissionGate } from '../components/permission-gate';
import { useDataMutation, usePageDataSource } from '../hooks/use-data-source';
import { trackRuntimeEvent } from '../hooks/use-observability';
import { fetchCronJobs, pauseCronJob, resumeCronJob } from '../lib/api';

export function AlertsPage() {
  useEffect(() => {
    trackRuntimeEvent('info', 'Page mounted: Alerts', { page: 'alerts' });
  }, []);

  const cronQuery = usePageDataSource('alerts', ['cron-jobs'], fetchCronJobs);

  const pauseMutation = useDataMutation({
    mutationFn: pauseCronJob,
    invalidateKeys: [['cron-jobs']],
  });

  const resumeMutation = useDataMutation({
    mutationFn: resumeCronJob,
    invalidateKeys: [['cron-jobs']],
  });

  const jobs = cronQuery.data ?? [];
  const failed = jobs.filter((job) => job.lastRun?.status === 'error' || job.lastRun?.status === 'timeout');

  return (
    <Stack gap="md">
      <PageHeader title="Alerts & Cron" description="Cron runtime alerts and quick actions" />

      <Paper withBorder p="md">
        <Group gap="xl">
          <Text size="sm">failed cron jobs: <b>{failed.length}</b></Text>
          <Text size="sm">total cron jobs: <b>{jobs.length}</b></Text>
          <Text size="sm" c="dimmed">action: pause noisy jobs / resume paused jobs</Text>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">Cron Jobs</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job</Table.Th>
              <Table.Th>Schedule</Table.Th>
              <Table.Th>Last Run</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((job) => {
              const paused = job.paused === true || job.enabled === false;
              return (
                <Table.Tr key={job.id}>
                  <Table.Td><Text ff="monospace" size="xs">{job.id}</Text></Table.Td>
                  <Table.Td>{job.schedule ? `${job.schedule.kind}:${job.schedule.expr}` : '-'}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={job.lastRun?.status === 'error' ? 'red' : job.lastRun?.status === 'timeout' ? 'yellow' : 'gray'}
                      variant="light"
                    >
                      {job.lastRun?.status ?? 'never'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {paused ? (
                      <PermissionGate resource="cron" action="execute">
                        <ActionIcon
                          variant="light"
                          color="green"
                          onClick={() => resumeMutation.mutate(job.id)}
                          disabled={resumeMutation.isPending}
                        >
                          <Play size={14} />
                        </ActionIcon>
                      </PermissionGate>
                    ) : (
                      <PermissionGate resource="cron" action="execute">
                        <ActionIcon
                          variant="light"
                          color="yellow"
                          onClick={() => pauseMutation.mutate(job.id)}
                          disabled={pauseMutation.isPending}
                        >
                          <Pause size={14} />
                        </ActionIcon>
                      </PermissionGate>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {!jobs.length ? <Text c="dimmed" size="sm" mt="sm">cron disabled or no jobs</Text> : null}
      </Paper>
    </Stack>
  );
}
