export function SettingsPage() {
  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="text-sm font-semibold">Settings (Scaffold)</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-400">
          Gateway Base URL
          <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" defaultValue="http://127.0.0.1:3000" />
        </label>
        <label className="text-xs text-slate-400">
          Polling Interval (s)
          <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" defaultValue="10" />
        </label>
      </div>
    </div>
  );
}
