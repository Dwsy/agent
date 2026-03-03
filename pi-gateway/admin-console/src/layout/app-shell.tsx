import { AppShell as MantineAppShell } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useUIStore } from '../store/ui-store';

export function AppShell() {
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);

  return (
    <MantineAppShell
      header={{ height: 60 }}
      navbar={{
        width: 280,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileNavOpen },
      }}
      padding="md"
    >
      <Sidebar />
      <Topbar />
      <MantineAppShell.Main onClick={mobileNavOpen ? closeMobileNav : undefined}>
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
