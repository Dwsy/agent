import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { PermissionGate, PermissionDisabledWrapper } from '../components/permission-gate';
import { usePageDataSource, useDataMutation } from '../hooks/use-data-source';
import { fetchCronJobs, pauseCronJob, resumeCronJob } from '../lib/api';

export function AlertsPage() {
  // 使用 use-data-source 替换直接的 useQuery
  const cronQuery = usePageDataSource('alerts', ['cron-jobs'], fetchCronJobs);

  // 使用 useDataMutation 替换 useMutation
  const pauseMutation = useDataMutation({
    mutationFn: pauseCronJob,
    invalidateKeys: [['cron-jobs']],
  });

  const resumeMutation = useDataMutation({
    mutationFn: resumeCronJob,
    invalidateKeys: [['cron-jobs']],
  });

  const jobs = cronQuery.data ?? [];
  const failed = jobs.filter((j) => j.lastRun?.status === 'error' || j.lastRun?.status === 'timeout');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Alert Summary</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-center gap-2"><AlertTriangle size={14} className="text-amber-400" />failed cron jobs: {failed.length}</li>
          <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" />total cron jobs: {jobs.length}</li>
          <li className="flex items-center gap-2"><Lightbulb size={14} className="text-sky-400" />action: pause noisy jobs / resume paused jobs directly here</li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-800 bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Cron Jobs</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-sm">
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
                        <PermissionGate
                          resource="cron"
                          action="execute"
                          fallback={
                            <span className="inline-block rounded border border-slate-700 px-2 py-1 text-xs text-slate-500">
                              resume
                            </span>
                          }
                        >
                          <button
                            type="button"
                            className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300"
                            onClick={() => resumeMutation.mutate(job.id)}
                            disabled={resumeMutation.isPending}
                          >
                            {resumeMutation.isPending ? 'resuming...' : 'resume'}
                          </button>
                        </PermissionGate>
                      ) : (
                        <PermissionGate
                          resource="cron"
                          action="execute"
                          fallback={
                            <span className="inline-block rounded border border-slate-700 px-2 py-1 text-xs text-slate-500">
                              pause
                            </span>
                          }
                        >
                          <button
                            type="button"
                            className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-300"
                            onClick={() => pauseMutation.mutate(job.id)}
                            disabled={pauseMutation.isPending}
                          >
                            {pauseMutation.isPending ? 'pausing...' : 'pause'}
                          </button>
                        </PermissionGate>
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
    </div>
  );
}
