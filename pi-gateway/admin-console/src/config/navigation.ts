/**
 * 导航配置
 * 定义所有可用的导航项及其属性
 */
import type { NavItem } from './schema';

/**
 * 默认导航配置
 * 按 order 排序，feature 用于功能开关控制
 */
export const defaultNavigation: NavItem[] = [
  {
    id: 'overview',
    path: '/',
    label: 'Overview',
    icon: 'LayoutDashboard',
    feature: 'overview',
    order: 0,
  },
  {
    id: 'agents',
    path: '/agents',
    label: 'Agents',
    icon: 'Bot',
    feature: 'agents',
    order: 1,
  },
  {
    id: 'plugins',
    path: '/plugins',
    label: 'Plugins',
    icon: 'Plug',
    feature: 'plugins',
    order: 2,
  },
  {
    id: 'alerts',
    path: '/alerts',
    label: 'Alerts',
    icon: 'Bell',
    feature: 'alerts',
    order: 3,
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    icon: 'Settings',
    feature: 'settings',
    order: 4,
  },
];

/**
 * 导航分组配置（用于扩展分组菜单）
 */
export const navigationGroups = [
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: 'Activity',
    items: ['overview', 'alerts'],
  },
  {
    id: 'management',
    label: 'Management',
    icon: 'Settings2',
    items: ['agents', 'plugins'],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'Server',
    items: ['settings'],
  },
];

/**
 * 获取导航项的辅助函数
 */
export function getNavItemById(id: string): NavItem | undefined {
  return defaultNavigation.find((nav) => nav.id === id);
}

export function getNavItemByPath(path: string): NavItem | undefined {
  return defaultNavigation.find((nav) => nav.path === path);
}

export function getNavItemsByFeature(feature: string): NavItem[] {
  return defaultNavigation.filter((nav) => nav.feature === feature);
}

/**
 * Lucide 图标名称映射（用于动态图标渲染）
 */
export const iconNameMap: Record<string, string> = {
  LayoutDashboard: 'LayoutDashboard',
  Bot: 'Bot',
  Plug: 'Plug',
  Bell: 'Bell',
  Settings: 'Settings',
  Activity: 'Activity',
  Settings2: 'Settings2',
  Server: 'Server',
  Clock: 'Clock',
  FileText: 'FileText',
  BarChart3: 'BarChart3',
  Shield: 'Shield',
};
