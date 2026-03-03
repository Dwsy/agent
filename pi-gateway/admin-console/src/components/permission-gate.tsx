import { Alert, ThemeIcon } from '@mantine/core';
import { Lock } from 'lucide-react';
import React, { type ReactNode, useEffect } from 'react';
import { usePermission, type PermissionResource } from '../hooks/use-permission';
import type { PermissionAction } from '../config/schema';
import { trackPermissionEvent } from '../hooks/use-observability';

interface PermissionGateProps {
  resource: PermissionResource;
  action?: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
  loadingPlaceholder?: ReactNode;
}

export function PermissionGate({
  resource,
  action = 'view',
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, permissionsEnabled } = usePermission();

  if (!permissionsEnabled) return <>{children}</>;

  const allowed = hasPermission(resource, action);

  useEffect(() => {
    if (!allowed && fallback !== null) {
      trackPermissionEvent('warn', `Permission denied: ${resource}:${action}`, {
        resource,
        action,
      });
    }
  }, [allowed, resource, action, fallback]);

  return allowed ? <>{children}</> : <>{fallback}</>;
}

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

interface MultiPermissionGateProps extends Omit<PermissionGateProps, 'resource' | 'action'> {
  permissions: Array<{ resource: PermissionResource; action?: PermissionAction }>;
  mode: 'any' | 'all';
}

export function MultiPermissionGate({ permissions, mode, children, fallback = null }: MultiPermissionGateProps) {
  const { hasPermission, permissionsEnabled } = usePermission();
  if (!permissionsEnabled) return <>{children}</>;

  const allowed =
    mode === 'any'
      ? permissions.some((permission) => hasPermission(permission.resource, permission.action ?? 'view'))
      : permissions.every((permission) => hasPermission(permission.resource, permission.action ?? 'view'));

  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  resource: PermissionResource,
  action: PermissionAction = 'view',
  fallback?: ReactNode,
): React.FC<P> {
  return function WithPermissionComponent(props: P) {
    return (
      <PermissionGate resource={resource} action={action} fallback={fallback}>
        <Component {...props} />
      </PermissionGate>
    );
  };
}

export function PermissionDeniedPlaceholder({ resource, message }: { resource?: string; message?: string }) {
  return (
    <Alert icon={<Lock size={16} />} color="gray" variant="light" title="Permission denied">
      {message || `No permission${resource ? `: ${resource}` : ''}`}
    </Alert>
  );
}

interface PermissionDisabledWrapperProps {
  resource: PermissionResource;
  action?: PermissionAction;
  children: React.ReactElement<{ disabled?: boolean }>;
}

export function PermissionDisabledWrapper({ resource, action = 'view', children }: PermissionDisabledWrapperProps) {
  const { hasPermission, permissionsEnabled } = usePermission();
  if (!permissionsEnabled) return children;

  const allowed = hasPermission(resource, action);
  if (allowed) return children;

  return React.cloneElement(children, {
    disabled: true,
  });
}
