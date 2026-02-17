/**
 * ConfigProvider - 配置上下文提供者
 * 统一加载并校验配置，向子组件提供配置访问能力
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { loadConfig, loadConfigSync, type ConfigLoadResult } from './loader';
import { defaultConfig } from './defaults';
import type { AdminConfig } from './types';
import type { FeaturesConfig, NavItem } from './schema';
import { defaultNavigation } from './navigation';

/**
 * 配置上下文状态
 */
interface ConfigContextState {
  /** 当前配置 */
  config: AdminConfig;
  /** 是否加载中 */
  isLoading: boolean;
  /** 加载错误 */
  error: Error | null;
  /** 配置来源 */
  sources: ConfigLoadResult['sources'];
  /** 重新加载配置 */
  reload: () => Promise<void>;
  /** 获取功能开关状态 */
  isFeatureEnabled: (feature: keyof FeaturesConfig) => boolean;
  /** 获取导航配置 */
  navigation: NavItem[];
}

/**
 * 配置上下文
 */
const ConfigContext = createContext<ConfigContextState | undefined>(undefined);

/**
 * 配置 Provider Props
 */
interface ConfigProviderProps {
  children: React.ReactNode;
  /** 加载选项 */
  localConfigPath?: string;
  remoteConfigUrl?: string;
  enableEnvOverride?: boolean;
  /** 加载超时 */
  timeout?: number;
  /** 启用日志 */
  enableLogging?: boolean;
}

/**
 * ConfigProvider 组件
 */
export function ConfigProvider({
  children,
  localConfigPath,
  remoteConfigUrl,
  enableEnvOverride = true,
  timeout = 5000,
  enableLogging = true,
}: ConfigProviderProps) {
  const [config, setConfig] = useState<AdminConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sources, setSources] = useState<ConfigLoadResult['sources']>([]);

  // 日志函数
  const log = useCallback(
    (level: 'log' | 'warn' | 'error', ...args: unknown[]) => {
      if (enableLogging) {
        console[level]('[ConfigProvider]', ...args);
      }
    },
    [enableLogging]
  );

  // 加载配置
  const loadConfiguration = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadConfig({
        localConfigPath,
        remoteConfigUrl,
        enableEnvOverride,
        timeout,
      });

      setConfig(result.config);
      setSources(result.sources);

      if (result.errors.length > 0) {
        log('warn', 'Config loading had errors:', result.errors);
      } else {
        log('log', 'Config loaded successfully from:', result.sources.map((s) => s.type).join(', '));
      }
    } catch (err) {
      const loadError = err instanceof Error ? err : new Error(String(err));
      setError(loadError);
      log('error', 'Failed to load config:', loadError);

      // 出错时回退到同步加载
      const fallback = loadConfigSync();
      setConfig(fallback.config);
      setSources(fallback.sources);
    } finally {
      setIsLoading(false);
    }
  }, [localConfigPath, remoteConfigUrl, enableEnvOverride, timeout, log]);

  // 重新加载
  const reload = useCallback(async () => {
    log('log', 'Reloading configuration...');
    await loadConfiguration();
  }, [loadConfiguration, log]);

  // 检查功能开关
  const isFeatureEnabled = useCallback(
    (feature: keyof FeaturesConfig): boolean => {
      return config.features[feature] ?? false;
    },
    [config.features]
  );

  // 计算可用导航（根据功能开关过滤）
  const navigation = useMemo(() => {
    return defaultNavigation
      .filter((nav) => isFeatureEnabled(nav.feature as keyof FeaturesConfig))
      .sort((a, b) => a.order - b.order);
  }, [isFeatureEnabled]);

  // 初始加载
  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  // 上下文值
  const value = useMemo(
    () => ({
      config,
      isLoading,
      error,
      sources,
      reload,
      isFeatureEnabled,
      navigation,
    }),
    [config, isLoading, error, sources, reload, isFeatureEnabled, navigation]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/**
 * 使用配置的 Hook
 */
export function useConfig(): ConfigContextState {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

/**
 * 使用特定配置段的 Hook
 */
export function useConfigSection<T extends keyof AdminConfig>(section: T): AdminConfig[T] {
  const { config } = useConfig();
  return config[section];
}

/**
 * HOC: 注入配置
 */
export function withConfig<P extends object>(
  Component: React.ComponentType<P & { config: AdminConfig }>
): React.FC<P> {
  return function WithConfigComponent(props: P) {
    const { config } = useConfig();
    return <Component {...props} config={config} />;
  };
}
