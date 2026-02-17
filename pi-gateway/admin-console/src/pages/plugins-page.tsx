export function PluginsPage() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {['memory-lancedb', 'gateway-tools', 'role-persona'].map((name) => (
        <article key={name} className="rounded-xl border border-slate-800 bg-card p-4">
          <h3 className="text-sm font-semibold text-white">{name}</h3>
          <p className="mt-2 text-xs text-slate-400">Scaffold card. Future actions: enable/disable, config, logs.</p>
        </article>
      ))}
    </div>
  );
}
