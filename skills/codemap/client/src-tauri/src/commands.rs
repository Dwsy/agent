use crate::codemap_v2::CodeMap as CodeMapV2;
use crate::storage::Storage;
use tauri::command;
use anyhow::Result;
use std::fs;
use std::env;
use ignore::WalkBuilder;

#[command]
pub async fn get_project_root() -> Result<String, String> {
    // 获取当前工作目录
    let current_dir = env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let project_root = find_project_root(&current_dir).unwrap_or(current_dir);

    Ok(project_root.to_string_lossy().to_string())
}

fn find_project_root(start_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut dir = Some(start_dir);
    for _ in 0..5 {
        if let Some(current) = dir {
            let has_generator = current.join("generator").is_dir();
            let has_client = current.join("client").is_dir();
            let has_tauri = current.join("client").join("src-tauri").is_dir();
            let has_run_script = current.join("run.sh").is_file();

            if (has_generator && has_client) || (has_tauri && has_run_script) {
                return Some(current.to_path_buf());
            }

            dir = current.parent();
        } else {
            break;
        }
    }
    None
}

#[command]
pub async fn save_codemap(
    codemap_json: String,
    project_root: String,
) -> Result<String, String> {
    let codemap: CodeMapV2 = serde_json::from_str(&codemap_json)
        .map_err(|e| e.to_string())?;
    
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;
    
    storage
        .save_codemap(&codemap)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn list_codemaps(project_root: String) -> Result<String, String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| format!("Failed to create storage: {}", e))?;

    let codemaps = storage
        .list_codemaps()
        .map_err(|e| format!("Failed to list codemaps: {}", e))?;

    // Return empty array as JSON if no codemaps
    if codemaps.is_empty() {
        return Ok("[]".to_string());
    }

    serde_json::to_string(&codemaps).map_err(|e| format!("Failed to serialize codemaps: {}", e))
}

#[command]
pub async fn load_codemap(
    id: String,
    project_root: String,
) -> Result<String, String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;
    
    let codemap = storage
        .load_codemap(&id)
        .map_err(|e| e.to_string())?;
    
    serde_json::to_string(&codemap).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_codemap(
    id: String,
    project_root: String,
) -> Result<(), String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;

    storage
        .delete_codemap(&id)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn update_codemap_meta(
    id: String,
    project_root: String,
    title: Option<String>,
    note: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<String, String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;

    let updated_meta = storage
        .update_codemap_meta(&id, title, note, tags)
        .map_err(|e| e.to_string())?;

    serde_json::to_string(&updated_meta).map_err(|e| e.to_string())
}

#[command]
pub async fn export_codemap(
    id: String,
    format: String,
    project_root: String,
) -> Result<String, String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;
    
    storage
        .export_codemap(&id, &format)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn import_codemap(
    file_path: String,
    project_root: String,
) -> Result<String, String> {
    let storage = Storage::new(&project_root)
        .map_err(|e| e.to_string())?;
    
    let codemap = storage
        .import_codemap(&file_path)
        .map_err(|e| e.to_string())?;
    
    serde_json::to_string(&codemap).map_err(|e| e.to_string())
}

#[command]
pub async fn get_project_structure(
    project_root: String,
    include_patterns: Vec<String>,
    exclude_patterns: Vec<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut result = Vec::new();
    
    let mut walker = WalkBuilder::new(&project_root);
    
    // Add ignore patterns
    for pattern in exclude_patterns {
        walker.filter_entry(move |entry| {
            let path = entry.path();
            let path_str = path.to_string_lossy();
            !path_str.contains(&pattern)
        });
    }
    
    for entry in walker.build() {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        // Skip hidden files and directories
        if path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        
        // Skip node_modules, target, etc.
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules") ||
           path_str.contains("target") ||
           path_str.contains(".git") ||
           path_str.contains("dist") ||
           path_str.contains("build") {
            continue;
        }
        
        // Check include patterns
        if !include_patterns.is_empty() {
            let matches = include_patterns.iter().any(|pattern| {
                path_str.contains(pattern) || path.ends_with(pattern)
            });
            if !matches {
                continue;
            }
        }
        
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = metadata.is_dir();
        
        // Get relative path from project root
        let relative_path = path
            .strip_prefix(&project_root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        
        let file_type = if is_dir {
            "directory".to_string()
        } else {
            path.extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("file")
                .to_string()
        };
        
        let size = if is_dir { 0 } else { metadata.len() as i64 };
        
        result.push(serde_json::json!({
            "path": path.to_string_lossy().to_string(),
            "relativePath": relative_path,
            "name": path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            "isDirectory": is_dir,
            "fileType": file_type,
            "size": size,
        }));
    }
    
    // Sort: directories first, then files
    result.sort_by(|a, b| {
        let a_is_dir = a["isDirectory"].as_bool().unwrap_or(false);
        let b_is_dir = b["isDirectory"].as_bool().unwrap_or(false);
        
        if a_is_dir && !b_is_dir {
            std::cmp::Ordering::Less
        } else if !a_is_dir && b_is_dir {
            std::cmp::Ordering::Greater
        } else {
            a["name"].as_str().cmp(&b["name"].as_str())
        }
    });
    
    Ok(result)
}

#[command]
pub async fn read_file_content(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

/// 使用 pi agent 生成 CodeMap
#[command]
pub async fn generate_codemap_with_pi(
    query: String,
    files: Vec<String>,
    project_root: String,
    model_tier: String,
) -> Result<String, String> {
    use std::path::Path;
    
    // 获取 generator 目录路径
    let skill_path = std::env::var("PI_AGENT_SKILL_PATH")
        .unwrap_or_else(|_| "/Users/dengwenyu/.pi/agent/skills/codemap".to_string());
    
    let generator_dir = format!("{}/generator", skill_path);
    
    // 检查是否使用新的 TypeScript 版本
    let use_bun = Path::new(&generator_dir).join("src").exists();
    
    let (command, args) = if use_bun {
        // 使用新的 Bun + TypeScript 版本
        let files_json = serde_json::to_string(&files).unwrap();
        (
            "bun".to_string(),
            vec![
                "run".to_string(),
                format!("{}/src/index.ts", generator_dir),
                "generate".to_string(),
                query,
                files_json,
                project_root.clone(),
                model_tier,
                "pi".to_string(),   // provider
            ]
        )
    } else {
        // 使用旧的 Node.js 版本
        let files_json = serde_json::to_string(&files).unwrap();
        let generator_path = format!("{}/generator.js", generator_dir);
        (
            "node".to_string(),
            vec![
                generator_path,
                "generate".to_string(),
                query,
                files_json,
                project_root.clone(),
                model_tier,
            ]
        )
    };
    
    println!("Executing generator: {} {}", command, args.join(" "));
    
    use crate::executor::execute_command_stream;
    let output = execute_command_stream(command, args).await?;
    
    // 提取 JSON 输出
    let json_output = crate::executor::extract_json_from_output(&output.join("\n"))
        .map_err(|e| format!("Failed to extract JSON: {}", e))?;
    
    Ok(json_output)
}
