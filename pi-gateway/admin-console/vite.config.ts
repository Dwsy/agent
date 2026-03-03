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
    outDir: '../src/web',
    emptyOutDir: true,
    assetsDir: '',
    sourcemap: false,
    target: 'es2022',
  },
});
