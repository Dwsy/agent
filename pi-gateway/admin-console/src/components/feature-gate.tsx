/**
 * FeatureGate - 功能开关门控组件
 * 根据配置中的 features 控制子组件的显示/隐藏
 */
import React, { type ReactNode } from 'react';
import { useConfig } from '../config/config-provider';
import type { FeaturesConfig } from '../config/schema';

/**
 * FeatureGate 组件 Props
 */
interface FeatureGateProps {
  /** 功能标识 */
  feature: keyof FeaturesConfig;
  /** 功能开启时显示的内容 */
  children: ReactNode;
  /** 功能关闭时显示的内容（可选） */
  fallback?: ReactNode;
  /** 是否在加载时显示占位 */
  showLoading?: boolean;
  /** 加载占位 */
  loadingPlaceholder?: ReactNode;
}

/**
 * FeatureGate 组件
 * 用于条件渲染基于功能开关的内容
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
  showLoading = false,
  loadingPlaceholder = null,
}: FeatureGateProps) {
  const { isFeatureEnabled, isLoading } = useConfig();

  // 配置加载中
  if (isLoading && showLoading) {
    return <>{loadingPlaceholder}</>;
  }

  // 检查功能开关
  const enabled = isFeatureEnabled(feature);

  if (enabled) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * FeatureGate 反向（功能关闭时显示）
 */
export function FeatureGateOff({
  feature,
  children,
  fallback = null,
}: Omit<FeatureGateProps, 'showLoading' | 'loadingPlaceholder'>) {
  return (
    <FeatureGate feature={feature} fallback={children}>
      {fallback}
    </FeatureGate>
  );
}

/**
 * 多 Feature 模式：any = 任一开启, all = 全部开启
 */
interface MultiFeatureGateProps extends Omit<FeatureGateProps, 'feature'> {
  features: Array<keyof FeaturesConfig>;
  mode: 'any' | 'all';
}

export function MultiFeatureGate({
  features,
  mode,
  children,
  fallback = null,
}: MultiFeatureGateProps) {
  const { config } = useConfig();

  const enabled =
    mode === 'any'
      ? features.some((f) => config.features[f])
      : features.every((f) => config.features[f]);

  if (enabled) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * HOC: 为组件添加功能门控
 */
export function withFeature<P extends object>(
  Component: React.ComponentType<P>,
  feature: keyof FeaturesConfig,
  fallback?: ReactNode
): React.FC<P> {
  return function WithFeatureComponent(props: P) {
    return (
      <FeatureGate feature={feature} fallback={fallback}>
        <Component {...props} />
      </FeatureGate>
    );
  };
}

/**
 * 功能未启用占位组件
 */
export function FeatureDisabledPlaceholder({
  feature,
  message,
}: {
  feature?: string;
  message?: string;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
      <div className="mb-4 rounded-full bg-slate-800 p-3">
        <svg
          className="h-6 w-6 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
      <h3 className="mb-2 text-sm font-medium text-slate-300">
        Feature Not Available
      </h3>
      <p className="max-w-xs text-xs text-slate-500">
        {message || `The "${feature || 'requested'}" feature is currently disabled.`}
      </p>
    </div>
  );
}

/**
 * 404 Not Found 占位（用于功能关闭时的路由）
 */
export function NotFoundPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-6">
        <span className="text-6xl font-bold text-slate-700">404</span>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-slate-200">Page Not Found</h2>
      <p className="mb-6 max-w-md text-sm text-slate-400">
        The page you are looking for does not exist or has been disabled.
      </p>
      <a
        href="/"
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
      >
        Go to Overview
      </a>
    </div>
  );
}
