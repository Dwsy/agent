import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap={4}>
        <Title order={2}>{title}</Title>
        {description ? <Text c="dimmed" size="sm">{description}</Text> : null}
      </Stack>
      {action}
    </Group>
  );
}
