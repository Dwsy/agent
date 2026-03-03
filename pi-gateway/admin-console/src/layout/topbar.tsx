import { ActionIcon, AppShell, Group, Text } from '@mantine/core';
import { Menu } from 'lucide-react';
import { useUIStore } from '../store/ui-store';
import { ThemeToggle } from '../components/atoms/theme-toggle';

export function Topbar() {
  const openMobileNav = useUIStore((s) => s.openMobileNav);

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
          <Text c="dimmed" size="sm">
            Controller Shell (Mantine)
          </Text>
        </Group>
        <ThemeToggle />
      </Group>
    </AppShell.Header>
  );
}
