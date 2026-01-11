import React from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import { Icon, LoadingSpinner, StatusIcon } from '@components/icons'
import { TreeView } from '@components/TreeView'
import GraphView from '@components/GraphView'
import MermaidView from '@components/MermaidView'
import NodeDetails from '@components/NodeDetails'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/Select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@components/ui/Dialog'
import { ModelTier, ViewMode } from 'codemap'

/**
 * MainPanel 组件
 * 包含树/图视图和节点详情面板
 */
const MainPanel: React.FC = () => {
  const { 
    currentCodeMap, 
    isLoading, 
    error,
    viewMode,
    selectedNodeId,
    setSelectedNodeId,
    panelLayout,
    setPanelLayout,
    createCodeMap,
    showCreateDialog,
    setShowCreateDialog,
    initialPrompt,
    setInitialPrompt
  } = useCodeMapStore()
  
  const [prompt, setPrompt] = React.useState('')
  const [modelTier, setModelTier] = React.useState<ModelTier>(ModelTier.Fast)
  const [projectRoot, setProjectRoot] = React.useState<string>('')

  // 对话框关闭时清除 initialPrompt
  React.useEffect(() => {
    if (!showCreateDialog && initialPrompt) {
      setInitialPrompt('')
      setPrompt('')
    }
  }, [showCreateDialog, initialPrompt, setInitialPrompt])

  // 同步 Store 中的 initialPrompt 到本地状态
  React.useEffect(() => {
    if (initialPrompt && showCreateDialog) {
      setPrompt(initialPrompt)
    }
  }, [initialPrompt, showCreateDialog])

  React.useEffect(() => {
    const fetchProjectRoot = async () => {
      try {
        const root = await window.__TAURI__.core.invoke('get_project_root')
        setProjectRoot(root as string)
      } catch (error) {
        console.error('Failed to get project root:', error)
        setProjectRoot('')
      }
    }
    fetchProjectRoot()
  }, [])
  
  return (
    <>
      {/* Content */}
      {!currentCodeMap && !isLoading && !error && (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <EmptyState onOpenCreate={() => setShowCreateDialog(true)} />
        </div>
      )}
      
      {isLoading && (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <LoadingState />
        </div>
      )}
      
      {error && (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <ErrorState error={error} />
        </div>
      )}
      
      {currentCodeMap && (
        <div className="flex-1 flex overflow-hidden">
          {/* Tree/Graph View */}
          <div 
            className="flex-1 overflow-hidden"
            style={{ width: panelLayout.showDetails ? `calc(100% - ${panelLayout.detailsWidth}px)` : '100%' }}
          >
            {viewMode === ViewMode.Tree ? (
              <TreeView nodes={currentCodeMap?.nodes || []} selectedNodeId={selectedNodeId || undefined} onNodeClick={(node) => setSelectedNodeId('node_id' in node ? node.node_id : node.id)} />
            ) : viewMode === ViewMode.Graph ? (
              <GraphView />
            ) : (
              <MermaidView />
            )}
          </div>
          
          {/* Node Details Panel */}
          {panelLayout.showDetails && selectedNodeId && (
            <div 
              className="border-l border-border bg-card"
              style={{ width: panelLayout.detailsWidth }}
            >
              <NodeDetails />
            </div>
          )}
        </div>
      )}
      
      {/* Create CodeMap Dialog - 始终渲染 */}
      <CreateCodeMapDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        prompt={prompt}
        onPromptChange={setPrompt}
        modelTier={modelTier}
        onModelTierChange={setModelTier}
        projectRoot={projectRoot}
      />
    </>
  )
}

/**
 * Empty State
 */
interface EmptyStateProps {
  onOpenCreate: () => void
}

const EmptyState: React.FC<EmptyStateProps> = ({ onOpenCreate }) => {
  return (
    <div className="text-center max-w-md">
      <div className="mb-6">
        <Icon.Map size={64} className="mx-auto text-muted-foreground/50" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Create Your First CodeMap</h2>
      <p className="text-muted-foreground mb-6">
        Generate a visual map of your code execution flow to understand how components work together.
      </p>
      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={onOpenCreate}>
          <Icon.Plus size={18} className="mr-2" />
          Create CodeMap
        </Button>
        <Button variant="outline" size="lg" onClick={() => window.open('https://github.com', '_blank')}>
          <Icon.BookOpen size={18} className="mr-2" />
          View Documentation
        </Button>
      </div>
    </div>
  )
}

/**
 * Loading State
 */
const LoadingState: React.FC = () => {
  return (
    <div className="text-center">
      <LoadingSpinner size={48} className="mx-auto mb-4 text-primary" />
      <h2 className="text-xl font-semibold mb-2">Generating CodeMap</h2>
      <p className="text-muted-foreground">
        Analyzing code and building the map...
      </p>
    </div>
  )
}

/**
 * Error State
 */
interface ErrorStateProps {
  error: string
}

const ErrorState: React.FC<ErrorStateProps> = ({ error }) => {
  return (
    <div className="text-center max-w-md">
      <StatusIcon status="error" size={48} className="mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-4">{error}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        <Icon.RefreshCw size={16} className="mr-2" />
        Try Again
      </Button>
    </div>
  )
}

/**
 * Create CodeMap Dialog
 */
interface CreateCodeMapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  onPromptChange: (prompt: string) => void
  modelTier: ModelTier
  onModelTierChange: (tier: ModelTier) => void
  projectRoot: string
}

const CreateCodeMapDialog: React.FC<CreateCodeMapDialogProps> = ({
  open,
  onOpenChange,
  prompt,
  onPromptChange,
  modelTier,
  onModelTierChange,
  projectRoot,
}) => {
  const { createCodeMap } = useCodeMapStore()
  const [isLoading, setIsLoading] = React.useState(false)
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>([])
  
  const handleCreate = async () => {
    if (!prompt.trim() || !projectRoot) return
    
    setIsLoading(true)
    try {
      await createCodeMap(prompt, selectedFiles, projectRoot, modelTier)
      onOpenChange(false)
      // 不要清空 prompt，让父组件处理
      setSelectedFiles([])
    } catch (error) {
      console.error('Failed to create codemap:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New CodeMap</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Prompt Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              What do you want to understand?
            </label>
            <Input
              placeholder="e.g., 'Trace the user authentication flow from login to token issuance'"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              className="h-24"
            />
            <p className="text-xs text-muted-foreground">
              Describe the code flow or component you want to explore
            </p>
          </div>
          
          {/* Files Selection (Demo) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select Files (Demo Mode)
            </label>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="text-muted-foreground mb-2">
                In demo mode, using sample files from the project:
              </p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked disabled />
                  <span>src/App.tsx</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked disabled />
                  <span>src/stores/codemapStore.ts</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked disabled />
                  <span>src/components/Header.tsx</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Full file selection will be implemented in future versions
            </p>
          </div>
          
          {/* Model Tier Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Analysis Mode
            </label>
            <Select 
              value={modelTier} 
              onValueChange={(v: string) => onModelTierChange(v as ModelTier)}
            >
              <SelectTrigger>
                <SelectValue>
                  {modelTier === ModelTier.Fast ? 'Fast' : 'Smart'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ModelTier.Fast}>
                  <div className="flex items-center gap-2">
                    <Icon.Zap size={16} />
                    <div className="flex flex-col">
                      <span className="font-medium">Fast</span>
                      <span className="text-xs text-gray-500">
                        Quick analysis (~20s), moderate detail
                      </span>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value={ModelTier.Smart}>
                  <div className="flex items-center gap-2">
                    <Icon.Brain size={16} />
                    <div className="flex flex-col">
                      <span className="font-medium">Smart</span>
                      <span className="text-xs text-gray-500">
                        Deep analysis (~60s), comprehensive detail
                      </span>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!prompt.trim() || !projectRoot || isLoading}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size={16} className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Icon.Plus size={16} className="mr-2" />
                Generate CodeMap
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MainPanel
