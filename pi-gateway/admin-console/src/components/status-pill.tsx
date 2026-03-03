import { StatusChip } from './atoms/status-chip';

type Status = 'healthy' | 'warning' | 'down';

export function StatusPill({ status }: { status: Status }) {
  return <StatusChip status={status} />;
}
