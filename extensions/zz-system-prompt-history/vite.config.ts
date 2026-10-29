import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  root: __dirname,
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'psm/host-react.ts'),
      '@pi-session-manager/plugin-sdk': '/Users/dengwenyu/Dev/AI/pi-session-manager/packages/runtime-sdk/src/index.ts',
    },
  },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  build: {
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, 'psm/index.tsx'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
  },
}
