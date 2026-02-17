/**
 * PermissionGate - 权限门控组件
 * 根据配置中的 permissions 控制子组件的显示/隐藏
 * 支持 * 通配符，permissions.enabled=false 时放行
 */
import React, { type ReactNode, useEffect } from 'react';
import { usePermission, type PermissionResource } from '../hooks/use-permission';
import type { PermissionAction } from '../config/schema';
import { trackPermissionEvent } from '../hooks/use-observability';

/**
 * PermissionGate 组件 Props
 */
interface PermissionGateProps {
  /** 权限资源，格式：resource:action 或 resource（默认 action=view） */
  resource: PermissionResource;
  /** 权限动作，默认 'view' */
  action?: PermissionAction;
  /** 有权限时显示的内容 */
  children: ReactNode;
  /** 无权限时显示的内容（可选） */
  fallback?: ReactNode;
  /** 是否在加载时显示占位 */
  showLoading?: boolean;
  /** 加载占位 */
  loadingPlaceholder?: ReactNode;
}

/**
 * PermissionGate 组件
 * 用于条件渲染基于权限控制的内容
 * 
 * 示例：
 * <PermissionGate resource="gateway" action="reload">
 *   <button>Reload</button>
 * </PermissionGate>
 * 
 * <PermissionGate resource="gateway:restart" fallback={<DisabledButton />}>
 *   <button>Restart</button>
 * </PermissionGate>
 */
export function PermissionGate({
  resource,
  action = 'view',
  children,
  fallback = null,
  showLoading = false,
  loadingPlaceholder = null,
}: PermissionGateProps) {
  const { hasPermission, permissionsEnabled } = usePermission();

  // 权限系统未启用，直接显示
  if (!permissionsEnabled) {
    return <>{children}</>;
  }

  // 检查权限
  const allowed = hasPermission(resource, action);

  // 追踪权限拒绝事件
  useEffect(() => {
    if (!allowed && fallback !== null) {
      trackPermissionEvent('warn', `Permission denied: ${resource}:${action}`, {
        resource,
        action,
      });
    }
  }, [allowed, resource, action, fallback]);

  if (allowed) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * PermissionGate 反向（无权限时显示）
 */
export function PermissionGateDenied({
  resource,
  action = 'view',
  children,
  fallback = null,
}: Omit<PermissionGateProps, 'showLoading' | 'loadingPlaceholder'>) {
  return (
    <PermissionGate resource={resource} action={action} fallback={children}>
      {fallback}
    </PermissionGate>
  );
}

/**
 * 多权限模式：any = 任一权限满足, all = 全部权限满足
 */
interface MultiPermissionGateProps extends Omit<PermissionGateProps, 'resource' | 'action'> {
  /** 权限列表 */
  permissions: Array<{ resource: PermissionResource; action?: PermissionAction }>;
  /** 检查模式 */
  mode: 'any' | 'all';
}

export function MultiPermissionGate({
  permissions,
  mode,
  children,
  fallback = null,
}: MultiPermissionGateProps) {
  const { hasPermission, permissionsEnabled } = usePermission();

  // 权限系统未启用，直接显示
  if (!permissionsEnabled) {
    return <>{children}</>;
  }

  const allowed =
    mode === 'any'
      ? permissions.some((p) => hasPermission(p.resource, p.action ?? 'view'))
      : permissions.every((p) => hasPermission(p.resource, p.action ?? 'view'));

  if (allowed) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * HOC: 为组件添加权限门控
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  resource: PermissionResource,
  action: PermissionAction = 'view',
  fallback?: ReactNode
): React.FC<P> {
  return function WithPermissionComponent(props: P) {
    return (
      <PermissionGate resource={resource} action={action} fallback={fallback}>
        <Component {...props} />
      </PermissionGate>
    );
  };
}

/**
 * 权限不足占位组件
 */
export function PermissionDeniedPlaceholder({
  resource,
  message,
}: {
  resource?: string;
  message?: string;
}) {
  return (
    <div className="flex h-16 flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-center">
      <div className="mb-2 rounded-full bg-slate-800 p-2">
        <svg
          className="h-4 w-4 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <p className="text-xs text-slate-500">
        {message || `Permission denied${resource ? `: ${resource}` : ''}`}
      </p>
    </div>
  );
}

/**
 * 禁用状态包装组件
 * 无权限时给子元素添加 disabled 状态和提示样式
 */
interface PermissionDisabledWrapperProps {
  resource: PermissionResource;
  action?: PermissionAction;
  children: React.ReactElement<{ disabled?: boolean; className?: string }>;
  disabledClassName?: string;
}

export function PermissionDisabledWrapper({
  resource,
  action = 'view',
  children,
  disabledClassName = 'opacity-50 cursor-not-allowed',
}: PermissionDisabledWrapperProps) {
  const { hasPermission, permissionsEnabled } = usePermission();

  // 权限系统未启用，直接返回子元素
  if (!permissionsEnabled) {
    return children;
  }

  const allowed = hasPermission(resource, action);

  if (allowed) {
    return children;
  }

  // 克隆子元素并添加 disabled 状态
  return React.cloneElement(children, {
    disabled: true,
    className: `${children.props.className ?? ''} ${disabledClassName}`.trim(),
  });
}
