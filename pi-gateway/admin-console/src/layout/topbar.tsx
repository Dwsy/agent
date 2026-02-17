import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '../store/ui-store';

export function Topbar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <div className="text-xs text-slate-400">Controller Shell v0.1</div>
    </header>
  );
}
