import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { CodeMap, CodeMapMeta, ViewMode, SuggestedTopic, PanelLayout, CodeRef, ModelTier, EdgeType, SnapshotMode } from 'codemap'

// 代码导航相关类型
interface ActiveFile {
  path: string
  content: string
  language: string
}

interface NavigationTarget {
  path: string
  startLine: number
  endLine: number
  symbol?: string
  sourceNodeId: string
}

export interface CodeAnnotation {
  line: number
  message: string
  kind: 'info' | 'warn' | 'todo'
  nodeId: string
}

// 语言推断函数
const inferLanguage = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    'rs': 'rust',
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'vue': 'vue',
    'sql': 'sql',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sh': 'shell',
    'bash': 'shell',
  }
  return langMap[ext] || 'plaintext'
}

// 计算文件的批注
const computeAnnotationsForFile = (codemap: CodeMap | null, filePath: string): CodeAnnotation[] => {
  if (!codemap) return []

  const annotations: CodeAnnotation[] = []

  for (const node of codemap.nodes) {
    for (const ref of node.code_refs) {
      if (ref.path === filePath) {
        annotations.push({
          line: ref.start_line,
          message: `[${node.title}] ${ref.symbol || `Lines ${ref.start_line}-${ref.end_line}`}`,
          kind: 'info',
          nodeId: node.node_id
        })
      }
    }
  }

  return annotations
}

/**
 * CodeMap Store
 * 使用 Zustand + Immer 管理应用状态
 */

// Helper: Normalize file path
const normalizePath = (filePath: string, projectRoot: string): string => {
  if (!filePath) return filePath
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedRoot = projectRoot.replace(/\\/g, '/')
  if (normalizedPath.startsWith(normalizedRoot)) {
    return normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '')
  }
  return normalizedPath
}

// Helper: Convert traces to nodes
const convertTracesToNodes = (traces: any[], projectRoot: string): CodeMap['nodes'] => {
  const nodes: CodeMap['nodes'] = []

  traces.forEach((trace: any, traceIndex: number) => {
    const traceId = trace.id ?? `${traceIndex + 1}`
    const traceNodeId = `trace_${traceId}`

    // Build trace guide from traceGuide string or object
    let traceGuideShort = trace.description || ''
    let traceGuideLong = ''

    if (trace.traceGuide) {
      if (typeof trace.traceGuide === 'string') {
        traceGuideLong = trace.traceGuide
      } else if (typeof trace.traceGuide === 'object') {
        traceGuideShort = trace.traceGuide.motivation || trace.description || ''
        traceGuideLong = `## Motivation\n${trace.traceGuide.motivation || ''}\n\n## Details\n${trace.traceGuide.details || ''}`
      }
    }

    const traceNode: CodeMap['nodes'][0] = {
      node_id: traceNodeId,
      title: trace.title || `Trace ${traceIndex + 1}`,
      summary: trace.description || '',
      children: [],
      code_refs: [],
      trace_guide: {
        short: traceGuideShort,
        long: traceGuideLong,
      },
    }

    const locations = Array.isArray(trace.locations) ? trace.locations : []
    locations.forEach((loc: any, locIndex: number) => {
      const locId = loc.id ?? `${locIndex + 1}`
      const locNodeId = `loc_${traceNodeId}_${locId}`
      const startLine = Number(loc.lineNumber ?? loc.line_number ?? 1)

      const codeRef: CodeRef = {
        path: normalizePath(String(loc.path || ''), projectRoot),
        start_line: startLine,
        end_line: startLine,
        symbol: loc.title || undefined,
      }

      traceNode.children.push(locNodeId)
      traceNode.code_refs.push(codeRef)

      nodes.push({
        node_id: locNodeId,
        title: loc.title || `Location ${locIndex + 1}`,
        summary: loc.description || '',
        children: [],
        code_refs: [codeRef],
        trace_guide: {
          short: loc.description || '',
          long: loc.lineContent || '',
        },
      })
    })

    nodes.push(traceNode)
  })

  return nodes
}

// Helper: Convert traces to edges
const convertTracesToEdges = (traces: any[]): CodeMap['edges'] => {
  const edges: CodeMap['edges'] = []
  let previousTraceNodeId: string | null = null

  traces.forEach((trace: any, traceIndex: number) => {
    const traceId = trace.id ?? `${traceIndex + 1}`
    const traceNodeId = `trace_${traceId}`

    // Connect trace to locations
    const locations = Array.isArray(trace.locations) ? trace.locations : []
    locations.forEach((loc: any, locIndex: number) => {
      const locId = loc.id ?? `${locIndex + 1}`
      const locNodeId = `loc_${traceNodeId}_${locId}`

      edges.push({
        from: traceNodeId,
        to: locNodeId,
        edge_type: EdgeType.Calls,
      })
    })

    // Connect traces sequentially
    if (previousTraceNodeId) {
      edges.push({
        from: previousTraceNodeId,
        to: traceNodeId,
        edge_type: EdgeType.Calls,
      })
    }

    previousTraceNodeId = traceNodeId
  })

  return edges
}
interface CodeMapStore {
  // 当前 CodeMap
  currentCodeMap: CodeMap | null
  selectedNodeId: string | null
  viewMode: ViewMode
  panelLayout: PanelLayout

  // 历史记录
  history: CodeMapMeta[]

  // UI 状态
  isLoading: boolean
  error: string | null
  showCreateDialog: boolean
  initialPrompt: string

  // 建议主题
  suggestedTopics: SuggestedTopic[]

  // 搜索
  searchQuery: string

  // 代码导航状态
  activeFile: ActiveFile | null
  navigationTarget: NavigationTarget | null
  activeAnnotations: CodeAnnotation[]
  showCodePanel: boolean
  codePanelWidth: number
  isNavigating: boolean

  // Actions
  setCurrentCodeMap: (codemap: CodeMap | null) => void
  setSelectedNodeId: (nodeId: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setPanelLayout: (layout: Partial<PanelLayout>) => void
  setHistory: (history: CodeMapMeta[]) => void
  addToHistory: (meta: CodeMapMeta) => void
  removeFromHistory: (id: string) => void
  updateHistory: (id: string, updates: { title?: string; note?: string; tags?: string[] }) => Promise<void>
  exportHistory: (id: string, format: 'json' | 'markdown' | 'html') => Promise<string>
  importHistory: (filePath: string) => Promise<void>
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setShowCreateDialog: (show: boolean) => void
  setInitialPrompt: (prompt: string) => void
  setSuggestedTopics: (topics: SuggestedTopic[]) => void
  setSearchQuery: (query: string) => void

  // 代码导航 Actions
  navigateToCodeRef: (codeRef: CodeRef, nodeId: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  closeCodePanel: () => void
  setCodePanelWidth: (width: number) => void

  // Async Actions
  createCodeMap: (prompt: string, files: string[], projectRoot: string, modelTier: ModelTier) => Promise<void>
  loadCodeMapById: (id: string) => Promise<void>
  loadHistory: () => Promise<void>
  loadSuggestedTopics: () => Promise<void>

  // Getters (computed)
  getSelectedNode: () => any
  getRootNodes: () => any[]
  getChildren: (nodeId: string) => any[]
  searchNodes: (query: string) => any[]
}

export const useCodeMapStore = create<CodeMapStore>()(
  immer((set, get) => ({
    // Initial state
    currentCodeMap: null,
    selectedNodeId: null,
    viewMode: ViewMode.Tree,
    panelLayout: {
      treeWidth: 350,
      detailsWidth: 400,
      showDetails: true,
    },
    history: [],
    isLoading: false,
    error: null,
    showCreateDialog: false,
    initialPrompt: '',
    suggestedTopics: [],
    searchQuery: '',

    // 代码导航初始状态
    activeFile: null,
    navigationTarget: null,
    activeAnnotations: [],
    showCodePanel: false,
    codePanelWidth: 500,
    isNavigating: false,
    
    // Actions
    setCurrentCodeMap: (codemap) => {
      set((state) => {
        state.currentCodeMap = codemap
        state.selectedNodeId = null
      })
    },
    
    setSelectedNodeId: (nodeId) => {
      set((state) => {
        state.selectedNodeId = nodeId
        if (nodeId) {
          state.panelLayout.showDetails = true
        }
      })
    },
    
    setViewMode: (mode) => {
      set((state) => {
        state.viewMode = mode
      })
    },
    
    setPanelLayout: (layout) => {
      set((state) => {
        Object.assign(state.panelLayout, layout)
      })
    },
    
    setHistory: (history) => {
      set((state) => {
        state.history = history
      })
    },
    
    addToHistory: (meta) => {
      set((state) => {
        const existingIndex = state.history.findIndex(h => h.id === meta.id)
        if (existingIndex >= 0) {
          state.history[existingIndex] = meta
        } else {
          state.history.unshift(meta)
        }
      })
    },
    
    removeFromHistory: async (id) => {
      try {
        // 获取当前工作目录作为项目根目录
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')
        
        // 调用 Rust 后端删除
        await window.__TAURI__.core.invoke('delete_codemap', {
          id,
          projectRoot: projectRoot,
        })
        
        // 从本地状态中移除
        set((state) => {
          state.history = state.history.filter(h => h.id !== id)
        })
        
      } catch (error) {
        console.error('Failed to delete codemap:', error)
      }
    },

    updateHistory: async (id, updates) => {
      try {
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        const updatedMetaJson = await window.__TAURI__.core.invoke('update_codemap_meta', {
          id,
          projectRoot,
          title: updates.title,
          note: updates.note,
          tags: updates.tags,
        })

        const updatedMeta: CodeMapMeta = JSON.parse(updatedMetaJson)

        set((state) => {
          const index = state.history.findIndex(h => h.id === id)
          if (index >= 0) {
            state.history[index] = updatedMeta
          }
        })
      } catch (error) {
        console.error('Failed to update codemap meta:', error)
        set((state) => {
          state.error = error instanceof Error ? error.message : String(error)
        })
      }
    },

    exportHistory: async (id, format) => {
      try {
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        const exportPath = await window.__TAURI__.core.invoke('export_codemap', {
          id,
          format,
          projectRoot,
        })

        return exportPath as string
      } catch (error) {
        console.error('Failed to export codemap:', error)
        throw error
      }
    },

    importHistory: async (filePath) => {
      try {
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        const codemapJson = await window.__TAURI__.core.invoke('import_codemap', {
          filePath,
          projectRoot,
        })

        // Reload history to include the imported codemap
        const historyJson = await window.__TAURI__.core.invoke('list_codemaps', {
          projectRoot,
        })

        if (historyJson && historyJson.trim() !== '') {
          const history: CodeMapMeta[] = JSON.parse(historyJson)
          set((state) => {
            state.history = history
          })
        }
      } catch (error) {
        console.error('Failed to import codemap:', error)
        throw error
      }
    },

    setIsLoading: (loading) => {
      set((state) => {
        state.isLoading = loading
      })
    },
    
    setError: (error) => {
      set((state) => {
        state.error = error
      })
    },
    
    setShowCreateDialog: (show) => {
      set((state) => {
        state.showCreateDialog = show
        // 关闭对话框时清除 initialPrompt
        if (!show) {
          state.initialPrompt = ''
        }
      })
    },
    
    setInitialPrompt: (prompt) => {
      set((state) => {
        state.initialPrompt = prompt
      })
    },
    
    setSuggestedTopics: (topics) => {
      set((state) => {
        state.suggestedTopics = topics
      })
    },
    
    setSearchQuery: (query) => {
      set((state) => {
        state.searchQuery = query
      })
    },

    // 代码导航 Actions
    navigateToCodeRef: async (codeRef, nodeId) => {
      set((state) => {
        state.isNavigating = true
      })

      try {
        // 获取项目根目录
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        // 先设置根目录（如果还没设置）
        try {
          await window.__TAURI__.core.invoke('set_root_dir', { root: projectRoot })
        } catch {
          // 可能已经设置过，忽略错误
        }

        // 读取文件内容
        const content = await window.__TAURI__.core.invoke('read_file', {
          rel: codeRef.path
        }) as string

        const { currentCodeMap } = get()

        set((state) => {
          state.activeFile = {
            path: codeRef.path,
            content,
            language: inferLanguage(codeRef.path)
          }
          state.navigationTarget = {
            path: codeRef.path,
            startLine: codeRef.start_line,
            endLine: codeRef.end_line,
            symbol: codeRef.symbol,
            sourceNodeId: nodeId
          }
          state.activeAnnotations = computeAnnotationsForFile(currentCodeMap, codeRef.path)
          state.showCodePanel = true
          state.isNavigating = false
        })
      } catch (error) {
        console.error('Failed to navigate to code ref:', error)
        set((state) => {
          state.error = `Failed to open file: ${codeRef.path}`
          state.isNavigating = false
        })
      }
    },

    openFile: async (path) => {
      set((state) => {
        state.isNavigating = true
      })

      try {
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        try {
          await window.__TAURI__.core.invoke('set_root_dir', { root: projectRoot })
        } catch {
          // 可能已经设置过，忽略错误
        }

        const content = await window.__TAURI__.core.invoke('read_file', {
          rel: path
        }) as string

        const { currentCodeMap } = get()

        set((state) => {
          state.activeFile = {
            path,
            content,
            language: inferLanguage(path)
          }
          state.navigationTarget = null
          state.activeAnnotations = computeAnnotationsForFile(currentCodeMap, path)
          state.showCodePanel = true
          state.isNavigating = false
        })
      } catch (error) {
        console.error('Failed to open file:', error)
        set((state) => {
          state.error = `Failed to open file: ${path}`
          state.isNavigating = false
        })
      }
    },

    closeCodePanel: () => {
      set((state) => {
        state.showCodePanel = false
        state.activeFile = null
        state.navigationTarget = null
        state.activeAnnotations = []
      })
    },

    setCodePanelWidth: (width) => {
      set((state) => {
        state.codePanelWidth = width
      })
    },

    // Async Actions
    createCodeMap: async (prompt, files, projectRoot, modelTier) => {
      set((state) => {
        state.isLoading = true
        state.error = null
      })
      
      try {
        // Demo mode: 如果没有提供文件，使用当前项目的示例文件
        let actualFiles = files
        if (actualFiles.length === 0) {
          actualFiles = [
            `${projectRoot}/client/src/App.tsx`,
            `${projectRoot}/client/src/stores/codemapStore.ts`,
            `${projectRoot}/client/src/components/Header.tsx`,
            `${projectRoot}/client/src/components/Sidebar.tsx`,
            `${projectRoot}/client/src/components/MainPanel.tsx`,
          ]
        }
        
        console.log('🚀 Creating CodeMap with files:', actualFiles)
        
        // 调用 Tauri 命令生成 CodeMap
        const codemapJson = await window.__TAURI__.core.invoke('generate_codemap_with_pi', {
          query: prompt,
          files: actualFiles,
          projectRoot: projectRoot,
          modelTier,
        })
        
        console.log('📦 Received raw JSON from generator:', codemapJson)

        const rawCodemap = JSON.parse(codemapJson)

        // Generator 返回的是 traces 格式，需要转换为 CodeMap V2 格式
        const codemap: CodeMap = {
          schema_version: '0.1',
          codemap_id: `cm_${Date.now()}`,
          title: rawCodemap.title,
          prompt: prompt,
          created_at: new Date().toISOString(),
          repo: {
            name: projectRoot.split('/').filter(Boolean).pop() || 'project',
            revision: 'live',
            snapshot_mode: SnapshotMode.Live,
          },
          generation: {
            model_tier: modelTier,
            zdr: true,
            budgets: modelTier === ModelTier.Smart
              ? { max_files: 120, max_chunks: 400 }
              : { max_files: 50, max_chunks: 200 },
          },
          nodes: convertTracesToNodes(rawCodemap.traces, projectRoot),
          edges: convertTracesToEdges(rawCodemap.traces),
          mermaid_diagram: rawCodemap.mermaidDiagram,
        }

        console.log('✅ Parsed CodeMap:', {
          codemapId: codemap.codemap_id,
          title: codemap.title,
          nodesCount: codemap.nodes.length,
          edgesCount: codemap.edges.length,
        })
        
        set((state) => {
          state.currentCodeMap = codemap
          state.isLoading = false
        })

        const normalizedCodemapJson = JSON.stringify(codemap)

        await window.__TAURI__.core.invoke('save_codemap', {
          codemapJson: normalizedCodemapJson,
          projectRoot,
        })

        const historyJson = await window.__TAURI__.core.invoke('list_codemaps', {
          projectRoot,
        })

        if (historyJson && historyJson.trim() !== '') {
          const history: CodeMapMeta[] = JSON.parse(historyJson)
          set((state) => {
            state.history = history
          })
        }
        
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : String(error)
          state.isLoading = false
        })
      }
    },
    
    loadCodeMapById: async (id: string) => {
      set((state) => {
        state.isLoading = true
        state.error = null
      })

      console.log('📂 Loading CodeMap:', id)

      try {
        // 获取当前工作目录作为项目根目录
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')

        console.log('📂 Project root:', projectRoot)

        const codemapJson = await window.__TAURI__.core.invoke('load_codemap', {
          id,
          projectRoot: projectRoot,
        })

        console.log('📦 Loaded JSON:', codemapJson?.substring(0, 200))

        const codemap: CodeMap = JSON.parse(codemapJson)

        console.log('✅ Parsed CodeMap:', {
          codemapId: codemap.codemap_id,
          title: codemap.title,
          nodesCount: codemap.nodes.length,
          edgesCount: codemap.edges.length,
        })

        set((state) => {
          state.currentCodeMap = codemap
          state.isLoading = false
        })

      } catch (error) {
        console.error('❌ Failed to load CodeMap:', error)
        set((state) => {
          state.error = error instanceof Error ? error.message : String(error)
          state.isLoading = false
        })
      }
    },
    
    loadHistory: async () => {
      try {
        // 获取当前工作目录作为项目根目录
        const projectRoot = await window.__TAURI__.core.invoke('get_project_root')
        
        const historyJson = await window.__TAURI__.core.invoke('list_codemaps', {
          projectRoot: projectRoot,
        })
        
        // 检查返回的 JSON 是否有效
        if (!historyJson || historyJson.trim() === '') {
          set((state) => {
            state.history = []
          })
          return
        }
        
        const history: CodeMapMeta[] = JSON.parse(historyJson)
        
        set((state) => {
          state.history = history
        })
        
      } catch (error) {
        // 如果加载失败，使用空历史
        set((state) => {
          state.history = []
        })
      }
    },
    
    loadSuggestedTopics: async () => {
      // 生成模拟建议主题
      const topics: SuggestedTopic[] = [
        {
          id: 's1',
          title: '用户认证流程',
          description: '追踪从用户登录到 token 生成的完整流程',
          icon: '🔐',
        },
        {
          id: 's2',
          title: '订单处理链路',
          description: '分析订单创建、支付、发货的完整业务流程',
          icon: '📦',
        },
        {
          id: 's3',
          title: '数据同步机制',
          description: '理解系统间数据同步的实现方式',
          icon: '🔄',
        },
      ]
      
      set((state) => {
        state.suggestedTopics = topics
      })
    },
    
    // Getters
    getSelectedNode: () => {
      const { currentCodeMap, selectedNodeId } = get()
      if (!currentCodeMap || !selectedNodeId) return null
      return currentCodeMap.nodes.find(n => n.node_id === selectedNodeId) || null
    },
    
    getRootNodes: () => {
      const { currentCodeMap } = get()
      if (!currentCodeMap) return []
      
      const allChildren = new Set<string>()
      currentCodeMap.nodes.forEach(node => {
        node.children.forEach(childId => allChildren.add(childId))
      })
      
      return currentCodeMap.nodes.filter(node => !allChildren.has(node.node_id))
    },
    
    getChildren: (nodeId: string) => {
      const { currentCodeMap } = get()
      if (!currentCodeMap) return []
      
      const node = currentCodeMap.nodes.find(n => n.node_id === nodeId)
      if (!node) return []
      
      return node.children
        .map(childId => currentCodeMap.nodes.find(n => n.node_id === childId))
        .filter((n): n is any => n !== undefined)
    },
    
    searchNodes: (query: string) => {
      const { currentCodeMap } = get()
      if (!currentCodeMap || !query.trim()) return []
      
      const lowerQuery = query.toLowerCase()
      return currentCodeMap.nodes.filter(node =>
        node.title.toLowerCase().includes(lowerQuery) ||
        node.summary.toLowerCase().includes(lowerQuery)
      )
    },
  }))
)

// Selectors
export const selectCurrentCodeMap = (state: CodeMapStore) => state.currentCodeMap
export const selectSelectedNode = (state: CodeMapStore) => state.getSelectedNode()
export const selectRootNodes = (state: CodeMapStore) => state.getRootNodes()
export const selectIsLoading = (state: CodeMapStore) => state.isLoading
export const selectError = (state: CodeMapStore) => state.error
export const selectSuggestedTopics = (state: CodeMapStore) => state.suggestedTopics
