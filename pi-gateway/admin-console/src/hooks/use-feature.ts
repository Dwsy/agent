/**
 * useFeature Hook
 * 提供功能开关相关的便捷访问
 */
import { useCallback, useMemo } from 'react';
import { useConfig } from '../config/config-provider';
import type { FeaturesConfig } from '../config/schema';

/**
 * useFeature Hook 返回值
 */
interface UseFeatureReturn {
  /** 检查单个功能是否启用 */
  isEnabled: (feature: keyof FeaturesConfig) => boolean;
  /** 检查所有功能是否都启用 */
  allEnabled: (...features: Array<keyof FeaturesConfig>) => boolean;
  /** 检查任一功能是否启用 */
  anyEnabled: (...features: Array<keyof FeaturesConfig>) => boolean;
  /** 获取所有启用的功能列表 */
  enabledFeatures: Array<keyof FeaturesConfig>;
  /** 获取所有禁用的功能列表 */
  disabledFeatures: Array<keyof FeaturesConfig>;
  /** 完整的 features 配置对象 */
  features: FeaturesConfig;
}

/**
 * 功能开关 Hook
 * @returns 功能开关相关的工具方法
 */
export function useFeature(): UseFeatureReturn {
  const { config, isFeatureEnabled } = useConfig();
  const { features } = config;

  /**
   * 检查单个功能
   */
  const isEnabled = useCallback(
    (feature: keyof FeaturesConfig): boolean => {
      return isFeatureEnabled(feature);
    },
    [isFeatureEnabled]
  );

  /**
   * 检查所有功能是否都启用
   */
  const allEnabled = useCallback(
    (...featureList: Array<keyof FeaturesConfig>): boolean => {
      return featureList.every((f) => features[f]);
    },
    [features]
  );

  /**
   * 检查任一功能是否启用
   */
  const anyEnabled = useCallback(
    (...featureList: Array<keyof FeaturesConfig>): boolean => {
      return featureList.some((f) => features[f]);
    },
    [features]
  );

  /**
   * 所有启用的功能
   */
  const enabledFeatures = useMemo(() => {
    return Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key as keyof FeaturesConfig);
  }, [features]);

  /**
   * 所有禁用的功能
   */
  const disabledFeatures = useMemo(() => {
    return Object.entries(features)
      .filter(([, enabled]) => !enabled)
      .map(([key]) => key as keyof FeaturesConfig);
  }, [features]);

  return {
    isEnabled,
    allEnabled,
    anyEnabled,
    enabledFeatures,
    disabledFeatures,
    features,
  };
}

/**
 * 使用单个功能的 Hook（简化版）
 * @param feature - 功能标识
 * @returns 是否启用
 */
export function useSingleFeature(feature: keyof FeaturesConfig): boolean {
  const { isFeatureEnabled } = useConfig();
  return isFeatureEnabled(feature);
}

/**
 * 功能开关条件渲染 Hook
 * @param feature - 功能标识
 * @returns 条件渲染工具
 */
export function useFeatureRender(feature: keyof FeaturesConfig) {
  const enabled = useSingleFeature(feature);

  return {
    enabled,
    /**
     * 功能开启时渲染
     */
    whenEnabled: <T,>(renderFn: () => T): T | null => {
      return enabled ? renderFn() : null;
    },
    /**
     * 功能关闭时渲染
     */
    whenDisabled: <T,>(renderFn: () => T): T | null => {
      return !enabled ? renderFn() : null;
    },
    /**
     * 条件渲染
     */
    conditional: <T,>(whenEnabled: T, whenDisabled: T): T => {
      return enabled ? whenEnabled : whenDisabled;
    },
  };
}

/**
 * 功能列表 Hook
 * 用于批量检查功能状态
 */
export function useFeatureList(
  featureList: Array<keyof FeaturesConfig>
): Record<string, boolean> {
  const { features } = useConfig().config;

  return useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const feature of featureList) {
      result[feature] = features[feature] ?? false;
    }
    return result;
  }, [features, featureList]);
}
