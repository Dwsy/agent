import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCronJobs, pauseCronJob, resumeCronJob } from '../lib/api';

export function AlertsPage() {
  const queryClient = useQueryClient();
  const cronQuery = useQuery({ queryKey: ['cron-jobs'], queryFn: fetchCronJobs, refetchInterval: 15000 });

  const pauseMutation = useMutation({
    mutationFn: pauseCronJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-jobs'] })
  });

  const resumeMutation = useMutation({
    mutationFn: resumeCronJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-jobs'] })
  });

  const jobs = cronQuery.data ?? [];
  const failed = jobs.filter((j) => j.lastRun?.status === 'error' || j.lastRun?.status === 'timeout');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Alert Summary</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          <li>⚠️ failed cron jobs: {failed.length}</li>
          <li>✅ total cron jobs: {jobs.length}</li>
          <li>💡 action: pause noisy jobs / resume paused jobs directly here</li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Cron Jobs</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-2">Job</th>
              <th className="pb-2">Schedule</th>
              <th className="pb-2">Last Run</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {jobs.map((job) => {
              const paused = job.paused === true || job.enabled === false;
              return (
                <tr key={job.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-xs">{job.id}</td>
                  <td className="py-2">{job.schedule ? `${job.schedule.kind}:${job.schedule.expr}` : '-'}</td>
                  <td className="py-2">{job.lastRun?.status ?? 'never'}</td>
                  <td className="py-2">
                    {paused ? (
                      <button
                        type="button"
                        className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300"
                        onClick={() => resumeMutation.mutate(job.id)}
                      >
                        resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-300"
                        onClick={() => pauseMutation.mutate(job.id)}
                      >
                        pause
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  cron disabled or no jobs
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
