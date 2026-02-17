/**
 * Auth Store - 权限状态管理
 * 最小可用：currentRole + setRole
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 预定义角色类型
 */
export type RoleId = 'admin' | 'operator' | 'viewer' | string;

/**
 * Auth 状态
 */
interface AuthState {
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
}

/**
 * 创建 Auth Store
 * 使用 persist 中间件持久化角色到 localStorage
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentRole: 'viewer',
      isAuthenticated: false,
      setRole: (role) => set({ currentRole: role }),
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      logout: () => set({ currentRole: 'viewer', isAuthenticated: false }),
    }),
    {
      name: 'admin-console-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ currentRole: state.currentRole }),
    }
  )
);

/**
 * 获取当前角色（非 Hook 版本，用于非 React 上下文）
 */
export function getCurrentRole(): RoleId {
  const state = useAuthStore.getState();
  return state.currentRole;
}

/**
 * 设置当前角色（非 Hook 版本）
 */
export function setCurrentRole(role: RoleId): void {
  useAuthStore.getState().setRole(role);
}
