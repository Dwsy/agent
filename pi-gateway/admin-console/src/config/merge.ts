/**
 * 配置合并工具
 * 支持深度合并，处理数组和对象的覆盖策略
 */
import type { AdminConfig, PartialAdminConfig } from './types';

/**
 * 判断是否为对象
 */
function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * 深度合并配置
 * @param target - 基础配置
 * @param source - 要合并的覆盖配置
 * @returns 合并后的配置
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T> | undefined
): T {
  if (!source) return target;

  const result: Record<string, unknown> = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        // 对象类型：递归深度合并
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        // 其他类型：直接覆盖（包括数组）
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}

/**
 * 合并多层配置
 * 优先级：defaults < local < remote < env
 * @param layers - 配置层数组
 * @returns 合并后的配置
 */
export function mergeConfigLayers(
  ...layers: Array<Partial<AdminConfig> | undefined>
): AdminConfig {
  const base: Record<string, unknown> = {};
  
  for (const layer of layers) {
    if (layer) {
      Object.assign(base, deepMerge(base, layer as Record<string, unknown>));
    }
  }
  
  return base as unknown as AdminConfig;
}

/**
 * 从环境变量中提取配置覆盖
 * 支持 VITE_ADMIN_* 前缀的环境变量
 */
export function extractEnvConfig(): Partial<AdminConfig> {
  const env = import.meta.env;
  const overrides: PartialAdminConfig = {};

  // App 配置
  if (env.VITE_ADMIN_APP_NAME) {
    overrides.app = { name: env.VITE_ADMIN_APP_NAME };
  }
  if (env.VITE_ADMIN_APP_THEME) {
    overrides.app = { 
      ...overrides.app, 
      theme: env.VITE_ADMIN_APP_THEME as 'dark' | 'light' | 'system' 
    };
  }

  // API 配置
  if (env.VITE_ADMIN_API_BASEURL) {
    overrides.api = { baseURL: env.VITE_ADMIN_API_BASEURL };
  }
  if (env.VITE_ADMIN_API_TIMEOUT) {
    overrides.api = { 
      ...overrides.api, 
      timeout: Number(env.VITE_ADMIN_API_TIMEOUT) 
    };
  }

  // Features 配置 - 支持逗号分隔的启用的功能列表
  if (env.VITE_ADMIN_FEATURES) {
    const enabledFeatures: string[] = env.VITE_ADMIN_FEATURES.split(',').map((f: string) => f.trim());
    const features: Record<string, boolean> = {};
    for (const feature of enabledFeatures) {
      features[feature] = true;
    }
    overrides.features = { ...overrides.features, ...features };
  }

  // Auth 配置
  if (env.VITE_ADMIN_AUTH_ENABLED) {
    overrides.auth = { 
      enabled: env.VITE_ADMIN_AUTH_ENABLED === 'true' 
    };
  }

  // Realtime 配置
  if (env.VITE_ADMIN_REALTIME_MODE) {
    overrides.realtime = { 
      mode: env.VITE_ADMIN_REALTIME_MODE as 'polling' | 'websocket' | 'sse' | 'hybrid' 
    };
  }

  return overrides as Partial<AdminConfig>;
}
