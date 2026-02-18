/**
 * 配置加载器
 * 负责从多个来源加载配置：本地文件、远程 API、环境变量
 */
import { defaultConfig } from './defaults';
import { deepMerge, extractEnvConfig } from './merge';
import { parseAndValidateConfig, validateConfigWithFallback, type ParseErrorCode } from './parser';
import type { AdminConfig } from './types';

/**
 * 配置加载选项
 */
export interface ConfigLoadOptions {
  /** 本地配置文件路径 */
  localConfigPath?: string;
  /** 远程配置 URL */
  remoteConfigUrl?: string;
  /** 是否启用环境变量覆盖 */
  enableEnvOverride?: boolean;
  /** 加载超时时间 */
  timeout?: number;
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  config: AdminConfig;
  sources: ConfigSource[];
  errors: ConfigLoadError[];
}

/**
 * 配置来源
 */
export interface ConfigSource {
  type: 'default' | 'local' | 'remote' | 'env';
  loaded: boolean;
  timestamp: number;
}

/**
 * 配置加载错误
 */
export interface ConfigLoadError {
  source: 'local' | 'remote' | 'unknown';
  code: ParseErrorCode;
  message: string;
}

/**
 * 默认加载选项
 */
const defaultOptions: Required<ConfigLoadOptions> = {
  localConfigPath: '/admin-console.config.json',
  remoteConfigUrl: '',
  enableEnvOverride: true,
  timeout: 5000,
};

/**
 * 加载本地配置文件
 */
async function loadLocalConfig(
  path: string,
  timeout: number
): Promise<{ success: boolean; config?: Partial<AdminConfig>; error?: ConfigLoadError }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(path, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: { source: 'local', code: 'NOT_FOUND' as ParseErrorCode, message: `Config file not found: ${path}` },
        };
      }
      return {
        success: false,
        error: { source: 'local', code: 'UNKNOWN' as ParseErrorCode, message: `HTTP ${response.status}` },
      };
    }

    const text = await response.text();
    const result = parseAndValidateConfig(text);

    if (result.success && result.data) {
      return { success: true, config: result.data };
    } else {
      return {
        success: false,
        error: {
          source: 'local',
          code: result.error?.code || ('UNKNOWN' as ParseErrorCode),
          message: result.error?.message || 'Validation failed',
        },
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: { source: 'local', code: 'NETWORK_ERROR' as ParseErrorCode, message: 'Request timeout' },
        };
      }
    }
    return {
      success: false,
      error: {
        source: 'local',
        code: 'NETWORK_ERROR' as ParseErrorCode,
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * 加载远程配置
 */
async function loadRemoteConfig(
  url: string,
  timeout: number
): Promise<{ success: boolean; config?: Partial<AdminConfig>; error?: ConfigLoadError }> {
  if (!url) {
    return { success: false };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: {
          source: 'remote',
          code: 'NETWORK_ERROR' as ParseErrorCode,
          message: `HTTP ${response.status}`,
        },
      };
    }

    const text = await response.text();
    const result = parseAndValidateConfig(text);

    if (result.success && result.data) {
      return { success: true, config: result.data };
    } else {
      return {
        success: false,
        error: {
          source: 'remote',
          code: result.error?.code || ('UNKNOWN' as ParseErrorCode),
          message: result.error?.message || 'Validation failed',
        },
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: { source: 'remote', code: 'NETWORK_ERROR' as ParseErrorCode, message: 'Request timeout' },
      };
    }
    return {
      success: false,
      error: {
        source: 'remote',
        code: 'NETWORK_ERROR' as ParseErrorCode,
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * 加载完整配置
 * 按优先级合并：default < local < remote < env
 */
export async function loadConfig(options?: ConfigLoadOptions): Promise<ConfigLoadResult> {
  const opts = { ...defaultOptions, ...options };
  const sources: ConfigSource[] = [];
  const errors: ConfigLoadError[] = [];

  // 1. 从默认配置开始
  let mergedConfig: Record<string, unknown> = { ...defaultConfig };
  sources.push({ type: 'default', loaded: true, timestamp: Date.now() });

  // 2. 加载本地配置
  const localResult = await loadLocalConfig(opts.localConfigPath, opts.timeout);
  if (localResult.success && localResult.config) {
    mergedConfig = deepMerge(mergedConfig, localResult.config as Record<string, unknown>);
    sources.push({ type: 'local', loaded: true, timestamp: Date.now() });
    console.log('[Config] Local config loaded from', opts.localConfigPath);
  } else if (localResult.error) {
    // 404 不算错误，只是文件不存在
    if (localResult.error.code !== 'NOT_FOUND') {
      errors.push(localResult.error);
      console.warn('[Config] Failed to load local config:', localResult.error.message);
    }
    sources.push({ type: 'local', loaded: false, timestamp: Date.now() });
  }

  // 3. 加载远程配置
  if (opts.remoteConfigUrl) {
    const remoteResult = await loadRemoteConfig(opts.remoteConfigUrl, opts.timeout);
    if (remoteResult.success && remoteResult.config) {
      mergedConfig = deepMerge(mergedConfig, remoteResult.config as Record<string, unknown>);
      sources.push({ type: 'remote', loaded: true, timestamp: Date.now() });
      console.log('[Config] Remote config loaded from', opts.remoteConfigUrl);
    } else if (remoteResult.error) {
      errors.push(remoteResult.error);
      console.warn('[Config] Failed to load remote config:', remoteResult.error.message);
      sources.push({ type: 'remote', loaded: false, timestamp: Date.now() });
    }
  }

  // 4. 环境变量覆盖
  if (opts.enableEnvOverride) {
    const envConfig = extractEnvConfig();
    if (Object.keys(envConfig).length > 0) {
      mergedConfig = deepMerge(mergedConfig, envConfig as Record<string, unknown>);
      sources.push({ type: 'env', loaded: true, timestamp: Date.now() });
      console.log('[Config] Environment overrides applied');
    }
  }

  // 5. 最终验证
  const finalConfig = validateConfigWithFallback(mergedConfig, defaultConfig);

  return {
    config: finalConfig,
    sources,
    errors,
  };
}

/**
 * 同步加载配置（用于初始化时的快速回退）
 * 仅使用默认配置 + 环境变量
 */
export function loadConfigSync(): ConfigLoadResult {
  const sources: ConfigSource[] = [];
  const errors: ConfigLoadError[] = [];

  // 1. 默认配置
  let mergedConfig: Record<string, unknown> = { ...defaultConfig };
  sources.push({ type: 'default', loaded: true, timestamp: Date.now() });

  // 2. 环境变量覆盖
  try {
    const envConfig = extractEnvConfig();
    if (Object.keys(envConfig).length > 0) {
      mergedConfig = deepMerge(mergedConfig, envConfig as Record<string, unknown>);
      sources.push({ type: 'env', loaded: true, timestamp: Date.now() });
    }
  } catch (error) {
    console.warn('[Config] Failed to extract env config:', error);
  }

  // 3. 最终验证
  const finalConfig = validateConfigWithFallback(mergedConfig, defaultConfig);

  return {
    config: finalConfig,
    sources,
    errors,
  };
}
