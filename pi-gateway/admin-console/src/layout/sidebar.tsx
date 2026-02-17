import { LayoutDashboard, Bot, Plug, Settings, Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../store/ui-store';
import { cn } from '../lib/cn';

const menus = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/plugins', icon: Plug, label: 'Plugins' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/settings', icon: Settings, label: 'Settings' }
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <aside className={cn('border-r border-slate-800 bg-panel p-3 transition-all', collapsed ? 'w-20' : 'w-64')}>
      <div className="mb-6 px-2 py-3 text-sm font-semibold text-sky-300">Pi Gateway</div>
      <nav className="space-y-1">
        {menus.map((menu) => (
          <NavLink
            key={menu.to}
            to={menu.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800',
                isActive && 'bg-slate-800 text-white'
              )
            }
          >
            <menu.icon size={18} />
            {!collapsed ? <span>{menu.label}</span> : null}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
