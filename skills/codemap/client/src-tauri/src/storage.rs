use crate::codemap_meta::{CodeMapIndex, CodeMapMeta};
use crate::codemap_v2::{CodeMap, ModelTier};
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use chrono::Utc;

pub struct Storage {
    codemap_dir: PathBuf,
}

impl Storage {
    pub fn new(project_root: &str) -> Result<Self> {
        let codemap_dir = PathBuf::from(project_root)
            .join("docs")
            .join(".codemap");
        
        // Create directory structure
        fs::create_dir_all(&codemap_dir)?;
        fs::create_dir_all(codemap_dir.join("codemaps"))?;
        fs::create_dir_all(codemap_dir.join("exports"))?;
        fs::create_dir_all(codemap_dir.join("cache"))?;
        
        // Initialize index if it doesn't exist
        let index_path = codemap_dir.join("index.json");
        if !index_path.exists() {
            let index = CodeMapIndex {
                version: 1,
                project_root: project_root.to_string(),
                codemaps: Vec::new(),
            };
            let json = serde_json::to_string_pretty(&index)?;
            fs::write(&index_path, json)?;
        }
        
        Ok(Storage { codemap_dir })
    }
    
    pub fn save_codemap(&self, codemap: &CodeMap) -> Result<String> {
        let filename = Self::codemap_filename(&codemap.codemap_id);
        let filepath = self.codemap_dir.join("codemaps").join(&filename);
        
        // Save CodeMap file
        let json = serde_json::to_string_pretty(codemap)?;
        fs::write(&filepath, json)?;
        
        // Update index
        let mut index = self.load_index()?;
        
        // Update or add to index
        if let Some(existing) = index.codemaps.iter_mut().find(|c| c.id == codemap.codemap_id) {
            existing.filename = filename.clone();
            existing.title = codemap.title.clone();
            existing.description = codemap.title.clone();
            existing.query = codemap.prompt.clone();
            existing.updated_at = Utc::now();
            existing.tags = vec![Self::model_tier_tag(&codemap.generation.model_tier)];
            existing.note = None;
        } else {
            index.codemaps.push(CodeMapMeta {
                id: codemap.codemap_id.clone(),
                filename: filename.clone(),
                title: codemap.title.clone(),
                description: codemap.title.clone(),
                query: codemap.prompt.clone(),
                created_at: codemap.created_at,
                updated_at: Utc::now(),
                tags: vec![Self::model_tier_tag(&codemap.generation.model_tier)],
                note: None,
            });
        }
        
        self.save_index(&index)?;
        
        Ok(codemap.codemap_id.clone())
    }
    
    pub fn load_codemap(&self, id: &str) -> Result<CodeMap> {
        let index = self.load_index()?;
        let meta = index.codemaps.iter()
            .find(|c| c.id == id)
            .context("CodeMap not found")?;
        
        let filepath = self.codemap_dir.join("codemaps").join(&meta.filename);
        let json = fs::read_to_string(&filepath)?;
        let codemap: CodeMap = serde_json::from_str(&json)?;
        
        Ok(codemap)
    }
    
    pub fn list_codemaps(&self) -> Result<Vec<CodeMapMeta>> {
        let index = self.load_index()?;
        Ok(index.codemaps)
    }
    
    pub fn delete_codemap(&self, id: &str) -> Result<()> {
        let mut index = self.load_index()?;
        let codemap_meta = index.codemaps.iter()
            .find(|c| c.id == id)
            .context("CodeMap not found")?;

        // Delete file
        let filepath = self.codemap_dir.join("codemaps").join(&codemap_meta.filename);
        if filepath.exists() {
            fs::remove_file(filepath)?;
        }

        // Remove from index
        index.codemaps.retain(|c| c.id != id);
        self.save_index(&index)?;

        Ok(())
    }

    pub fn update_codemap_meta(
        &self,
        id: &str,
        title: Option<String>,
        note: Option<String>,
        tags: Option<Vec<String>>,
    ) -> Result<CodeMapMeta> {
        let mut index = self.load_index()?;

        let meta = index.codemaps.iter_mut()
            .find(|c| c.id == id)
            .context("CodeMap not found")?;

        let filename = meta.filename.clone();

        // Update fields if provided
        if let Some(ref new_title) = title {
            meta.title = new_title.clone();
        }
        if let Some(new_note) = note {
            meta.note = Some(new_note);
        }
        if let Some(new_tags) = tags {
            meta.tags = new_tags;
        }
        meta.updated_at = Utc::now();

        let updated_meta = meta.clone();
        self.save_index(&index)?;

        self.update_codemap_file(&filename, title)?;

        Ok(updated_meta)
    }
    
    pub fn export_codemap(&self, id: &str, format: &str) -> Result<String> {
        let codemap = self.load_codemap(id)?;
        let exports_dir = self.codemap_dir.join("exports");
        fs::create_dir_all(&exports_dir)?;
        
        let filename_base = codemap.codemap_id.clone();
        let export_path = match format {
            "json" => {
                let filepath = exports_dir.join(format!("{}.json", filename_base));
                let json = serde_json::to_string_pretty(&codemap)?;
                fs::write(&filepath, json)?;
                filepath.to_string_lossy().to_string()
            }
            "markdown" => {
                let filepath = exports_dir.join(format!("{}.md", filename_base));
                let markdown = self.codemap_to_markdown(&codemap);
                fs::write(&filepath, markdown)?;
                filepath.to_string_lossy().to_string()
            }
            "html" => {
                let filepath = exports_dir.join(format!("{}.html", filename_base));
                let html = self.codemap_to_html(&codemap);
                fs::write(&filepath, html)?;
                filepath.to_string_lossy().to_string()
            }
            _ => anyhow::bail!("Unsupported export format: {}", format),
        };
        
        Ok(export_path)
    }
    
    pub fn import_codemap(&self, file_path: &str) -> Result<CodeMap> {
        let json = fs::read_to_string(file_path)?;
        let mut codemap: CodeMap = serde_json::from_str(&json)?;
        
        // Generate new ID to avoid conflicts
        let now = Utc::now();
        let new_id = format!("{}-import", now.format("%Y%m%d"));
        codemap.codemap_id = new_id.clone();
        codemap.created_at = now;
        
        self.save_codemap(&codemap)?;
        
        Ok(codemap)
    }
    
    fn load_index(&self) -> Result<CodeMapIndex> {
        let index_path = self.codemap_dir.join("index.json");
        
        // If file doesn't exist, return empty index
        if !index_path.exists() {
            return Ok(CodeMapIndex {
                version: 1,
                project_root: self.codemap_dir.parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .to_string(),
                codemaps: Vec::new(),
            });
        }
        
        let json = fs::read_to_string(&index_path)?;
        
        // If file is empty, return empty index
        if json.trim().is_empty() {
            return Ok(CodeMapIndex {
                version: 1,
                project_root: self.codemap_dir.parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .to_string(),
                codemaps: Vec::new(),
            });
        }
        
        let index: CodeMapIndex = serde_json::from_str(&json)
            .map_err(|e| anyhow::anyhow!("Failed to parse index.json: {}", e))?;
        Ok(index)
    }
    
    fn save_index(&self, index: &CodeMapIndex) -> Result<()> {
        let index_path = self.codemap_dir.join("index.json");
        let json = serde_json::to_string_pretty(index)?;
        fs::write(&index_path, json)?;
        Ok(())
    }

    fn update_codemap_file(&self, filename: &str, title: Option<String>) -> Result<()> {
        if title.is_none() {
            return Ok(());
        }

        let filepath = self.codemap_dir.join("codemaps").join(filename);
        if !filepath.exists() {
            return Ok(());
        }

        let json = fs::read_to_string(&filepath)?;
        let mut codemap: CodeMap = serde_json::from_str(&json)?;

        if let Some(new_title) = title {
            codemap.title = new_title;
        }

        let updated_json = serde_json::to_string_pretty(&codemap)?;
        fs::write(&filepath, updated_json)?;
        Ok(())
    }
    
    fn codemap_to_markdown(&self, codemap: &CodeMap) -> String {
        let mut md = String::new();
        
        md.push_str(&format!("# {}\n\n", codemap.title));
        md.push_str(&format!("**提示词**: {}\n\n", codemap.prompt));
        md.push_str(&format!("**创建时间**: {}\n\n", codemap.created_at.format("%Y-%m-%d %H:%M:%S")));
        md.push_str(&format!("**仓库**: {} ({})\n\n", codemap.repo.name, codemap.repo.revision));
        md.push_str(&format!("**模型档位**: {}\n\n", Self::model_tier_tag(&codemap.generation.model_tier)));
        
        if codemap.nodes.is_empty() {
            md.push_str("## 节点\n\n暂无节点。\n");
            return md;
        }
        
        md.push_str("## 节点\n\n");
        for node in &codemap.nodes {
            md.push_str(&format!("### {} ({})\n\n", node.title, node.node_id));
            md.push_str(&format!("{}\n\n", node.summary));
            
            if !node.code_refs.is_empty() {
                md.push_str("**代码引用**:\n\n");
                for code_ref in &node.code_refs {
                    md.push_str(&format!(
                        "- `{}`:{}-{} {}\n",
                        code_ref.path,
                        code_ref.start_line,
                        code_ref.end_line,
                        code_ref.symbol.as_deref().unwrap_or("")
                    ));
                }
                md.push('\n');
            }
            
            if !node.trace_guide.short.is_empty() {
                md.push_str("**追踪指南**:\n\n");
                md.push_str(&format!("{}\n\n", node.trace_guide.short));
            }
        }
        
        md
    }
    
    fn codemap_to_html(&self, codemap: &CodeMap) -> String {
        let markdown = self.codemap_to_markdown(codemap);
        let mut html = String::new();
        
        html.push_str("<!DOCTYPE html>\n");
        html.push_str("<html lang=\"zh-CN\">\n");
        html.push_str("<head>\n");
        html.push_str("  <meta charset=\"UTF-8\">\n");
        html.push_str("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
        html.push_str(&format!("  <title>{}</title>\n", codemap.title));
        html.push_str("  <style>\n");
        html.push_str("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; }\n");
        html.push_str("    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; white-space: pre-wrap; }\n");
        html.push_str("  </style>\n");
        html.push_str("</head>\n");
        html.push_str("<body>\n");
        html.push_str(&format!("  <h1>{}</h1>\n", codemap.title));
        html.push_str("  <pre>\n");
        html.push_str(&Self::escape_html(&markdown));
        html.push_str("  </pre>\n");
        html.push_str("</body>\n");
        html.push_str("</html>\n");
        
        html
    }

    fn codemap_filename(id: &str) -> String {
        format!("{}.json", id)
    }

    fn model_tier_tag(model_tier: &ModelTier) -> String {
        match model_tier {
            ModelTier::Fast => "fast".to_string(),
            ModelTier::Smart => "smart".to_string(),
        }
    }

    fn escape_html(input: &str) -> String {
        input
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    }
}
