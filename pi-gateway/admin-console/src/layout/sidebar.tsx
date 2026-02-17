import { X, LayoutDashboard, Bot, Plug, Settings, Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../store/ui-store';
import { useConfig } from '../config/config-provider';
import { cn } from '../lib/cn';
import type { LucideIcon } from 'lucide-react';

/**
 * 静态图标映射表
 * 避免动态导入的类型问题
 */
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Bot,
  Plug,
  Bell,
  Settings,
};

/**
 * 动态图标组件
 */
function DynamicIcon({ name, size = 18 }: { name: string; size?: number }) {
  const IconComponent = iconMap[name];
  
  if (!IconComponent) {
    // 默认返回一个占位图标
    return <div style={{ width: size, height: size }} className="bg-slate-700 rounded" />;
  }
  
  return <IconComponent size={size} />;
}

/**
 * 侧边栏组件
 * 根据配置动态生成导航菜单
 */
export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);
  
  // 从配置获取动态导航和应用名称
  const { config, navigation, isLoading } = useConfig();
  const appName = config.app.name;

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 border-r border-slate-800 bg-panel p-3 transition-all duration-200',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        'w-72 md:static md:translate-x-0',
        collapsed ? 'md:w-20' : 'md:w-64'
      )}
    >
      {/* Logo/标题区域 */}
      <div className="mb-6 flex items-center justify-between px-2 py-3 text-sm font-semibold text-sky-300">
        <span className={cn(collapsed && 'md:hidden')}>{appName}</span>
        <button
          type="button"
          onClick={closeMobileNav}
          className="rounded border border-slate-700 p-1 text-slate-300 md:hidden"
          aria-label="Close navigation"
        >
          <X size={14} />
        </button>
      </div>

      {/* 动态导航菜单 */}
      <nav className="space-y-1">
        {isLoading ? (
          // 加载占位
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
              >
                <div className="h-4 w-4 rounded bg-slate-800 animate-pulse" />
                {!collapsed && (
                  <div className="h-4 w-20 rounded bg-slate-800 animate-pulse" />
                )}
              </div>
            ))}
          </>
        ) : (
          // 动态渲染导航项
          navigation.map((menu) => (
            <NavLink
              key={menu.id}
              to={menu.path}
              onClick={closeMobileNav}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors',
                  isActive && 'bg-slate-800 text-white'
                )
              }
            >
              <DynamicIcon name={menu.icon} size={18} />
              {!collapsed ? (
                <span>{menu.label}</span>
              ) : (
                <span className="md:hidden">{menu.label}</span>
              )}
            </NavLink>
          ))
        )}
      </nav>

      {/* 版本信息（可选） */}
      {!collapsed && config.app.version && (
        <div className="absolute bottom-4 left-3 right-3">
          <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
            <p className="text-xs text-slate-500">
              Version: {config.app.version}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
