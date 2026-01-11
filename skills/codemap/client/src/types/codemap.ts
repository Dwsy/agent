// CodeMap 数据类型定义
// 参考：Windsurf Codemaps + Cognition 方案

/**
 * 快照模式
 */
export enum SnapshotMode {
  RevisionPinned = 'revision_pinned',
  Live = 'live',
}

/**
 * 模型档位
 */
export enum ModelTier {
  Fast = 'fast',
  Smart = 'smart',
}

/**
 * 边类型
 */
export enum EdgeType {
  Calls = 'calls',
  Depends = 'depends',
  DataFlow = 'data_flow',
  Inherits = 'inherits',
}

/**
 * 仓库信息
 */
export interface RepoInfo {
  name: string;
  revision: string;
  snapshot_mode: SnapshotMode;
}

/**
 * 预算限制
 */
export interface Budgets {
  max_files: number;
  max_chunks: number;
}

/**
 * 生成配置
 */
export interface GenerationConfig {
  model_tier: ModelTier;
  zdr: boolean;
  budgets: Budgets;
}

/**
 * 代码引用
 */
export interface CodeRef {
  path: string;
  start_line: number;
  end_line: number;
  symbol?: string;
}

/**
 * 跟踪指南
 */
export interface TraceGuide {
  short: string;
  long: string;
}

/**
 * 节点
 */
export interface Node {
  node_id: string;
  title: string;
  summary: string;
  children: string[];
  code_refs: CodeRef[];
  trace_guide: TraceGuide;
}

/**
 * 边
 */
export interface Edge {
  from: string;
  to: string;
  edge_type: EdgeType;
}

/**
 * CodeMap 完整数据结构
 */
export interface CodeMap {
  schema_version: string;
  codemap_id: string;
  title: string;
  prompt: string;
  created_at: string;
  repo: RepoInfo;
  generation: GenerationConfig;
  nodes: Node[];
  edges: Edge[];
  mermaid_diagram?: string;
}

/**
 * CodeMap 元数据（用于列表展示）
 */
export interface CodeMapMeta {
  id: string;
  filename: string;
  title: string;
  description: string;
  query: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  note?: string;
}

/**
 * 建议主题
 */
export interface SuggestedTopic {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

/**
 * 视图模式
 */
export enum ViewMode {
  Tree = 'tree',
  Graph = 'graph',
  Mermaid = 'mermaid',
}

/**
 * 面板布局
 */
export interface PanelLayout {
  treeWidth: number;
  detailsWidth: number;
  showDetails: boolean;
}