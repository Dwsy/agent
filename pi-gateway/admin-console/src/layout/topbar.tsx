import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '../store/ui-store';

export function Topbar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const openMobileNav = useUIStore((s) => s.openMobileNav);

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openMobileNav}
          className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={16} />
        </button>
        <button
          type="button"
          onClick={toggle}
          className="hidden rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 md:inline-flex"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <div className="text-xs text-slate-400">Controller Shell v0.2</div>
    </header>
  );
}
