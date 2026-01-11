import React, { useCallback, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useCodeMapStore } from '@stores/codemapStore'
import { Icon, getNodeIcon, getEdgeTypeIcon } from '@components/icons'

/**
 * GraphView 组件
 * 使用 ReactFlow 显示交互式图视图
 */
const GraphView: React.FC = () => {
  const { currentCodeMap, selectedNodeId, setSelectedNodeId } = useCodeMapStore()
  
  // 将 CodeMap nodes/edges 转换为 ReactFlow 格式
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!currentCodeMap) {
      return { nodes: [], edges: [] }
    }
    
    // 计算节点位置（简单的树形布局）
    const nodePositions = new Map<string, { x: number; y: number }>()
    const levelNodes = new Map<number, string[]>()
    
    // 计算每个节点的层级
    const calculateLevels = () => {
      const levels = new Map<string, number>()
      const visited = new Set<string>()
      
      const dfs = (nodeId: string, level: number) => {
        if (visited.has(nodeId)) return
        visited.add(nodeId)
        levels.set(nodeId, level)
        
        const node = currentCodeMap.nodes.find(n => n.node_id === nodeId)
        if (node) {
          node.children.forEach(childId => dfs(childId, level + 1))
        }
      }
      
      // 找到根节点
      const allChildren = new Set<string>()
      currentCodeMap.nodes.forEach(n => n.children.forEach(c => allChildren.add(c)))
      const rootNodes = currentCodeMap.nodes.filter(n => !allChildren.has(n.node_id))
      
      rootNodes.forEach(root => dfs(root.node_id, 0))
      
      return levels
    }
    
    const levels = calculateLevels()
    
    // 按层级分组
    levels.forEach((level, nodeId) => {
      if (!levelNodes.has(level)) {
        levelNodes.set(level, [])
      }
      levelNodes.get(level)!.push(nodeId)
    })
    
    // 计算每个节点的位置
    const NODE_WIDTH = 200
    const NODE_HEIGHT = 80
    const GAP_X = 50
    const GAP_Y = 100
    
    levelNodes.forEach((nodeIds, level) => {
      nodeIds.forEach((nodeId, index) => {
        const x = index * (NODE_WIDTH + GAP_X)
        const y = level * (NODE_HEIGHT + GAP_Y)
        nodePositions.set(nodeId, { x, y })
      })
    })
    
    // 转换为 ReactFlow 节点
    const nodes: Node[] = currentCodeMap.nodes.map(node => {
      const pos = nodePositions.get(node.node_id) || { x: 0, y: 0 }
      const NodeIcon = getNodeIcon(node.title)
      
      return {
        id: node.node_id,
        position: pos,
        data: {
          label: (
            <div className="px-2 py-1">
              <div className="flex items-center gap-2">
                <NodeIcon size={14} className="text-muted-foreground" />
                <span className="font-medium text-sm">{node.title}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {node.code_refs.length} refs
              </div>
            </div>
          ),
          node,
        },
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          border: selectedNodeId === node.node_id ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: 'white',
        },
      }
    })
    
    // 转换为 ReactFlow 边
    const edges: Edge[] = currentCodeMap.edges.map(edge => {
      const EdgeIcon = getEdgeTypeIcon(edge.edge_type)
      
      return {
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          stroke: '#94a3b8',
          strokeWidth: 2,
        },
        label: (
          <div className="flex items-center gap-1 bg-white px-1 rounded">
            <EdgeIcon size={10} />
            <span className="text-xs">{edge.edge_type}</span>
          </div>
        ),
      }
    })
    
    return { nodes, edges }
  }, [currentCodeMap, selectedNodeId])
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  
  // 更新节点位置
  React.useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])
  
  React.useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )
  
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [setSelectedNodeId])
  
  if (!currentCodeMap) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No code map loaded
      </div>
    )
  }
  
  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}

export default GraphView