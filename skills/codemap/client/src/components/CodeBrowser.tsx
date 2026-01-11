import React, { useState, useRef, useEffect } from 'react'
import { FileSystemTree } from './FileSystemTree'
import { MonacoEditor } from './MonacoEditor'
import { Button } from './ui/Button'
import { invoke } from '@tauri-apps/api/core'
import { Home, FileText, X } from 'lucide-react'

interface EditorRef {
  jumpToLine: (line: number) => void
  setAnnotations: (annotations: Array<{ line: number; message: string; kind?: 'info' | 'warn' | 'todo' }>) => void
}

export function CodeBrowser() {
  const [currentFilePath, setCurrentFilePath] = useState<string>('')
  const [fileContent, setFileContent] = useState<string>('')
  const [editorRef, setEditorRef] = useState<EditorRef | null>(null)
  const [isRootSet, setIsRootSet] = useState<boolean>(false)
  const [projectRoot, setProjectRoot] = useState<string>('')

  // 设置默认根目录
  useEffect(() => {
    const setDefaultRoot = async () => {
      try {
        const root = await invoke<string>('get_project_root')
        await invoke('set_root_dir', { root })
        setProjectRoot(root)
        setIsRootSet(true)
        console.log('Default root directory set:', root)
      } catch (error) {
        console.error('Failed to set default root directory:', error)
      }
    }
    setDefaultRoot()
  }, [])

  const handleSelectRootDir = async () => {
    try {
      const root = projectRoot || await invoke<string>('get_project_root')
      await invoke('set_root_dir', { root })
      setProjectRoot(root)
      setIsRootSet(true)
      console.log('Root directory set:', root)
    } catch (error) {
      console.error('Failed to set directory:', error)
      alert('Failed to set directory: ' + error)
    }
  }

  const handleFileSelect = async (relPath: string) => {
    try {
      const content = await invoke<string>('read_file', { rel: relPath })
      setCurrentFilePath(relPath)
      setFileContent(content)
      console.log('Opened file:', relPath)
    } catch (error) {
      console.error('Failed to read file:', error)
      alert('Failed to read file: ' + error)
    }
  }

  const handleEditorMount = (editor: any, monacoWithMethods: any) => {
    setEditorRef(monacoWithMethods)
    console.log('Editor mounted')
  }

  // 测试跳转功能
  const testJumpToLine = () => {
    if (editorRef) {
      editorRef.jumpToLine(10)
    } else {
      alert('Editor not ready. Please open a file first.')
    }
  }

  // 测试批注功能
  const testAnnotations = () => {
    if (editorRef) {
      editorRef.setAnnotations([
        { line: 5, message: 'This is an important entry point', kind: 'info' },
        { line: 10, message: 'TODO: Refactor this function', kind: 'todo' },
        { line: 15, message: 'Warning: Potential performance issue', kind: 'warn' },
      ])
    } else {
      alert('Editor not ready. Please open a file first.')
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Home size={20} className="text-gray-600" />
          <h1 className="text-lg font-semibold text-gray-900">Code Browser</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {!isRootSet && (
            <Button onClick={handleSelectRootDir}>
              Select Root Directory
            </Button>
          )}
          
          {/* Test buttons - can be removed in production */}
          {currentFilePath && editorRef && (
            <>
              <Button variant="outline" size="sm" onClick={testJumpToLine}>
                Jump to Line 10
              </Button>
              <Button variant="outline" size="sm" onClick={testAnnotations}>
                Test Annotations
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - File Tree */}
        <aside className="w-64 border-r border-gray-200 bg-white flex flex-col">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-700">Explorer</h2>
          </div>
          <FileSystemTree onFileSelect={handleFileSelect} />
        </aside>

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col">
          {/* File Tabs / Breadcrumbs */}
          {currentFilePath && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText size={16} className="text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate">
                  {currentFilePath}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentFilePath('')
                  setFileContent('')
                }}
              >
                <X size={16} />
              </Button>
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 relative">
            {!currentFilePath ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <FileText size={64} className="mb-4" />
                <p className="text-lg">No file selected</p>
                <p className="text-sm mt-2">
                  {isRootSet ? 'Select a file from the explorer' : 'Select a root directory first'}
                </p>
              </div>
            ) : (
              <MonacoEditor
                filePath={currentFilePath}
                content={fileContent}
                onMount={handleEditorMount}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
