import { create } from 'zustand';

export type ObservabilityLevel = 'debug' | 'info' | 'warn' | 'error';

export type ObservabilityEvent = {
  id: string;
  ts: number;
  level: ObservabilityLevel;
  category: 'config' | 'query' | 'mutation' | 'permission' | 'runtime';
  message: string;
  meta?: Record<string, unknown>;
};

export type ObservabilityMetric = {
  id: string;
  name: string;
  value: number;
  ts: number;
  tags?: Record<string, string>;
};

type ObservabilityState = {
  events: ObservabilityEvent[];
  metrics: ObservabilityMetric[];
  addEvent: (event: Omit<ObservabilityEvent, 'id' | 'ts'>) => void;
  addMetric: (metric: Omit<ObservabilityMetric, 'id' | 'ts'>) => void;
  clearEvents: () => void;
  clearMetrics: () => void;
};

const MAX_EVENTS = 200;
const MAX_METRICS = 400;

export const useObservabilityStore = create<ObservabilityState>((set) => ({
  events: [],
  metrics: [],
  addEvent: (event) =>
    set((state) => {
      const next: ObservabilityEvent = {
        ...event,
        id: crypto.randomUUID(),
        ts: Date.now(),
      };
      const events = [next, ...state.events].slice(0, MAX_EVENTS);
      return { events };
    }),
  addMetric: (metric) =>
    set((state) => {
      const next: ObservabilityMetric = {
        ...metric,
        id: crypto.randomUUID(),
        ts: Date.now(),
      };
      const metrics = [next, ...state.metrics].slice(0, MAX_METRICS);
      return { metrics };
    }),
  clearEvents: () => set({ events: [] }),
  clearMetrics: () => set({ metrics: [] }),
}));

export function trackEvent(event: Omit<ObservabilityEvent, 'id' | 'ts'>): void {
  useObservabilityStore.getState().addEvent(event);
}

export function trackMetric(metric: Omit<ObservabilityMetric, 'id' | 'ts'>): void {
  useObservabilityStore.getState().addMetric(metric);
}
