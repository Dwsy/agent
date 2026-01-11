import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { FileIcon, FolderIcon } from '@react-symbols/icons/utils'

interface DirEntry {
  name: string
  rel_path: string
  is_dir: boolean
}

interface FileSystemTreeProps {
  onFileSelect: (relPath: string) => void
}

export function FileSystemTree({ onFileSelect }: FileSystemTreeProps) {
  const [rootDir, setRootDir] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<Map<string, DirEntry[]>>(new Map())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadRootDir()
  }, [])

  const loadRootDir = async () => {
    try {
      const root = await invoke<string | null>('get_root_dir')
      if (root) {
        setRootDir(root)
        loadDirectory('')
      }
    } catch (error) {
      console.error('Failed to load root directory:', error)
    }
  }

  const loadDirectory = async (relPath: string) => {
    setLoading(prev => new Set(prev).add(relPath))
    try {
      const entries = await invoke<DirEntry[]>('list_dir', { rel: relPath })
      setTreeData(prev => new Map(prev).set(relPath, entries))
    } catch (error) {
      console.error('Failed to load directory:', error)
    } finally {
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(relPath)
        return next
      })
    }
  }

  const toggleDirectory = (relPath: string) => {
    const isExpanded = expandedDirs.has(relPath)
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (isExpanded) {
        next.delete(relPath)
      } else {
        next.add(relPath)
        if (!treeData.has(relPath)) {
          loadDirectory(relPath)
        }
      }
      return next
    })
  }

  const handleNodeClick = (entry: DirEntry) => {
    if (entry.is_dir) {
      toggleDirectory(entry.rel_path)
    } else {
      onFileSelect(entry.rel_path)
    }
  }

  const renderNode = (entry: DirEntry, level: number = 0) => {
    const isExpanded = expandedDirs.has(entry.rel_path)
    const isLoading = loading.has(entry.rel_path)
    const children = treeData.get(entry.rel_path)

    return (
      <div key={entry.rel_path}>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer select-none"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleNodeClick(entry)}
        >
          {entry.is_dir ? (
            <>
              {isExpanded ? (
                <ChevronRight size={14} className="text-gray-500" />
              ) : (
                <ChevronDown size={14} className="text-gray-500" />
              )}
              <FolderIcon folderName={entry.name} width={16} height={16} />
            </>
          ) : (
            <>
              <span className="w-4" />
              <FileIcon fileName={entry.name} width={16} height={16} />
            </>
          )}
          <span className="text-sm text-gray-700">{entry.name}</span>
          {isLoading && <span className="text-xs text-gray-400">Loading...</span>}
        </div>
        {isExpanded && children && (
          <div>
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const rootEntries = treeData.get('')

  return (
    <div className="h-full overflow-auto">
      {!rootDir && (
        <div className="p-4 text-sm text-gray-500">
          No root directory selected
        </div>
      )}
      {rootEntries && rootEntries.map(entry => renderNode(entry))}
    </div>
  )
}
