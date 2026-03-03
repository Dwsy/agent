import { createTheme, rem } from '@mantine/core';

export const adminTheme = createTheme({
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  primaryColor: 'blue',
  defaultRadius: 'md',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    sizes: {
      h1: { fontSize: rem(26), lineHeight: '1.2', fontWeight: '700' },
      h2: { fontSize: rem(20), lineHeight: '1.25', fontWeight: '650' },
      h3: { fontSize: rem(16), lineHeight: '1.3', fontWeight: '600' },
    },
  },
  components: {
    Paper: {
      defaultProps: {
        withBorder: true,
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        withBorder: true,
        radius: 'md',
      },
    },
  },
});
