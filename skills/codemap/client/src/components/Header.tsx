import React, { useState } from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import { Icon, getModelTierIcon } from '@components/icons'
import { ModelTier, ViewMode } from 'codemap'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/Select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/Dialog'

/**
 * Header 组件
 * 包含 Logo、新建按钮、模型档位选择、设置等
 */
const Header: React.FC = () => {
  const { currentCodeMap, viewMode, setViewMode, setShowCreateDialog } = useCodeMapStore()
  const [showSettings, setShowSettings] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  
  const handleExport = async (format: 'json' | 'markdown' | 'html') => {
    try {
      if (!currentCodeMap) return
      
      const projectRoot = await window.__TAURI__.core.invoke('get_project_root')
      const exportPath = await window.__TAURI__.core.invoke('export_codemap', {
        id: currentCodeMap.codemap_id,
        format: format,
        projectRoot: projectRoot,
      })
      
      alert(`Exported to: ${exportPath}`)
      setShowExportDialog(false)
    } catch (error) {
      console.error('Failed to export:', error)
      alert('Failed to export codemap')
    }
  }
  
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon.Logo size={24} className="text-primary" />
          <h1 className="text-lg font-semibold">CodeMap</h1>
        </div>
        
        {currentCodeMap && (
          <>
            <div className="h-6 w-px bg-border" />
            <span className="text-sm text-muted-foreground">
              {currentCodeMap.title}
            </span>
          </>
        )}
      </div>
      
      {/* Center: Model Tier & View Mode */}
      {currentCodeMap && (
        <div className="flex items-center gap-4">
          {/* Model Tier Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Model:</span>
            <Select 
              value={currentCodeMap?.generation?.model_tier || ModelTier.Fast}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ModelTier.Fast}>
                  <div className="flex items-center gap-2">
                    <Icon.Zap size={12} />
                    <span>Fast</span>
                  </div>
                </SelectItem>
                <SelectItem value={ModelTier.Smart}>
                  <div className="flex items-center gap-2">
                    <Icon.Brain size={12} />
                    <span>Smart</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === ViewMode.Tree ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode(ViewMode.Tree)}
            >
              <Icon.Layers size={14} className="mr-1" />
              Tree
            </Button>
            <Button
              variant={viewMode === ViewMode.Graph ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode(ViewMode.Graph)}
            >
              <Icon.Network size={14} className="mr-1" />
              Graph
            </Button>
            <Button
              variant={viewMode === ViewMode.Mermaid ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode(ViewMode.Mermaid)}
            >
              <Icon.FileCode size={14} className="mr-1" />
              Mermaid
            </Button>
          </div>
        </div>
      )}
      
      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {!currentCodeMap && (
          <NewCodeMapButton />
        )}
        
        {currentCodeMap && (
          <Button variant="ghost" size="sm" onClick={() => setShowExportDialog(true)}>
            <Icon.Download size={16} />
          </Button>
        )}
        
        <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
          <Icon.Settings size={16} />
        </Button>
        
        <Button variant="ghost" size="sm" onClick={() => setShowHelpDialog(true)}>
          <Icon.HelpCircle size={16} />
        </Button>
      </div>
      
      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export CodeMap</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleExport('json')}
            >
              <Icon.FileCode size={16} className="mr-2" />
              Export as JSON
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleExport('markdown')}
            >
              <Icon.FileText size={16} className="mr-2" />
              Export as Markdown
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleExport('html')}
            >
              <Icon.File size={16} className="mr-2" />
              Export as HTML
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Theme</label>
              <div className="mt-2 space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Icon.Sun size={16} className="mr-2" />
                  Light
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Icon.Moon size={16} className="mr-2" />
                  Dark
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Font Size</label>
              <div className="mt-2">
                <select className="w-full p-2 border rounded-md">
                  <option>Small</option>
                  <option selected>Medium</option>
                  <option>Large</option>
                </select>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Help Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Help & Documentation</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <section>
              <h4 className="font-semibold mb-2">Getting Started</h4>
              <p className="text-sm text-muted-foreground">
                1. Click "New CodeMap" to create a new code map<br/>
                2. Enter a prompt describing what you want to understand<br/>
                3. Select the analysis mode (Fast or Smart)<br/>
                4. Click "Generate CodeMap" to analyze your code
              </p>
            </section>
            
            <section>
              <h4 className="font-semibold mb-2">Keyboard Shortcuts</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><kbd className="px-1 py-0.5 bg-muted rounded">Cmd/Ctrl + K</kbd> - Open create dialog</p>
                <p><kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> - Close dialogs</p>
                <p><kbd className="px-1 py-0.5 bg-muted rounded">Cmd/Ctrl + /</kbd> - Toggle help</p>
              </div>
            </section>
            
            <section>
              <h4 className="font-semibold mb-2">Tips</h4>
              <p className="text-sm text-muted-foreground">
                - Use specific prompts for better results<br/>
                - Switch between Tree and Graph views for different perspectives<br/>
                - Click on nodes to see detailed information<br/>
                - Export your code maps to share with your team
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}

/**
 * 新建 CodeMap 按钮
 */
const NewCodeMapButton: React.FC = () => {
  const { setShowCreateDialog } = useCodeMapStore()
  
  const handleCreate = async () => {
    setShowCreateDialog(true)
  }
  
  return (
    <Button size="sm" onClick={handleCreate}>
      <Icon.Plus size={16} className="mr-2" />
      New CodeMap
    </Button>
  )
}

export default Header
