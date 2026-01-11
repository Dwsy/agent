import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'

export interface MonacoEditorRef {
  jumpToLine: (lineNumber: number) => void
  jumpToRange: (startLine: number, endLine: number) => void
  setAnnotations: (annotations: Array<{ line: number; message: string; kind?: 'info' | 'warn' | 'todo' }>) => void
  clearAnnotations: () => void
}

interface MonacoEditorProps {
  filePath?: string
  content?: string
  onMount?: (editor: any, monaco: any) => void
}

export const MonacoEditor = forwardRef<MonacoEditorRef, MonacoEditorProps>(
  ({ filePath, content, onMount }, ref) => {
    const editorRef = useRef<any>(null)
    const monacoRef = useRef<any>(null)
    const highlightDecorationIds = useRef<string[]>([])
    const annotationDecorationIds = useRef<string[]>([])

    // 推断文件语言
    const inferLanguage = (path: string): string => {
      if (!path) return 'plaintext'
      const ext = path.split('.').pop()?.toLowerCase()
      const langMap: Record<string, string> = {
        rs: 'rust',
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        json: 'json',
        toml: 'toml',
        md: 'markdown',
        yaml: 'yaml',
        yml: 'yaml',
        sh: 'shell',
        py: 'python',
        java: 'java',
        go: 'go',
        cpp: 'cpp',
        c: 'c',
        h: 'c',
        hpp: 'cpp',
        css: 'css',
        scss: 'scss',
        html: 'html',
        xml: 'xml',
        sql: 'sql',
      }
      return langMap[ext || ''] || 'plaintext'
    }

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      jumpToLine: (lineNumber: number) => {
        if (!editorRef.current || !monacoRef.current) return
        editorRef.current.revealLineInCenter(lineNumber)
        editorRef.current.setPosition({ lineNumber, column: 1 })

        highlightDecorationIds.current = editorRef.current.deltaDecorations(
          highlightDecorationIds.current,
          [{
            range: new monacoRef.current.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: true,
              className: 'line-highlight',
              glyphMarginClassName: 'line-highlight-glyph',
            }
          }]
        )
      },
      jumpToRange: (startLine: number, endLine: number) => {
        if (!editorRef.current || !monacoRef.current) return
        editorRef.current.revealLineInCenter(startLine)
        editorRef.current.setPosition({ lineNumber: startLine, column: 1 })

        highlightDecorationIds.current = editorRef.current.deltaDecorations(
          highlightDecorationIds.current,
          [{
            range: new monacoRef.current.Range(startLine, 1, endLine, 1),
            options: {
              isWholeLine: true,
              className: 'line-highlight',
              glyphMarginClassName: 'line-highlight-glyph',
            }
          }]
        )
      },
      setAnnotations: (annotations: Array<{
        line: number
        message: string
        kind?: 'info' | 'warn' | 'todo'
      }>) => {
        if (!editorRef.current || !monacoRef.current) return

        annotationDecorationIds.current = editorRef.current.deltaDecorations(
          annotationDecorationIds.current,
          annotations.map(anno => ({
            range: new monacoRef.current.Range(anno.line, 1, anno.line, 1),
            options: {
              isWholeLine: true,
              className: `anno-line anno-${anno.kind || 'info'}`,
              glyphMarginClassName: `anno-glyph anno-${anno.kind || 'info'}`,
              glyphMarginHoverMessage: { value: anno.message },
              hoverMessage: { value: anno.message },
            }
          }))
        )
      },
      clearAnnotations: () => {
        if (!editorRef.current) return
        annotationDecorationIds.current = editorRef.current.deltaDecorations(
          annotationDecorationIds.current,
          []
        )
      }
    }), [])

    const handleEditorMount = (editor: any, monaco: any) => {
      editorRef.current = editor
      monacoRef.current = monaco

      monaco.editor.defineTheme('custom-theme', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955' },
          { token: 'keyword', foreground: '0000FF' },
          { token: 'string', foreground: 'A31515' },
        ],
        colors: {
          'editor.background': '#FFFFFF',
        }
      })

      monaco.editor.setTheme('custom-theme')

      // 保留 onMount 回调兼容性
      if (onMount) {
        const methods = {
          jumpToLine: (lineNumber: number) => {
            if (!editorRef.current || !monacoRef.current) return
            editorRef.current.revealLineInCenter(lineNumber)
            editorRef.current.setPosition({ lineNumber, column: 1 })

            highlightDecorationIds.current = editorRef.current.deltaDecorations(
              highlightDecorationIds.current,
              [{
                range: new monacoRef.current.Range(lineNumber, 1, lineNumber, 1),
                options: {
                  isWholeLine: true,
                  className: 'line-highlight',
                  glyphMarginClassName: 'line-highlight-glyph',
                }
              }]
            )
          },
          setAnnotations: (annotations: Array<{
            line: number
            message: string
            kind?: 'info' | 'warn' | 'todo'
          }>) => {
            if (!editorRef.current || !monacoRef.current) return

            annotationDecorationIds.current = editorRef.current.deltaDecorations(
              annotationDecorationIds.current,
              annotations.map(anno => ({
                range: new monacoRef.current.Range(anno.line, 1, anno.line, 1),
                options: {
                  isWholeLine: true,
                  className: `anno-line anno-${anno.kind || 'info'}`,
                  glyphMarginClassName: `anno-glyph anno-${anno.kind || 'info'}`,
                  glyphMarginHoverMessage: { value: anno.message },
                  hoverMessage: { value: anno.message },
                }
              }))
            )
          }
        }
        onMount(editor, methods)
      }
    }

  return (
    <>
      <Editor
        height="100%"
        language={inferLanguage(filePath || '')}
        value={content}
        theme="custom-theme"
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 14,
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
          renderWhitespace: 'selection',
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
        onMount={handleEditorMount}
        loading={
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading editor...
          </div>
        }
      />
      <style>{`
        .line-highlight {
          background: rgba(255, 230, 150, 0.25) !important;
          border-left: 3px solid #FFB84D !important;
        }
        .anno-line.anno-info {
          border-left: 3px solid #50A0FF !important;
          background: rgba(80, 160, 255, 0.05) !important;
        }
        .anno-line.anno-warn {
          border-left: 3px solid #FFAA00 !important;
          background: rgba(255, 170, 0, 0.05) !important;
        }
        .anno-line.anno-todo {
          border-left: 3px solid #B478FF !important;
          background: rgba(180, 120, 255, 0.05) !important;
        }
        .anno-glyph {
          width: 14px;
          height: 14px;
          margin-left: 4px;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }
        .anno-glyph.anno-info {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2350A0FF'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='7' r='1' fill='white'/%3E%3C/svg%3E");
        }
        .anno-glyph.anno-warn {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFAA00'%3E%3Cpath d='M12 2L2 22h20L12 2zm0 4l7.5 14h-15L12 6z'/%3E%3Cpath d='M12 10v4' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='17' r='1' fill='white'/%3E%3C/svg%3E");
        }
        .anno-glyph.anno-todo {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B478FF' stroke-width='2'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M9 12l2 2 4-4'/%3E%3C/svg%3E");
        }
      `}</style>
    </>
  )
})

MonacoEditor.displayName = 'MonacoEditor'