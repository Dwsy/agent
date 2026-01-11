import React, { useEffect, useState } from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import Sidebar from '@components/Sidebar'
import MainPanel from '@components/MainPanel'
import { CodeBrowser } from '@components/CodeBrowser'
import { IntegratedCodePanel } from '@components/IntegratedCodePanel'
import { Icon } from '@components/icons'
import { Button } from '@components/ui/Button'

type ViewMode = 'codemap' | 'codebrowser'

/**
 * CodeMap 主应用组件
 */
const App: React.FC = () => {
  const { loadHistory, loadSuggestedTopics, showCodePanel, setShowCreateDialog, currentCodeMap } = useCodeMapStore()
  const [viewMode, setViewMode] = useState<ViewMode>('codemap')

  useEffect(() => {
    // 初始化加载
    loadHistory()
    loadSuggestedTopics()
  }, [loadHistory, loadSuggestedTopics])

  // 当加载 CodeMap 时，自动切换到 codemap 视图
  useEffect(() => {
    if (currentCodeMap && viewMode === 'codebrowser') {
      setViewMode('codemap')
    }
  }, [currentCodeMap, viewMode])

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header - View Switcher */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Icon.Map size={20} className="text-gray-600" />
          <h1 className="text-lg font-semibold text-gray-900">CodeMap</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'codemap' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('codemap')}
          >
            <Icon.Map size={16} className="mr-2" />
            CodeMap
          </Button>
          <Button
            variant={viewMode === 'codebrowser' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('codebrowser')}
          >
            <Icon.FileText size={16} className="mr-2" />
            Code Browser
          </Button>
          {viewMode === 'codemap' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateDialog(true)}
            >
              <Icon.Plus size={16} className="mr-2" />
              New CodeMap
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      {viewMode === 'codemap' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - History & Suggestions */}
          <Sidebar />

          {/* Main Panel - Tree/Graph + Details */}
          <MainPanel />

          {/* Integrated Code Panel - 点击 code_ref 时显示 */}
          {showCodePanel && <IntegratedCodePanel />}
        </div>
      ) : (
        <CodeBrowser />
      )}
    </div>
  )
}

export default App
