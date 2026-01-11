import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  
  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@stores': path.resolve(__dirname, './src/stores'),
      'codemap': path.resolve(__dirname, './src/types/codemap'),
    },
  },
  
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    // Ignore Monaco source map 404 errors
    hmr: {
      overlay: false
    }
  },
  
  // Environment variables
  envPrefix: ['VITE_', 'TAURI_'],
  
  // Build options
  build: {
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: false, // 禁用 sourcemap 以避免 Monaco 404 错误
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor', '@monaco-editor/react']
        }
      },
      onwarn(warning, warn) {
        // Ignore Monaco source map warnings
        if (warning.code === 'MODULE_NOT_FOUND' && warning.message.includes('monaco-editor')) {
          return
        }
        warn(warning)
      }
    }
  },
}))