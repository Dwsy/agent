/**
 * 配置类型定义补充
 * 用于解决循环依赖和类型推断问题
 */

import type { 
  AppConfig, 
  AuthConfig, 
  ApiConfig, 
  RealtimeConfig, 
  FeaturesConfig,
  PollingConfig,
  PermissionsConfig,
  UIConfig,
  ObservabilityConfig,
  AuditConfig
} from './schema';

// 重新导出 schema 中的类型
export type {
  FeaturesConfig,
};

/**
 * 完整配置类型
 */
export interface AdminConfig {
  app: AppConfig;
  auth: AuthConfig;
  api: ApiConfig;
  realtime: RealtimeConfig;
  features: FeaturesConfig;
  polling: PollingConfig;
  permissions: PermissionsConfig;
  ui: UIConfig;
  observability: ObservabilityConfig;
  audit: AuditConfig;
}

/**
 * 部分配置类型（用于合并）
 */
export interface PartialAdminConfig {
  app?: Partial<AppConfig>;
  auth?: Partial<AuthConfig>;
  api?: Partial<ApiConfig>;
  realtime?: Partial<RealtimeConfig>;
  features?: Partial<FeaturesConfig>;
  polling?: Partial<PollingConfig>;
  permissions?: Partial<PermissionsConfig>;
  ui?: Partial<UIConfig>;
  observability?: Partial<ObservabilityConfig>;
  audit?: Partial<AuditConfig>;
}
