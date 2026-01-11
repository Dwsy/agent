use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Codemap 数据结构
/// 参考：Windsurf Codemaps + Cognition 方案
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeMap {
    /// Schema 版本
    pub schema_version: String,
    
    /// Codemap ID
    pub codemap_id: String,
    
    /// 标题
    pub title: String,
    
    /// 用户提示词（任务描述）
    pub prompt: String,
    
    /// 创建时间
    pub created_at: DateTime<Utc>,
    
    /// 仓库信息
    pub repo: RepoInfo,
    
    /// 生成配置
    pub generation: GenerationConfig,
    
    /// 节点列表
    pub nodes: Vec<Node>,
    
    /// 边列表（用于图视图）
    pub edges: Vec<Edge>,
    
    /// Mermaid 流程图代码
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mermaid_diagram: Option<String>,
}

/// 仓库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoInfo {
    /// 仓库名称
    pub name: String,
    
    /// 版本信息（git commit hash 或其他标识）
    pub revision: String,
    
    /// 快照模式
    pub snapshot_mode: SnapshotMode,
}

/// 快照模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotMode {
    /// 修订固定（绑定特定 git commit）
    RevisionPinned,
    /// 实时（当前工作区）
    Live,
}

/// 生成配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationConfig {
    /// 模型档位
    pub model_tier: ModelTier,
    
    /// 零数据保留（Zero Data Retention）
    pub zdr: bool,
    
    /// 预算限制
    pub budgets: Budgets,
}

/// 模型档位
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    /// 快速（低成本、快速、质量一般）
    Fast,
    /// 智能（高质量、慢速、成本高）
    Smart,
}

/// 预算限制
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Budgets {
    /// 最大文件数
    pub max_files: usize,
    
    /// 最大代码块数
    pub max_chunks: usize,
}

/// 节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    /// 节点 ID
    pub node_id: String,
    
    /// 标题
    pub title: String,
    
    /// 摘要（短描述）
    pub summary: String,
    
    /// 子节点 ID 列表
    pub children: Vec<String>,
    
    /// 代码引用列表
    pub code_refs: Vec<CodeRef>,
    
    /// 跟踪指南
    pub trace_guide: TraceGuide,
}

/// 代码引用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeRef {
    /// 文件路径（相对于项目根目录）
    pub path: String,
    
    /// 起始行号（1-based）
    pub start_line: usize,
    
    /// 结束行号（1-based）
    pub end_line: usize,
    
    /// 可选的符号名（函数/类名等）
    pub symbol: Option<String>,
}

/// 跟踪指南
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceGuide {
    /// 短描述（默认显示）
    pub short: String,
    
    /// 长描述（"See more" 展开）
    pub long: String,
}

/// 边（用于图视图）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    /// 源节点 ID
    pub from: String,
    
    /// 目标节点 ID
    pub to: String,
    
    /// 边类型
    pub edge_type: EdgeType,
}

/// 边类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeType {
    /// 调用关系
    Calls,
    /// 依赖关系
    Depends,
    /// 数据流
    DataFlow,
    /// 继承关系
    Inherits,
}

impl CodeMap {
    /// 创建新的 CodeMap
    #[allow(dead_code)]
    pub fn new(
        prompt: String,
        _project_root: String,
        repo_name: String,
        model_tier: ModelTier,
    ) -> Self {
        let now = Utc::now();
        let codemap_id = format!("cm_{}", now.timestamp());
        
        let is_fast = matches!(model_tier, ModelTier::Fast);
        
        CodeMap {
            schema_version: "0.1".to_string(),
            codemap_id: codemap_id.clone(),
            title: format!("Codemap: {}", prompt),
            prompt,
            created_at: now,
            repo: RepoInfo {
                name: repo_name,
                revision: "live".to_string(),
                snapshot_mode: SnapshotMode::Live,
            },
            generation: GenerationConfig {
                model_tier,
                zdr: true,
                budgets: Budgets {
                    max_files: if is_fast { 50 } else { 120 },
                    max_chunks: if is_fast { 200 } else { 400 },
                },
            },
            nodes: Vec::new(),
            edges: Vec::new(),
            mermaid_diagram: None,
        }
    }
    
    /// 添加节点
    #[allow(dead_code)]
    pub fn add_node(&mut self, node: Node) {
        self.nodes.push(node);
    }
    
    /// 添加边
    #[allow(dead_code)]
    pub fn add_edge(&mut self, edge: Edge) {
        self.edges.push(edge);
    }
    
    /// 获取节点
    #[allow(dead_code)]
    pub fn get_node(&self, node_id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.node_id == node_id)
    }
    
    /// 获取子节点
    #[allow(dead_code)]
    pub fn get_children(&self, node_id: &str) -> Vec<&Node> {
        let node = match self.get_node(node_id) {
            Some(n) => n,
            None => return Vec::new(),
        };
        node.children
            .iter()
            .filter_map(|child_id| self.get_node(child_id))
            .collect()
    }
    
    /// 获取根节点（没有父节点的节点）
    #[allow(dead_code)]
    pub fn get_root_nodes(&self) -> Vec<&Node> {
        let all_children: std::collections::HashSet<&String> = self.nodes
            .iter()
            .flat_map(|n| n.children.iter())
            .collect();
        
        self.nodes
            .iter()
            .filter(|n| !all_children.contains(&n.node_id))
            .collect()
    }
}

impl Node {
    /// 创建新节点
    #[allow(dead_code)]
    pub fn new(node_id: String, title: String, summary: String) -> Self {
        let summary_clone = summary.clone();
        Node {
            node_id,
            title,
            summary,
            children: Vec::new(),
            code_refs: Vec::new(),
            trace_guide: TraceGuide {
                short: summary_clone,
                long: String::new(),
            },
        }
    }
    
    /// 添加代码引用
    #[allow(dead_code)]
    pub fn add_code_ref(&mut self, code_ref: CodeRef) {
        self.code_refs.push(code_ref);
    }
    
    /// 添加子节点
    #[allow(dead_code)]
    pub fn add_child(&mut self, child_id: String) {
        self.children.push(child_id);
    }
    
    /// 设置跟踪指南
    #[allow(dead_code)]
    pub fn set_trace_guide(&mut self, short: String, long: String) {
        self.trace_guide = TraceGuide { short, long };
    }
}

impl CodeRef {
    /// 创建代码引用
    #[allow(dead_code)]
    pub fn new(path: String, start_line: usize, end_line: usize) -> Self {
        CodeRef {
            path,
            start_line,
            end_line,
            symbol: None,
        }
    }
    
    /// 设置符号名
    #[allow(dead_code)]
    pub fn with_symbol(mut self, symbol: String) -> Self {
        self.symbol = Some(symbol);
        self
    }
}

impl Edge {
    /// 创建边
    #[allow(dead_code)]
    pub fn new(from: String, to: String, edge_type: EdgeType) -> Self {
        Edge {
            from,
            to,
            edge_type,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_create_codemap() {
        let codemap = CodeMap::new(
            "用户登录流程".to_string(),
            "/path/to/project".to_string(),
            "example-repo".to_string(),
            ModelTier::Fast,
        );
        
        assert_eq!(codemap.schema_version, "0.1");
        assert!(codemap.codemap_id.starts_with("cm_"));
        assert_eq!(codemap.generation.model_tier, ModelTier::Fast);
        assert_eq!(codemap.generation.budgets.max_files, 50);
    }
    
    #[test]
    fn test_node_hierarchy() {
        let mut codemap = CodeMap::new(
            "测试".to_string(),
            "/path".to_string(),
            "test".to_string(),
            ModelTier::Fast,
        );
        
        let root = Node::new("n_root".to_string(), "Root".to_string(), "Root node".to_string());
        let child1 = Node::new("n_child1".to_string(), "Child1".to_string(), "Child1".to_string());
        let child2 = Node::new("n_child2".to_string(), "Child2".to_string(), "Child2".to_string());
        
        codemap.add_node(root.clone());
        codemap.add_node(child1.clone());
        codemap.add_node(child2.clone());
        
        let roots = codemap.get_root_nodes();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].node_id, "n_root");
    }
    
    #[test]
    fn test_code_ref() {
        let ref1 = CodeRef::new("src/main.rs".to_string(), 10, 20);
        assert_eq!(ref1.start_line, 10);
        assert_eq!(ref1.end_line, 20);
        assert!(ref1.symbol.is_none());
        
        let ref2 = CodeRef::new("src/main.rs".to_string(), 10, 20)
            .with_symbol("main".to_string());
        assert_eq!(ref2.symbol, Some("main".to_string()));
    }
}