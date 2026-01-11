use tauri::command;
use std::process::Command;
use std::io::{BufRead, BufReader};
use std::thread;
use std::time::Duration;
use anyhow::Result;

/// 执行 shell 命令（通过 tmux）
#[command]
pub async fn execute_command(
    command: String,
    args: Vec<String>,
) -> Result<String, String> {
    // 使用 tmux 执行命令，避免阻塞
    let session_name = format!("codemap_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs());
    
    // 创建 tmux session 并执行命令
    let output = Command::new("tmux")
        .args([
            "new-session",
            "-d",
            "-s",
            &session_name,
            &format!("{} {}", command, args.join(" "))
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Tmux session creation failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    
    // 等待命令完成
    thread::sleep(Duration::from_millis(500));
    
    // 获取 tmux session 输出
    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t",
            &session_name,
            "-p"
        ])
        .output()
        .map_err(|e| format!("Failed to capture tmux output: {}", e))?;
    
    let result = String::from_utf8_lossy(&output.stdout).to_string();
    
    // 清理 tmux session
    let _ = Command::new("tmux")
        .args(["kill-session", "-t", &session_name])
        .output();
    
    Ok(result)
}

/// 执行命令并返回流式输出
#[command]
pub async fn execute_command_stream(
    command: String,
    args: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut output_lines = Vec::new();
    
    // 直接执行命令
    let mut child = Command::new(&command)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;
    
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
    
    // 使用单独的线程读取输出
    let (tx, rx) = std::sync::mpsc::channel();
    
    // 读取 stdout
    let tx_stdout = tx.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = tx_stdout.send(("stdout", line));
            }
        }
    });
    
    // 读取 stderr
    let tx_stderr = tx.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = tx_stderr.send(("stderr", line));
            }
        }
    });
    
    // 关闭原始发送者
    drop(tx);
    
    // 收集所有输出
    for (stream, line) in rx {
        if stream == "stderr" {
            // stderr 包含日志信息，但 JSON 输出到 stdout
            // 只在行包含 ERROR 时才标记为错误
            if line.contains("Error:") || line.contains("Failed to") {
                output_lines.push(format!("ERROR: {}", line));
            }
        } else {
            // stdout 包含 JSON 输出
            // 过滤掉日志行，只保留 JSON 相关内容
            if !line.starts_with("Generating CodeMap") &&
               !line.starts_with("Query:") &&
               !line.starts_with("Files:") &&
               !line.starts_with("Project Root:") &&
               !line.starts_with("Model Tier:") &&
               !line.starts_with("Provider:") &&
               !line.starts_with("Calling") &&
               !line.starts_with("Pi CLI") &&
               !line.starts_with("Claude") &&
               !line.starts_with("output length:") &&
               !line.starts_with("Total lines:") &&
               !line.starts_with("Extracted content") &&
               !line.starts_with("content length:") &&
               !line.starts_with("Using raw stdout") &&
               !line.starts_with("Extracted from") &&
               !line.starts_with("Direct JSON parse") &&
               !line.starts_with("Failed to parse line") &&
               !line.starts_with("Successfully generated codemap") &&
               !line.starts_with("Successfully parsed") &&
               !line.starts_with("Detected") &&
               !line.starts_with("Parsing") &&
               !line.trim().is_empty() {
                output_lines.push(line);
            }
        }
    }
    
    // 等待命令完成
    let status = child.wait()
        .map_err(|e| format!("Failed to wait for command: {}", e))?;
    
    if !status.success() {
        return Err(format!("Command failed with status: {}", status));
    }
    
    Ok(output_lines)
}

/// 检查 tmux 是否安装
#[command]
pub async fn check_tmux() -> Result<bool, String> {
    let output = Command::new("tmux")
        .args(["-V"])
        .output();
    
    match output {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

/// 从输出中提取 JSON
pub fn extract_json_from_output(output: &str) -> Result<String, String> {
    // 查找 JSON 开始和结束
    let start = output.find('{')
        .ok_or("No JSON found in output")?;
    
    let end = output.rfind('}')
        .ok_or("No JSON end found in output")?;
    
    Ok(output[start..=end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_json() {
        let output = r#"Some text
{"test": "value"}
More text"#;
        
        let result = extract_json_from_output(output);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), r#"{"test": "value"}"#);
    }
}