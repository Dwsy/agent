import { Stack, Text, Title } from '@mantine/core';
import { SurfaceCard } from './atoms/surface-card';

type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
};

export function MetricCard({ label, value, delta }: MetricCardProps) {
  return (
    <SurfaceCard>
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {label}
        </Text>
        <Title order={3}>{value}</Title>
        {delta ? (
          <Text size="xs" c="green" fw={500}>
            {delta}
          </Text>
        ) : null}
      </Stack>
    </SurfaceCard>
  );
}
