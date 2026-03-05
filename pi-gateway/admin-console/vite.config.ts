import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  base: '/web/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5176,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: '',
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
          'vendor-query': ['@tanstack/react-query', 'axios'],
          'vendor-charts': ['recharts'],
          'vendor-markdown': ['marked'],
        },
      },
    },
  },
});
