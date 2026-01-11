import React, { useRef, useEffect } from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import { MonacoEditor, MonacoEditorRef } from './MonacoEditor'
import { Button } from './ui/Button'
import { Icon } from './icons'

export const IntegratedCodePanel: React.FC = () => {
  const {
    activeFile,
    navigationTarget,
    activeAnnotations,
    closeCodePanel,
    codePanelWidth,
    isNavigating
  } = useCodeMapStore()

  const editorRef = useRef<MonacoEditorRef>(null)
  const prevNavigationTargetRef = useRef<typeof navigationTarget>(null)

  // 监听导航目标变化，执行跳转
  useEffect(() => {
    if (
      navigationTarget &&
      editorRef.current &&
      navigationTarget !== prevNavigationTargetRef.current
    ) {
      // 使用 setTimeout 确保 Monaco 编辑器已完成内容更新
      setTimeout(() => {
        editorRef.current?.jumpToRange(
          navigationTarget.startLine,
          navigationTarget.endLine
        )
      }, 100)
      prevNavigationTargetRef.current = navigationTarget
    }
  }, [navigationTarget])

  // 监听批注变化，更新装饰
  useEffect(() => {
    if (editorRef.current && activeAnnotations.length > 0) {
      setTimeout(() => {
        editorRef.current?.setAnnotations(
          activeAnnotations.map(anno => ({
            line: anno.line,
            message: anno.message,
            kind: anno.kind
          }))
        )
      }, 150)
    }
  }, [activeAnnotations])

  if (!activeFile) {
    return (
      <div
        style={{ width: codePanelWidth }}
        className="border-l border-gray-200 flex flex-col bg-gray-50"
      >
        <PanelHeader onClose={closeCodePanel} />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Icon.FileText size={48} className="mx-auto mb-3" />
            <p>No file selected</p>
            <p className="text-sm mt-1">Click a code reference to view</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ width: codePanelWidth }}
      className="border-l border-gray-200 flex flex-col bg-white"
    >
      <PanelHeader
        title={activeFile.path}
        onClose={closeCodePanel}
        isLoading={isNavigating}
      />
      <div className="flex-1 relative">
        <MonacoEditor
          ref={editorRef}
          filePath={activeFile.path}
          content={activeFile.content}
        />
      </div>
    </div>
  )
}

interface PanelHeaderProps {
  title?: string
  onClose: () => void
  isLoading?: boolean
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ title, onClose, isLoading }) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
        {isLoading ? (
          <Icon.Loader2 size={16} className="text-gray-500 animate-spin flex-shrink-0" />
        ) : (
          <Icon.FileCode size={16} className="text-gray-500 flex-shrink-0" />
        )}
        {title ? (
          <span className="text-sm text-gray-700 truncate">{title}</span>
        ) : (
          <span className="text-sm text-gray-400">Code Panel</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="flex-shrink-0"
      >
        <Icon.X size={16} />
      </Button>
    </div>
  )
}

export default IntegratedCodePanel
