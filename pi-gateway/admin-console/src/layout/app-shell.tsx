import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
