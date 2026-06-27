import { ActionIcon, AppShell, Group, Text } from '@mantine/core';
import { Menu } from 'lucide-react';
import { useUIStore } from '../store/ui-store';
import { ThemeToggle } from '../components/atoms/theme-toggle';
import { useConfig } from '../config/config-provider';

export function Topbar() {
  const openMobileNav = useUIStore((s) => s.openMobileNav);
  const { config } = useConfig();

  return (
    <AppShell.Header p="sm">
      <Group h="100%" justify="space-between" align="center">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={openMobileNav}
            hiddenFrom="sm"
            aria-label="open navigation"
          >
            <Menu size={16} />
          </ActionIcon>
          <Text fw={600} size="sm">
            {config.app.name} Console
          </Text>
          <Text c="dimmed" size="xs" visibleFrom="sm">
            Runtime operations
          </Text>
        </Group>
        <ThemeToggle />
      </Group>
    </AppShell.Header>
  );
}
