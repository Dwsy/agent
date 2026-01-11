// 配置 Monaco Editor 使用本地版本，不使用 CDN
export const monacoConfig = {
  paths: {
    vs: '/node_modules/monaco-editor/min/vs'
  }
}

// 在应用启动时配置
if (typeof window !== 'undefined') {
  (window as any).MonacoEnvironment = {
    getWorker: function (workerId: string, label: string) {
      return new Worker(
        new URL('../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
        {
          type: 'module',
        }
      )
    }
  }
}