import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useUIStore } from '../store/ui-store';

export function AppShell() {
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {mobileNavOpen ? <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={closeMobileNav} /> : null}
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:ml-0">
        <Topbar />
        <main className="flex-1 overflow-auto p-3 md:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
