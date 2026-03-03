import { Paper, type PaperProps } from '@mantine/core';
import type { PropsWithChildren } from 'react';

export function SurfaceCard({ children, ...props }: PropsWithChildren<PaperProps>) {
  return (
    <Paper p="md" {...props}>
      {children}
    </Paper>
  );
}
