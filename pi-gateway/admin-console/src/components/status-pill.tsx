import { cn } from '../lib/cn';

type Status = 'healthy' | 'warning' | 'down';

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-1 text-xs font-medium',
        status === 'healthy' && 'bg-emerald-500/15 text-emerald-300',
        status === 'warning' && 'bg-amber-500/15 text-amber-300',
        status === 'down' && 'bg-rose-500/15 text-rose-300'
      )}
    >
      {status}
    </span>
  );
}
