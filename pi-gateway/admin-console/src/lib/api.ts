import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 8000
});

export type HealthResponse = {
  ok: boolean;
  version?: string;
};

export async function fetchGatewayHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}
