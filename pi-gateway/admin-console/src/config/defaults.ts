/**
 * Admin Console 默认配置
 * 作为所有配置的基准，可被上层配置覆盖
 */
import type { AdminConfig } from './types';
import type { NavItem } from './schema';

/**
 * 默认应用配置
 */
export const defaultConfig: AdminConfig = {
  app: {
    name: 'Pi Gateway',
    environment: 'development',
    theme: 'dark',
    timezone: 'UTC',
  },
  auth: {
    enabled: true,
    mode: 'token',
    tokenStorage: 'localStorage',
    refreshEnabled: true,
    refreshInterval: 300000,
  },
  api: {
    baseURL: '/api',
    timeout: 10000,
    retry: {
      enabled: true,
      maxRetries: 3,
      retryDelay: 1000,
    },
  },
  realtime: {
    mode: 'polling',
    websocket: {
      enabled: false,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    },
    sse: {
      enabled: false,
      reconnectInterval: 5000,
    },
    polling: {
      enabled: true,
      defaultInterval: 5000,
    },
  },
  features: {
    overview: true,
    agents: true,
    plugins: true,
    alerts: true,
    settings: true,
    cron: false,
    audit: false,
    logs: false,
    metrics: true,
  },
  polling: {
    overview: 5000,
    agents: 10000,
    plugins: 30000,
    alerts: 5000,
    settings: 60000,
  },
  permissions: {
    enabled: false,
    defaultRole: 'viewer',
    roles: [
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full access to all features',
        permissions: {
          overview: ['view', 'create', 'update', 'delete', 'execute'],
          agents: ['view', 'create', 'update', 'delete', 'execute'],
          plugins: ['view', 'create', 'update', 'delete', 'execute'],
          alerts: ['view', 'create', 'update', 'delete', 'execute'],
          settings: ['view', 'create', 'update', 'delete', 'execute'],
        },
      },
      {
        id: 'operator',
        name: 'Operator',
        description: 'Can view and execute actions',
        permissions: {
          overview: ['view', 'execute'],
          agents: ['view', 'execute'],
          plugins: ['view'],
          alerts: ['view', 'update', 'execute'],
          settings: ['view'],
        },
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access',
        permissions: {
          overview: ['view'],
          agents: ['view'],
          plugins: ['view'],
          alerts: ['view'],
          settings: ['view'],
        },
      },
    ],
  },
  ui: {
    mobileBreakpoint: 768,
    table: {
      mobileMode: 'scroll',
      pageSize: 20,
      pageSizeOptions: [10, 20, 50, 100],
    },
    sidebar: {
      collapsible: true,
      defaultCollapsed: false,
    },
  },
  observability: {
    logging: {
      enabled: true,
      level: 'info',
      console: true,
    },
    analytics: {
      enabled: false,
    },
    errorReporting: {
      enabled: false,
    },
  },
  audit: {
    enabled: false,
    retentionDays: 30,
    logActions: ['create', 'update', 'delete', 'execute'],
  },
};

/**
 * 默认导航配置
 */
export const defaultNavigation: NavItem[] = [
  {
    id: 'overview',
    path: '/',
    label: 'Overview',
    icon: 'LayoutDashboard',
    feature: 'overview',
    order: 0,
  },
  {
    id: 'agents',
    path: '/agents',
    label: 'Agents',
    icon: 'Bot',
    feature: 'agents',
    order: 1,
  },
  {
    id: 'plugins',
    path: '/plugins',
    label: 'Plugins',
    icon: 'Plug',
    feature: 'plugins',
    order: 2,
  },
  {
    id: 'alerts',
    path: '/alerts',
    label: 'Alerts',
    icon: 'Bell',
    feature: 'alerts',
    order: 3,
  },
  {
    id: 'metrics',
    path: '/metrics',
    label: 'Metrics',
    icon: 'BarChart3',
    feature: 'metrics',
    order: 4,
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    icon: 'Settings',
    feature: 'settings',
    order: 5,
  },
];
