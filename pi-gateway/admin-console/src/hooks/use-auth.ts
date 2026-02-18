/**
 * useAuth Hook
 * 提供认证相关的便捷访问
 */
import { useCallback, useMemo } from 'react';
import { useAuthStore, type RoleId } from '../store/auth-store';

/**
 * useAuth Hook 返回值
 */
interface UseAuthReturn {
  /** 当前角色 ID */
  currentRole: RoleId;
  /** 是否已认证 */
  isAuthenticated: boolean;
  /** 设置当前角色 */
  setRole: (role: RoleId) => void;
  /** 设置认证状态 */
  setAuthenticated: (value: boolean) => void;
  /** 登出 */
  logout: () => void;
  /** 检查是否为指定角色 */
  isRole: (role: RoleId) => boolean;
  /** 检查是否为任意指定角色之一 */
  isAnyRole: (...roles: RoleId[]) => boolean;
}

/**
 * 认证 Hook
 * @returns 认证相关的工具方法
 */
export function useAuth(): UseAuthReturn {
  const { currentRole, isAuthenticated, setRole, setAuthenticated, logout } = useAuthStore();

  /**
   * 检查是否为指定角色
   */
  const isRole = useCallback(
    (role: RoleId): boolean => {
      return currentRole === role;
    },
    [currentRole]
  );

  /**
   * 检查是否为任意指定角色之一
   */
  const isAnyRole = useCallback(
    (...roles: RoleId[]): boolean => {
      return roles.includes(currentRole);
    },
    [currentRole]
  );

  return useMemo(
    () => ({
      currentRole,
      isAuthenticated,
      setRole,
      setAuthenticated,
      logout,
      isRole,
      isAnyRole,
    }),
    [currentRole, isAuthenticated, setRole, setAuthenticated, logout, isRole, isAnyRole]
  );
}

/**
 * 使用当前角色的 Hook（简化版）
 * @returns 当前角色 ID
 */
export function useCurrentRole(): RoleId {
  return useAuthStore((state) => state.currentRole);
}

/**
 * 使用认证状态的 Hook（简化版）
 * @returns 是否已认证
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.isAuthenticated);
}
