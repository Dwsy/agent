import { LayoutDashboard, Bot, Plug, Settings, Bell, X } from 'lucide-react';
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
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 border-r border-slate-800 bg-panel p-3 transition-all duration-200',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        'w-72 md:static md:translate-x-0',
        collapsed ? 'md:w-20' : 'md:w-64'
      )}
    >
      <div className="mb-6 flex items-center justify-between px-2 py-3 text-sm font-semibold text-sky-300">
        <span className={collapsed ? 'md:hidden' : ''}>Pi Gateway</span>
        <button
          type="button"
          onClick={closeMobileNav}
          className="rounded border border-slate-700 p-1 text-slate-300 md:hidden"
          aria-label="Close navigation"
        >
          <X size={14} />
        </button>
      </div>

      <nav className="space-y-1">
        {menus.map((menu) => (
          <NavLink
            key={menu.to}
            to={menu.to}
            onClick={closeMobileNav}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800',
                isActive && 'bg-slate-800 text-white'
              )
            }
          >
            <menu.icon size={18} />
            {!collapsed ? <span>{menu.label}</span> : <span className="md:hidden">{menu.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
