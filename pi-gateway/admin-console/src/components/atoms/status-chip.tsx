import { Badge } from '@mantine/core';

type Status = 'healthy' | 'warning' | 'down';

const colorByStatus: Record<Status, string> = {
  healthy: 'green',
  warning: 'yellow',
  down: 'red',
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <Badge variant="light" color={colorByStatus[status]}>
      {status}
    </Badge>
  );
}
