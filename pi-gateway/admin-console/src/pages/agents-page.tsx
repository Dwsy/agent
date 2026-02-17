const rows = [
  { name: 'main', model: 'gpt-5', state: 'healthy', sessions: 12 },
  { name: 'planner', model: 'claude-sonnet-4', state: 'healthy', sessions: 4 },
  { name: 'worker', model: 'gemini-2.0-flash', state: 'warning', sessions: 19 }
];

export function AgentsPage() {
  return (
    <div className="rounded-xl border border-slate-800 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Agent Controller</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="pb-2">Agent</th>
            <th className="pb-2">Model</th>
            <th className="pb-2">State</th>
            <th className="pb-2">Sessions</th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-slate-800">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.model}</td>
              <td className="py-2">{row.state}</td>
              <td className="py-2">{row.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
