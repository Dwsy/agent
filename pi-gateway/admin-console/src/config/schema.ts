/**
 * Admin Console 配置 Schema 定义
 * 使用 Zod 进行运行时类型校验
 */
import { z } from 'zod';

// ==================== App 配置 ====================
export const AppConfigSchema = z.object({
  name: z.string().default('Pi Gateway'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  timezone: z.string().default('UTC'),
  version: z.string().optional(),
});

// ==================== Auth 配置 ====================
export const AuthConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['token', 'session', 'oauth', 'off']).default('token'),
  tokenStorage: z.enum(['localStorage', 'sessionStorage', 'cookie']).default('localStorage'),
  refreshEnabled: z.boolean().default(true),
  refreshInterval: z.number().default(300000), // 5分钟
});

// ==================== API 配置 ====================
export const ApiConfigSchema = z.object({
  baseURL: z.string().default('/api'),
  timeout: z.number().default(10000),
  retry: z.object({
    enabled: z.boolean().default(true),
    maxRetries: z.number().default(3),
    retryDelay: z.number().default(1000),
  }).default({}),
});

// ==================== Realtime 配置 ====================
export const RealtimeConfigSchema = z.object({
  mode: z.enum(['polling', 'websocket', 'sse', 'hybrid']).default('polling'),
  websocket: z.object({
    enabled: z.boolean().default(false),
    reconnectInterval: z.number().default(3000),
    maxReconnectAttempts: z.number().default(5),
  }).default({}),
  sse: z.object({
    enabled: z.boolean().default(false),
    reconnectInterval: z.number().default(5000),
  }).default({}),
  polling: z.object({
    enabled: z.boolean().default(true),
    defaultInterval: z.number().default(5000),
  }).default({}),
});

// ==================== Features 配置 ====================
export const FeaturesConfigSchema = z.object({
  overview: z.boolean().default(true),
  agents: z.boolean().default(true),
  plugins: z.boolean().default(true),
  alerts: z.boolean().default(true),
  settings: z.boolean().default(true),
  cron: z.boolean().default(false),
  audit: z.boolean().default(false),
  logs: z.boolean().default(false),
  metrics: z.boolean().default(false),
});

// ==================== Polling 配置 ====================
export const PollingConfigSchema = z.object({
  overview: z.number().default(5000),
  agents: z.number().default(10000),
  plugins: z.number().default(30000),
  alerts: z.number().default(5000),
  settings: z.number().default(60000),
});

// ==================== Permissions 配置 ====================
export const PermissionActionSchema = z.enum(['view', 'create', 'update', 'delete', 'execute']);

export const PermissionsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  defaultRole: z.string().default('viewer'),
  roles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    permissions: z.record(z.array(PermissionActionSchema)),
  })).default([]),
});

// ==================== UI 配置 ====================
export const UIConfigSchema = z.object({
  mobileBreakpoint: z.number().default(768),
  table: z.object({
    mobileMode: z.enum(['scroll', 'cards', 'compact']).default('scroll'),
    pageSize: z.number().default(20),
    pageSizeOptions: z.array(z.number()).default([10, 20, 50, 100]),
  }).default({}),
  sidebar: z.object({
    collapsible: z.boolean().default(true),
    defaultCollapsed: z.boolean().default(false),
  }).default({}),
});

// ==================== Observability 配置 ====================
export const ObservabilityConfigSchema = z.object({
  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    console: z.boolean().default(true),
  }).default({}),
  analytics: z.object({
    enabled: z.boolean().default(false),
    provider: z.string().optional(),
  }).default({}),
  errorReporting: z.object({
    enabled: z.boolean().default(false),
    dsn: z.string().optional(),
  }).default({}),
});

// ==================== Audit 配置 ====================
export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(false),
  retentionDays: z.number().default(30),
  logActions: z.array(z.string()).default(['create', 'update', 'delete', 'execute']),
});

// ==================== 根配置 Schema ====================
export const AdminConfigSchema = z.object({
  app: AppConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  api: ApiConfigSchema.default({}),
  realtime: RealtimeConfigSchema.default({}),
  features: FeaturesConfigSchema.default({}),
  polling: PollingConfigSchema.default({}),
  permissions: PermissionsConfigSchema.default({}),
  ui: UIConfigSchema.default({}),
  observability: ObservabilityConfigSchema.default({}),
  audit: AuditConfigSchema.default({}),
});

// ==================== 类型导出 ====================
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type RealtimeConfig = z.infer<typeof RealtimeConfigSchema>;
export type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;
export type PollingConfig = z.infer<typeof PollingConfigSchema>;
export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type AdminConfig = z.infer<typeof AdminConfigSchema>;

// ==================== 导航项类型 ====================
export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: string; // Lucide icon name
  feature: string; // 对应 features 中的 key
  order: number;
  children?: NavItem[];
}
