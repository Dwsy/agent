use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// CodeMap 索引
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeMapIndex {
    pub version: u32,
    pub project_root: String,
    pub codemaps: Vec<CodeMapMeta>,
}

/// CodeMap 元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeMapMeta {
    pub id: String,
    pub filename: String,
    pub title: String,
    pub description: String,
    pub query: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tags: Vec<String>,
    pub note: Option<String>,
}