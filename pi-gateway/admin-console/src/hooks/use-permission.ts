/**
 * usePermission Hook
 * 权限检查 Hook，支持 * 通配符，兼容 config.permissions 结构
 */
import { useCallback, useMemo } from 'react';
import { useConfig } from '../config/config-provider';
import { useCurrentRole } from './use-auth';
import type { PermissionAction } from '../config/schema';

/**
 * 权限资源路径格式：resource:action
 * 示例：overview:view, agents:execute, gateway:reload
 */
export type PermissionResource = string;

/**
 * usePermission Hook 返回值
 */
interface UsePermissionReturn {
  /** 检查是否拥有指定权限 */
  hasPermission: (resource: PermissionResource, action: PermissionAction) => boolean;
  /** 批量检查权限（全部满足） */
  hasAllPermissions: (permissions: Array<{ resource: PermissionResource; action: PermissionAction }>) => boolean;
  /** 批量检查权限（任一满足） */
  hasAnyPermission: (permissions: Array<{ resource: PermissionResource; action: PermissionAction }>) => boolean;
  /** 检查是否有资源下的任意权限 */
  hasResourceAccess: (resource: PermissionResource) => boolean;
  /** 权限系统是否启用 */
  permissionsEnabled: boolean;
  /** 当前角色 */
  currentRole: string;
}

/**
 * 解析权限资源路径
 * 支持通配符：* 匹配任意 resource 或 action
 */
function parseResourcePath(path: string): { resource: string; action: string } {
  const parts = path.split(':');
  if (parts.length === 2) {
    return { resource: parts[0], action: parts[1] };
  }
  // 单段视为 resource:*
  return { resource: parts[0], action: '*' };
}

/**
 * 检查 action 是否匹配（支持 * 通配）
 */
function actionMatches(required: string, allowed: string): boolean {
  if (allowed === '*') return true;
  if (required === '*') return true;
  return allowed === required;
}

/**
 * 检查 resource 是否匹配（支持 * 通配）
 */
function resourceMatches(required: string, allowed: string): boolean {
  if (allowed === '*') return true;
  if (required === '*') return true;
  return allowed === required;
}

/**
 * 权限检查 Hook
 * @returns 权限检查相关的工具方法
 */
export function usePermission(): UsePermissionReturn {
  const { config } = useConfig();
  const currentRole = useCurrentRole();
  const { permissions } = config;

  /**
   * 检查是否拥有指定权限
   * 逻辑：
   * 1. 如果 permissions.enabled = false，直接放行
   * 2. 找到当前角色的权限配置
   * 3. 检查 resource:action 是否匹配（支持 * 通配）
   */
  const hasPermission = useCallback(
    (resource: PermissionResource, action: PermissionAction): boolean => {
      // 权限系统未启用，直接放行
      if (!permissions.enabled) {
        return true;
      }

      // 查找当前角色的权限配置
      const roleConfig = permissions.roles.find((r) => r.id === currentRole);
      if (!roleConfig) {
        // 角色未配置，回退到 defaultRole
        const defaultRoleConfig = permissions.roles.find((r) => r.id === permissions.defaultRole);
        if (!defaultRoleConfig) {
          return false;
        }
        return checkPermissionInRole(defaultRoleConfig.permissions, resource, action);
      }

      return checkPermissionInRole(roleConfig.permissions, resource, action);
    },
    [permissions, currentRole]
  );

  /**
   * 在角色权限配置中检查具体权限
   */
  const checkPermissionInRole = useCallback(
    (
      rolePermissions: Record<string, PermissionAction[]>,
      resource: PermissionResource,
      action: PermissionAction
    ): boolean => {
      const { resource: reqResource, action: reqAction } = parseResourcePath(resource);

      // 遍历角色的所有权限配置
      for (const [permResource, permActions] of Object.entries(rolePermissions)) {
        // 检查 resource 是否匹配
        if (resourceMatches(reqResource, permResource)) {
          // 检查 action 是否在允许列表中
          for (const permAction of permActions) {
            if (actionMatches(reqAction, permAction)) {
              return true;
            }
          }
        }
      }

      return false;
    },
    []
  );

  /**
   * 检查是否有资源下的任意权限
   */
  const hasResourceAccess = useCallback(
    (resource: PermissionResource): boolean => {
      return hasPermission(resource, 'view');
    },
    [hasPermission]
  );

  /**
   * 批量检查权限（全部满足）
   */
  const hasAllPermissions = useCallback(
    (perms: Array<{ resource: PermissionResource; action: PermissionAction }>): boolean => {
      return perms.every((p) => hasPermission(p.resource, p.action));
    },
    [hasPermission]
  );

  /**
   * 批量检查权限（任一满足）
   */
  const hasAnyPermission = useCallback(
    (perms: Array<{ resource: PermissionResource; action: PermissionAction }>): boolean => {
      return perms.some((p) => hasPermission(p.resource, p.action));
    },
    [hasPermission]
  );

  return useMemo(
    () => ({
      hasPermission,
      hasAllPermissions,
      hasAnyPermission,
      hasResourceAccess,
      permissionsEnabled: permissions.enabled,
      currentRole,
    }),
    [hasPermission, hasAllPermissions, hasAnyPermission, hasResourceAccess, permissions.enabled, currentRole]
  );
}

/**
 * 检查单个权限的 Hook（简化版）
 * @param resource - 权限资源
 * @param action - 权限动作
 * @returns 是否有权限
 */
export function useHasPermission(resource: PermissionResource, action: PermissionAction): boolean {
  const { hasPermission } = usePermission();
  return hasPermission(resource, action);
}

/**
 * 使用权限渲染条件
 * @param resource - 权限资源
 * @param action - 权限动作
 * @returns 条件渲染工具
 */
export function usePermissionRender(resource: PermissionResource, action: PermissionAction) {
  const hasPerm = useHasPermission(resource, action);

  return {
    allowed: hasPerm,
    /**
     * 有权限时渲染
     */
    whenAllowed: <T,>(renderFn: () => T): T | null => {
      return hasPerm ? renderFn() : null;
    },
    /**
     * 无权限时渲染
     */
    whenDenied: <T,>(renderFn: () => T): T | null => {
      return !hasPerm ? renderFn() : null;
    },
    /**
     * 条件渲染
     */
    conditional: <T,>(whenAllowed: T, whenDenied: T): T => {
      return hasPerm ? whenAllowed : whenDenied;
    },
  };
}
