import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器：自动附加认证 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gateway_api_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type HealthResponse = {
  status: 'ok' | string;
  uptime: number;
  sessions: number;
  channels: string[];
  pool: {
    totalProcesses?: number;
    running?: number;
    idle?: number;
    waiting?: number;
  };
  queue: {
    queued?: number;
    totalProcessed?: number;
    totalFailed?: number;
  };
};

export type SessionItem = {
  sessionKey: string;
  role?: string;
  isStreaming?: boolean;
  messageCount?: number;
  lastActivity?: number;
  rpcProcessId?: string;
};

export type PoolResponse = {
  stats: {
    totalProcesses?: number;
    running?: number;
    idle?: number;
    waiting?: number;
  };
  processes: Array<{
    id: string;
    sessionKey: string;
    isAlive: boolean;
    isIdle: boolean;
    lastActivity?: number;
  }>;
};

export type PluginsResponse = {
  channels: string[];
  tools: string[];
  commands: string[];
  hooks: string[];
  services: string[];
};

export type ChannelCapabilitySnapshot = {
  id: string;
  label: string;
  matrix?: Record<string, Record<string, unknown>>;
};

export type CronStatusResponse = {
  ok: boolean;
  total: number;
  active: number;
  paused: number;
  disabled: number;
};

export type CronJob = {
  id: string;
  paused?: boolean;
  enabled?: boolean;
  schedule?: { kind: string; expr: string; timezone?: string };
  payload?: { text?: string };
  delivery?: string;
  deleteAfterRun?: boolean;
  timeoutMs?: number;
  lastRun?: {
    status: 'completed' | 'timeout' | 'error';
    finishedAt?: number;
    durationMs?: number;
    error?: string;
  } | null;
};

export type MetricsSample = {
  timestamp: number;
  pool: { active: number; idle: number; total: number; maxCapacity: number };
  queue: { sessions: number; totalPending: number };
  sessions: { activeCount: number };
  system: { gatewayRssMb: number; uptimeMs: number };
};

export type MetricsSnapshot = {
  timestamp: number;
  current: MetricsSample | null;
  counters: Record<string, number>;
  latency: { p50: number; p95: number; p99: number; count: number };
  rpcProcesses: Array<{ pid: number; rssMb: number; timestamp: number }>;
  history: MetricsSample[];
  delegation?: unknown;
};

export type ModelItem = {
  provider?: string;
  id?: string;
  model?: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
};

export type SessionStatusResponse = {
  sessionKey: string;
  stats?: Record<string, unknown>;
  state?: Record<string, unknown>;
  messageCount: number;
  isStreaming: boolean;
  lastActivity: number | null;
  resolvedModel: string | null;
  resolvedModelSource: string | null;
  resolvedThinkingLevel: string | null;
  resolvedThinkingSource: string | null;
};

export type SessionMessagesResponse = {
  sessionKey: string;
  messages: Array<{ role?: string; content?: unknown; [key: string]: unknown }>;
};

export type CronRun = {
  id?: string;
  jobId?: string;
  status: 'completed' | 'timeout' | 'error' | string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
};

export type ConfigValidationIssue = {
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
  autoFixable: boolean;
};

export type ConfigValidationResult = {
  valid: boolean;
  issues: ConfigValidationIssue[];
  stats: { error: number; warning: number; info: number };
  autoFixableCount: number;
};

export type RawConfigResponse = {
  ok: boolean;
  path: string;
  exists: boolean;
  mtimeMs: number | null;
  size: number;
  text: string;
};

export type ConfigBackup = {
  filename: string;
  path: string;
  mtimeMs: number;
  size: number;
};

export async function fetchGatewayHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const { data } = await api.get<MetricsSnapshot>('/metrics');
  return data;
}

export async function fetchSessions(): Promise<SessionItem[]> {
  const { data } = await api.get<{ sessions: SessionItem[] }>('/sessions');
  return data.sessions ?? [];
}

export async function fetchPool(): Promise<PoolResponse> {
  const { data } = await api.get<PoolResponse>('/pool');
  return data;
}

export async function fetchPlugins(): Promise<PluginsResponse> {
  const { data } = await api.get<PluginsResponse>('/plugins');
  return data;
}

export async function fetchChannelCapabilityMatrix(): Promise<ChannelCapabilitySnapshot[]> {
  const { data } = await api.get<{ channels: ChannelCapabilitySnapshot[] }>('/channels/capability-matrix');
  return data.channels ?? [];
}

export async function fetchGatewayConfig(): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>('/gateway/config');
  return data;
}

export async function fetchRawGatewayConfig(): Promise<RawConfigResponse> {
  const { data } = await api.get<RawConfigResponse>('/gateway/config/raw');
  return data;
}

export async function validateRawGatewayConfig(text: string): Promise<{ ok: boolean; validation: ConfigValidationResult }> {
  const { data } = await api.post<{ ok: boolean; validation: ConfigValidationResult }>('/gateway/config/raw/validate', { text });
  return data;
}

export async function saveRawGatewayConfig(params: { text: string; expectedMtimeMs: number | null }): Promise<{
  ok: boolean;
  validation: ConfigValidationResult;
  backupPath: string | null;
  mtimeMs: number;
}> {
  const { data } = await api.put<{
    ok: boolean;
    validation: ConfigValidationResult;
    backupPath: string | null;
    mtimeMs: number;
  }>('/gateway/config/raw', params);
  return data;
}

export async function fetchConfigBackups(): Promise<ConfigBackup[]> {
  const { data } = await api.get<{ ok: boolean; backups: ConfigBackup[] }>('/gateway/config/raw/backups');
  return data.backups ?? [];
}

export async function restoreRawGatewayConfig(filename?: string): Promise<{
  ok: boolean;
  validation: ConfigValidationResult;
  restoredFrom: string;
  mtimeMs: number;
}> {
  const { data } = await api.post<{
    ok: boolean;
    validation: ConfigValidationResult;
    restoredFrom: string;
    mtimeMs: number;
  }>('/gateway/config/raw/restore', { filename });
  return data;
}

export async function reloadGatewayConfig(): Promise<{ ok: boolean; message: string }> {
  const { data } = await api.post<{ ok: boolean; message: string }>('/gateway/reload');
  return data;
}

export async function restartGateway(): Promise<{ ok: boolean; message: string }> {
  const { data } = await api.post<{ ok: boolean; message: string }>('/gateway/restart');
  return data;
}

export async function fetchCronStatus(): Promise<CronStatusResponse | null> {
  try {
    const { data } = await api.get<CronStatusResponse>('/cron/status');
    return data;
  } catch {
    return null;
  }
}

export async function fetchCronJobs(): Promise<CronJob[]> {
  try {
    const { data } = await api.get<{ ok: boolean; jobs: CronJob[] }>('/cron/jobs');
    return data.jobs ?? [];
  } catch {
    return [];
  }
}

export async function pauseCronJob(id: string): Promise<void> {
  await api.patch(`/cron/jobs/${encodeURIComponent(id)}`, { action: 'pause' });
}

export async function resumeCronJob(id: string): Promise<void> {
  await api.patch(`/cron/jobs/${encodeURIComponent(id)}`, { action: 'resume' });
}

export async function addCronJob(input: {
  id: string;
  schedule: { kind: string; expr: string; timezone?: string };
  task: string;
  agentId?: string;
  delivery?: string;
  deleteAfterRun?: boolean;
  timeoutMs?: number;
}): Promise<CronJob> {
  const { data } = await api.post<{ ok: boolean; job: CronJob }>('/cron/jobs', input);
  return data.job;
}

export async function updateCronJob(id: string, input: {
  schedule?: { kind: string; expr: string; timezone?: string };
  task?: string;
  delivery?: string;
  deleteAfterRun?: boolean;
  timeoutMs?: number;
}): Promise<CronJob> {
  const { data } = await api.patch<{ ok: boolean; job: CronJob }>(`/cron/jobs/${encodeURIComponent(id)}`, { action: 'update', ...input });
  return data.job;
}

export async function deleteCronJob(id: string): Promise<void> {
  await api.delete(`/cron/jobs/${encodeURIComponent(id)}`);
}

export async function runCronJob(id: string): Promise<void> {
  await api.post(`/cron/jobs/${encodeURIComponent(id)}/run`);
}

export async function fetchCronRuns(id: string, limit = 20): Promise<CronRun[]> {
  const { data } = await api.get<{ ok: boolean; runs: CronRun[] }>(`/cron/jobs/${encodeURIComponent(id)}/runs`, { params: { limit } });
  return data.runs ?? [];
}

export async function fetchModels(sessionKey: string): Promise<ModelItem[]> {
  const { data } = await api.get<{ models: ModelItem[] }>('/models', { params: { sessionKey } });
  return data.models ?? [];
}

export async function updateSessionModel(sessionKey: string, model: string): Promise<void> {
  await api.post('/session/model', { sessionKey, model });
}

export async function updateSessionThinking(sessionKey: string, level: string): Promise<void> {
  await api.post('/session/think', { sessionKey, level });
}

export async function resetSession(sessionKey: string): Promise<void> {
  await api.post('/session/reset', { sessionKey });
}

export async function fetchSessionStatus(sessionKey: string): Promise<SessionStatusResponse> {
  const { data } = await api.get<SessionStatusResponse>('/session/status', { params: { sessionKey } });
  return data;
}

export async function fetchSessionMessages(sessionKey: string): Promise<SessionMessagesResponse> {
  const { data } = await api.get<SessionMessagesResponse>('/session/messages', { params: { sessionKey } });
  return data;
}
