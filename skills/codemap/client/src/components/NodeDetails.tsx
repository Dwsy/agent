import React, { useState } from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import { Icon, getFileIcon } from '@components/icons'
import { Button } from '@components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@components/ui/Dialog'
import { ScrollArea } from '@components/ui/ScrollArea'
import { Input } from '@components/ui/Input'
import ReactMarkdown from 'react-markdown'
import type { CodeRef } from 'codemap'

/**
 * NodeDetails 组件
 * 显示选中节点的详细信息
 */
const NodeDetails: React.FC = () => {
  const { getSelectedNode, setSelectedNodeId, setPanelLayout } = useCodeMapStore()
  const selectedNode = getSelectedNode()
  const [showFullTrace, setShowFullTrace] = useState(false)
  const [showAskAIDialog, setShowAskAIDialog] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  
  const handleCopyReference = () => {
    if (!selectedNode) return
    const reference = `${selectedNode.node_id}: ${selectedNode.title}`
    navigator.clipboard.writeText(reference).catch(err => {
      console.error('Failed to copy:', err)
    })
  }
  
  const handleAskAI = () => {
    if (!selectedNode) return
    setShowAskAIDialog(true)
    // 自动生成分析提示
    const prompt = `Analyze this code node:\n\nNode ID: ${selectedNode.node_id}\nTitle: ${selectedNode.title}\n\nSummary:\n${selectedNode.summary}\n\nTrace Guide:\n${selectedNode.trace_guide.short}`
    setAiResponse(prompt)
  }
  
  const handleSendToAI = async () => {
    if (!aiResponse.trim()) return
    
    setIsLoadingAI(true)
    try {
      // TODO: 集成实际的 AI 服务
      // 这里只是模拟 AI 响应
      await new Promise(resolve => setTimeout(resolve, 1500))
      setAiResponse(prev => prev + '\n\n---\n\n**AI Analysis:**\n\nThis is a simulated AI response. In production, this would connect to an AI service like Claude, GPT-4, or other LLMs to provide detailed analysis of the code node.\n\nKey insights:\n- The component handles order processing\n- It integrates multiple services\n- Consider adding error handling for edge cases')
    } catch (error) {
      console.error('Failed to get AI response:', error)
      setAiResponse(prev => prev + '\n\n---\n\n**Error:** Failed to get AI response')
    } finally {
      setIsLoadingAI(false)
    }
  }
  
  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Select a node to view details
      </div>
    )
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{selectedNode.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedNode.node_id}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedNodeId(null)
              setPanelLayout({ showDetails: false })
            }}
          >
            <Icon.X size={16} />
          </Button>
        </div>
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Summary */}
          <section>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Icon.FileText size={14} />
              Summary
            </h4>
            <p className="text-sm text-muted-foreground">
              {selectedNode.summary}
            </p>
          </section>
          
          {/* Code References */}
          {selectedNode.code_refs.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Icon.FileCode size={14} />
                Code References ({selectedNode.code_refs.length})
              </h4>
              <div className="space-y-2">
                {selectedNode.code_refs.map((ref: CodeRef, index: number) => (
                  <CodeRefItem
                    key={index}
                    codeRef={ref}
                    nodeId={selectedNode.node_id}
                  />
                ))}
              </div>
            </section>
          )}
          
          {/* Trace Guide */}
          <section>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Icon.BookOpen size={14} />
              Trace Guide
            </h4>
            
            {/* Short description */}
            <div className="text-sm text-muted-foreground mb-3">
              {selectedNode.trace_guide.short}
            </div>
            
            {/* "See more" button */}
            {selectedNode.trace_guide.long && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFullTrace(!showFullTrace)}
                className="w-full"
              >
                {showFullTrace ? (
                  <>
                    <Icon.ChevronUp size={14} className="mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <Icon.ChevronDown size={14} className="mr-2" />
                    See More
                  </>
                )}
              </Button>
            )}
            
            {/* Long description */}
            {showFullTrace && selectedNode.trace_guide.long && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <ReactMarkdown className="prose prose-sm max-w-none">
                  {selectedNode.trace_guide.long}
                </ReactMarkdown>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
      
      {/* Footer Actions */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleCopyReference}
          >
            <Icon.Copy size={14} className="mr-2" />
            Copy Reference
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleAskAI}
          >
            <Icon.MessageSquare size={14} className="mr-2" />
            Ask AI
          </Button>
        </div>
      </div>
      
      {/* Ask AI Dialog */}
      <Dialog open={showAskAIDialog} onOpenChange={setShowAskAIDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Ask AI</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis Request</label>
              <Input
                value={aiResponse}
                onChange={(e) => setAiResponse(e.target.value)}
                placeholder="Enter your question or analysis request..."
                className="h-32"
                disabled={isLoadingAI}
              />
            </div>
            
            {aiResponse.includes('---') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">AI Response</label>
                <ScrollArea className="h-64 border rounded-lg p-4">
                  <ReactMarkdown className="prose prose-sm max-w-none">
                    {aiResponse.split('---')[1]?.trim() || 'Waiting for response...'}
                  </ReactMarkdown>
                </ScrollArea>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAskAIDialog(false)}
              disabled={isLoadingAI}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendToAI}
              disabled={!aiResponse.trim() || isLoadingAI}
            >
              {isLoadingAI ? (
                <>
                  <Icon.Loader2 size={16} className="mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Icon.Send size={16} className="mr-2" />
                  Send to AI
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * CodeRef 项
 */
interface CodeRefItemProps {
  codeRef: CodeRef
  nodeId: string
}

const CodeRefItem: React.FC<CodeRefItemProps> = ({ codeRef, nodeId }) => {
  const FileIcon = getFileIcon(codeRef.path.split('.').pop() || '')
  const { navigateToCodeRef, isNavigating } = useCodeMapStore()

  const handleClick = async () => {
    await navigateToCodeRef(codeRef, nodeId)
  }

  return (
    <button
      className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group disabled:opacity-50"
      onClick={handleClick}
      disabled={isNavigating}
    >
      <div className="flex items-start gap-2">
        <FileIcon size={16} className="mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {codeRef.path}
            </span>
            {codeRef.symbol && (
              <span className="text-xs text-muted-foreground">
                ({codeRef.symbol})
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Lines {codeRef.start_line} - {codeRef.end_line}
          </div>
        </div>
        {isNavigating ? (
          <Icon.Loader2 size={14} className="flex-shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon.ExternalLink
            size={14}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </div>
    </button>
  )
}

export default NodeDetails
