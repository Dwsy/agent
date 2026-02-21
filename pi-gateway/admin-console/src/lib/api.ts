import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://127.0.0.1:52134/api',
  timeout: 10000
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
  lastRun?: {
    status: 'completed' | 'timeout' | 'error';
    finishedAt?: number;
    durationMs?: number;
    error?: string;
  } | null;
};

export async function fetchGatewayHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
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

export async function fetchGatewayConfig(): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>('/gateway/config');
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
