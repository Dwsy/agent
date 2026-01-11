import React, { useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import { cn } from './ui/index'
import { Node as CodeMapNode } from 'codemap'

interface TreeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  filePath?: string
}

interface TreeViewProps {
  nodes?: TreeNode[] | CodeMapNode[]
  onNodeClick?: (node: TreeNode | CodeMapNode) => void
  selectedNodeId?: string | null | undefined
}

// 将 CodeMapNode 转换为 TreeNode
function toTreeNode(node: CodeMapNode, allNodes: CodeMapNode[]): TreeNode {
  return {
    id: node.node_id,
    name: node.title,
    type: (node.children?.length ?? 0) > 0 ? 'folder' : 'file',
    children: node.children?.map(childId => {
      const child = allNodes.find(n => n.node_id === childId)
      return child ? toTreeNode(child, allNodes) : { id: childId, name: 'Unknown', type: 'file' }
    }) ?? [],
  }
}

export function TreeView({ nodes = [], onNodeClick, selectedNodeId }: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // 检查是否是 CodeMapNode
  const isCodeMapNodes = nodes.length > 0 && 'node_id' in nodes[0]

  // 转换为 TreeNode
  const treeNodes: TreeNode[] = isCodeMapNodes
    ? (nodes as CodeMapNode[]).map(node => toTreeNode(node, nodes as CodeMapNode[]))
    : (nodes as TreeNode[])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedNodeId === node.id

    return (
      <div key={node.id}>
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded cursor-pointer select-none',
            'hover:bg-gray-100',
            isSelected && 'bg-blue-50 text-blue-900'
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleNode(node.id)
            }
            onNodeClick?.(node)
          }}
        >
          {node.type === 'folder' ? (
            <>
              {isExpanded ? (
                <ChevronDown size={14} className="text-gray-500" />
              ) : (
                <ChevronRight size={14} className="text-gray-500" />
              )}
              {isExpanded ? (
                <FolderOpen size={16} className="text-blue-500" />
              ) : (
                <Folder size={16} className="text-blue-500" />
              )}
            </>
          ) : (
            <span className="w-4" />
          )}
          <span className="text-sm">{node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      {treeNodes.map(node => renderNode(node))}
    </div>
  )
}