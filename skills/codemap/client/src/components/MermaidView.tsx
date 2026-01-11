import React, { useRef, useEffect } from 'react'
import mermaid from 'mermaid'
import { useCodeMapStore } from '@stores/codemapStore'
import { ScrollArea } from '@components/ui/ScrollArea'
import { Icon } from '@components/icons'
import { Button } from '@components/ui/Button'

/**
 * MermaidView 组件
 * 显示 CodeMap 的 Mermaid 流程图
 */
const MermaidView: React.FC = () => {
  const { currentCodeMap } = useCodeMapStore()
  const mermaidRef = useRef<HTMLDivElement>(null)
  const id = useRef(`mermaid-${Date.now()}`)

  // 初始化 Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    })
  }, [])

  // 渲染 Mermaid 图表
  useEffect(() => {
    if (currentCodeMap && mermaidRef.current) {
      const diagramId = id.current
      const mermaidCode = currentCodeMap.mermaid_diagram || `
graph TB
    subgraph No_Data
      A[No Mermaid Diagram]
    end
      `

      try {
        mermaid.render(diagramId, mermaidCode).then(({ svg }) => {
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = svg
          }
        }).catch((error) => {
          console.error('Mermaid rendering error:', error)
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = `<div class="text-red-500 p-4">Failed to render diagram: ${error.message}</div>`
          }
        })
      } catch (error) {
        console.error('Mermaid error:', error)
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = `<div class="text-red-500 p-4">Error: ${error instanceof Error ? error.message : String(error)}</div>`
        }
      }
    }
  }, [currentCodeMap])

  const handleCopyCode = () => {
    if (!currentCodeMap?.mermaid_diagram) return
    navigator.clipboard.writeText(currentCodeMap.mermaid_diagram).catch(err => {
      console.error('Failed to copy:', err)
    })
  }

  const handleDownloadSVG = () => {
    if (!mermaidRef.current) return

    const svgElement = mermaidRef.current.querySelector('svg')
    if (!svgElement) return

    const svgData = new XMLSerializer().serializeToString(svgElement)
    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `codemap-${currentCodeMap?.codemap_id || 'diagram'}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!currentCodeMap) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No code map loaded
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon.Network size={16} className="text-primary" />
            <h3 className="font-semibold text-sm">Mermaid Flowchart</h3>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopyCode} title="Copy Code">
              <Icon.Copy size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadSVG} title="Download SVG">
              <Icon.Download size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Mermaid Diagram */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex items-center justify-center min-h-full">
          <div
            ref={mermaidRef}
            className="mermaid-container"
            style={{ maxWidth: '100%', overflow: 'auto' }}
          />
        </div>
      </ScrollArea>

      {/* Mermaid Code (可展开) */}
      {currentCodeMap.mermaid_diagram && (
        <div className="border-t border-border bg-muted/20">
          <details className="group">
            <summary className="px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors flex items-center gap-2 text-sm">
              <Icon.ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
              <span>View Mermaid Code</span>
            </summary>
            <div className="p-3 border-t border-border">
              <pre className="text-xs bg-background p-3 rounded-lg overflow-x-auto">
                <code>{currentCodeMap.mermaid_diagram}</code>
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export default MermaidView