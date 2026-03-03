import { ActionIcon, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const isDark = computed === 'dark';

  return (
    <Tooltip label={isDark ? '切换到浅色模式' : '切换到深色模式'}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label="切换主题"
        onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}
