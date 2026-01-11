use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

/// 应用状态：保存项目根目录
#[derive(Default)]
pub struct CodeBrowserState {
    root: Mutex<Option<PathBuf>>,
}

/// 目录条目 DTO
#[derive(Serialize, Clone)]
pub struct DirEntryDto {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
}

/// 解析路径并确保在根目录下（安全校验）
fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // 禁止绝对路径
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err("Absolute path not allowed".into());
    }

    // 检查路径穿越
    if rel.starts_with("..") || rel.contains("/../") || rel.contains("\\..\\") {
        return Err("Path traversal detected (../)".into());
    }

    let joined = root.join(rel_path);

    // 规范化路径
    let canon = joined
        .canonicalize()
        .map_err(|e| format!("canonicalize failed: {}", e))?;

    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("root canonicalize failed: {}", e))?;

    // 确保路径在根目录下
    if !canon.starts_with(&root_canon) {
        return Err("Path traversal detected".into());
    }

    Ok(canon)
}

/// 设置项目根目录
#[tauri::command]
pub fn set_root_dir(state: State<CodeBrowserState>, root: String) -> Result<(), String> {
    let p = PathBuf::from(&root);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", root));
    }
    if !p.is_dir() {
        return Err("Root must be a directory".into());
    }

    // 规范化路径
    let canon = p.canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    *state.root.lock().unwrap() = Some(canon);
    Ok(())
}

/// 列出目录内容（懒加载）
#[tauri::command]
pub fn list_dir(state: State<CodeBrowserState>, rel: String) -> Result<Vec<DirEntryDto>, String> {
    let root = state.root.lock().unwrap().clone().ok_or("Root directory not set. Please select a project directory first.")?;
    
    // 空路径表示根目录
    let rel_path = if rel.is_empty() { "." } else { &rel };
    
    let dir_path = resolve_under_root(&root, rel_path)?;

    if !dir_path.is_dir() {
        return Err("Path is not a directory".into());
    }

    let mut entries = Vec::new();

    for entry in std::fs::read_dir(&dir_path).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();

        // 跳过隐藏文件和目录
        if name.starts_with('.') {
            continue;
        }

        // 生成相对路径
        let rel_path = path
            .strip_prefix(&root)
            .map_err(|e| format!("Failed to strip prefix: {}", e))?
            .to_string_lossy()
            .replace('\\', "/");

        entries.push(DirEntryDto {
            name,
            rel_path,
            is_dir,
        });
    }

    // 排序：目录在前，文件在后，按字母顺序
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(entries)
}

/// 读取文件内容（带大文件保护）
#[tauri::command]
pub fn read_file(state: State<CodeBrowserState>, rel: String) -> Result<String, String> {
    let root = state.root.lock().unwrap().clone().ok_or("Root directory not set. Please select a project directory first.")?;
    let file_path = resolve_under_root(&root, &rel)?;

    if file_path.is_dir() {
        return Err("Cannot read a directory as a file".into());
    }

    // 检查文件大小（限制为 10MB）
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File is too large ({} MB). Maximum allowed size is 10 MB.",
            metadata.len() / (1024 * 1024)
        ));
    }

    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 获取根目录路径
#[tauri::command]
pub fn get_root_dir(state: State<CodeBrowserState>) -> Result<Option<String>, String> {
    let root = state.root.lock().unwrap().clone();
    Ok(root.map(|p| p.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_traversal_detection() {
        let root = PathBuf::from("/safe/root");
        
        // 正常路径应该通过
        assert!(resolve_under_root(&root, "src/main.rs").is_ok());
        assert!(resolve_under_root(&root, "subdir/file.txt").is_ok());
        
        // 路径穿越应该失败
        assert!(resolve_under_root(&root, "../etc/passwd").is_err());
        assert!(resolve_under_root(&root, "src/../../etc").is_err());
    }
}