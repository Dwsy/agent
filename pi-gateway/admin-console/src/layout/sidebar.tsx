import { AppShell, NavLink, ScrollArea, Text } from '@mantine/core';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Plug,
  Settings,
  Bell,
  BarChart3,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConfig } from '../config/config-provider';
import { useUIStore } from '../store/ui-store';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Plug,
  Bell,
  Settings,
  BarChart3,
};

export function Sidebar() {
  const { navigation, config } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);

  return (
    <AppShell.Navbar p="sm">
      <AppShell.Section>
        <Text fw={700} c="blue" size="sm" px="xs" py="sm">
          {config.app.name}
        </Text>
      </AppShell.Section>

      <AppShell.Section grow component={ScrollArea} mt="sm">
        {navigation.map((item) => {
          const Icon = iconMap[item.icon] ?? LayoutDashboard;
          const active =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.id}
              active={active}
              label={item.label}
              leftSection={<Icon size={16} />}
              onClick={() => {
                navigate(item.path);
                closeMobileNav();
              }}
            />
          );
        })}
      </AppShell.Section>
    </AppShell.Navbar>
  );
}
