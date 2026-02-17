export function AlertsPage() {
  return (
    <div className="rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Alert Center</h2>
      <ul className="space-y-2 text-sm text-slate-300">
        <li>⚠️ cron job backup-nightly has 2 retries in the last 24h.</li>
        <li>✅ telegram adapter latency is stable below 300ms.</li>
        <li>💡 suggestion: pin critical incident message automatically.</li>
      </ul>
    </div>
  );
}
