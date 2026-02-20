type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
};

export function MetricCard({ label, value, delta }: MetricCardProps) {
  return (
    <div className="metric-card">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {delta ? <p className="mt-2 text-xs text-emerald-400">{delta}</p> : null}
    </div>
  );
}
