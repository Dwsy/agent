import { Alert, Group, Loader, Text } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';

type QueryState = {
  isError: boolean;
  isFetching?: boolean;
  error?: Error | null;
};

export function DataStatus({
  queries,
  label = 'Data source',
}: {
  queries: QueryState[];
  label?: string;
}) {
  const failures = queries.filter((query) => query.isError);
  if (failures.length > 0) {
    const messages = failures
      .map((query) => query.error?.message)
      .filter((message): message is string => Boolean(message));

    return (
      <Alert color="red" icon={<AlertTriangle size={16} />} title={`${label} unavailable`}>
        <Text size="sm">
          {messages.length ? messages.join(' · ') : 'Check gateway process, token, and API availability.'}
        </Text>
      </Alert>
    );
  }

  if (queries.some((query) => query.isFetching)) {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">Refreshing {label.toLowerCase()}...</Text>
      </Group>
    );
  }

  return null;
}
