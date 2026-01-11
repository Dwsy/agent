#!/usr/bin/env node

/**
 * CodeMap Generator - Pi Agent Skill
 * 
 * This script generates CodeMap JSON using Pi CLI
 * Used by Tauri client to generate code maps
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node generator.js <action> [options]');
    console.error('Actions: generate, analyze');
    process.exit(1);
  }
  
  const action = args[0];
  
  try {
    switch (action) {
      case 'generate':
        await generateCodemap(args.slice(1));
        break;
      case 'analyze':
        await analyzeCode(args.slice(1));
        break;
      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Generate CodeMap using Pi CLI
 */
async function generateCodemap(args) {
  const [query, filesStr, projectRoot, modelTier = 'fast'] = args;
  
  if (!query || !filesStr || !projectRoot) {
    throw new Error('Missing required arguments: query, files, projectRoot');
  }
  
  const files = JSON.parse(filesStr);
  
  console.error('Generating CodeMap with Pi CLI...');
  console.error(`Query: ${query}`);
  console.error(`Files: ${files.length}`);
  console.error(`Project Root: ${projectRoot}`);
  console.error(`Model Tier: ${modelTier}`);
  
  try {
    // Read file contents
    const fileContents = await Promise.all(
      files.map(async (filePath) => {
        try {
          const relativePath = path.relative(projectRoot, filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          return {
            path: relativePath,
            content: content
          };
        } catch (e) {
          console.error(`Failed to read file: ${filePath}`, e.message);
          return null;
        }
      })
    );
    
    const validFiles = fileContents.filter(f => f !== null);
    
    if (validFiles.length === 0) {
      throw new Error('No valid files to analyze');
    }
    
    // Build prompt for Pi
    const userPrompt = `Generate a CodeMap JSON for: "${query}"

Files to analyze:
${validFiles.map(f => `
## ${f.path}
\`\`\`${getFileLanguage(f.path)}
${f.content}
\`\`\`
`).join('\n')}

Requirements:
1. Extract all components, functions, classes
2. Identify relationships between them
3. Create code references with exact line numbers
4. Write detailed trace guides

Return ONLY valid JSON (no markdown, no explanations):

{
  "schema_version": "0.1",
  "codemap_id": "cm_<timestamp>",
  "title": "CodeMap: <query>",
  "prompt": "<query>",
  "created_at": "<ISO8601>",
  "repo": {"name": "<project>", "revision": "live", "snapshot_mode": "live"},
  "generation": {"model_tier": "<fast|smart>", "zdr": true, "budgets": {"max_files": 50, "max_chunks": 200}},
  "nodes": [{"node_id": "n_<i>", "title": "<Component Name>", "summary": "<Brief description>", "children": ["n_<child_id>", ...], "code_refs": [{"path": "<file>", "start_line": <num>, "end_line": <num>, "symbol": "<symbol>"}], "trace_guide": {"short": "<one line>", "long": "<detailed markdown>"}}],
  "edges": [{"from": "n_<i>", "to": "n_<j>", "edge_type": "<calls|data_flow|depends>"}]
}`;

    // Call Pi CLI
    const codemap = await callPiCLI(userPrompt, modelTier);
    
    // Output JSON
    console.log(JSON.stringify(codemap, null, 2));
    
  } catch (error) {
    console.error('Failed to generate codemap:', error.message);
    throw error;
  }
}

/**
 * Call Pi CLI and parse streaming JSON response
 */
async function callPiCLI(userPrompt, modelTier) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--model', modelTier === 'smart' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
      userPrompt
    ];
    
    console.error('Calling Pi CLI...');
    
    const pi = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    pi.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pi.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pi.on('close', (code) => {
      if (code !== 0) {
        console.error('Pi CLI stderr:', stderr);
        reject(new Error(`Pi CLI exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        console.error('Pi CLI output length:', stdout.length);
        
        // 处理流式 JSON 输出
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        console.error('Total lines:', lines.length);
        
        let fullContent = '';
        
        // 解析每一行 JSON，提取实际内容
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            
            // 检查是否是消息更新
            if (json.type === 'message_update' && json.assistantMessageEvent) {
              const event = json.assistantMessageEvent;
              
              // 提取内容
              if (event.content && Array.isArray(event.content)) {
                for (const contentItem of event.content) {
                  if (contentItem.type === 'text') {
                    fullContent += contentItem.text;
                  }
                  // 忽略 thinking 类型的内容
                }
              }
              
              // 检查 delta (增量内容)
              if (event.delta) {
                fullContent += event.delta;
              }
            }
            
            // 检查是否是最终消息
            if (json.message && json.message.content && Array.isArray(json.message.content)) {
              for (const contentItem of json.message.content) {
                if (contentItem.type === 'text') {
                  fullContent += contentItem.text;
                }
              }
            }
          } catch (e) {
            // 如果不是 JSON，可能是纯文本输出（应该不会发生）
            // 但也可能是 JSON 解析失败，尝试直接添加到内容
            console.error('Failed to parse line as JSON:', line.substring(0, 100));
            // 不添加到 fullContent，因为它可能是流式 JSON 的一部分
          }
        }
        
        console.error('Extracted content length:', fullContent.length);
        console.error('Content preview:', fullContent.substring(0, 500));
        
        // 如果没有提取到内容，尝试直接使用原始输出
        if (!fullContent.trim()) {
          console.error('No content extracted, using raw stdout');
          fullContent = stdout;
        }
        
        if (!fullContent.trim()) {
          throw new Error('No content extracted from Pi CLI response');
        }
        
        // 从内容中提取 JSON
        let codemap;
        
        // 首先尝试提取 JSON 代码块
        const jsonMatch = fullContent.match(/```(?:json)?\s*(\{[\s\S]*?\n\})\s*```/);
        if (jsonMatch) {
          codemap = JSON.parse(jsonMatch[1]);
          console.error('Extracted from markdown block');
        } else {
          // 尝试直接解析整个内容
          try {
            codemap = JSON.parse(fullContent.trim());
            console.error('Direct JSON parse succeeded');
          } catch (e) {
            console.error('Direct JSON parse failed, trying extraction methods...');
            
            // 尝试提取第一个完整的 JSON 对象
            const firstBrace = fullContent.indexOf('{');
            const lastBrace = fullContent.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const jsonStr = fullContent.substring(firstBrace, lastBrace + 1);
              codemap = JSON.parse(jsonStr);
              console.error('Extracted from first JSON object');
            } else {
              throw new Error('Could not extract JSON from response');
            }
          }
        }
        
        // 验证必需字段
        if (!codemap.nodes || !Array.isArray(codemap.nodes)) {
          throw new Error('Invalid codemap: missing nodes array');
        }
        
        if (codemap.nodes.length === 0) {
          console.warn('Warning: Codemap has no nodes');
        }
        
        // 添加缺失的必需字段
        if (!codemap.schema_version) codemap.schema_version = '0.1';
        if (!codemap.created_at) codemap.created_at = new Date().toISOString();
        if (!codemap.repo) {
          codemap.repo = { name: 'project', revision: 'live', snapshot_mode: 'live' };
        }
        if (!codemap.generation) {
          codemap.generation = {
            model_tier: modelTier,
            zdr: true,
            budgets: { max_files: 50, max_chunks: 200 }
          };
        }
        if (!codemap.edges) codemap.edges = [];
        
        console.error('Successfully parsed codemap with', codemap.nodes.length, 'nodes');
        resolve(codemap);
        
      } catch (e) {
        console.error('Failed to parse Pi CLI response:', e.message);
        console.error('Full output:', stdout);
        reject(new Error(`Failed to parse Pi CLI response: ${e.message}`));
      }
    });
    
    pi.on('error', (error) => {
      console.error('Failed to spawn Pi CLI:', error.message);
      reject(new Error(`Failed to spawn Pi CLI: ${error.message}`));
    });
    
    // 设置超时
    setTimeout(() => {
      pi.kill();
      reject(new Error('Pi CLI timeout after 60 seconds'));
    }, 60000); // 60 秒超时
  });
}

/**
 * Get file language based on extension
 */
function getFileLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  const langMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.dart': 'dart',
    '.scala': 'scala',
    '.sh': 'bash',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.xml': 'xml',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.md': 'markdown',
    '.sql': 'sql'
  };
  
  return langMap[ext] || 'text';
}

/**
 * Analyze code (legacy, kept for compatibility)
 */
async function analyzeCode(args) {
  const [filePath] = args;
  
  if (!filePath) {
    throw new Error('Missing file path');
  }
  
  console.error('Analyzing code...');
  console.error(`File: ${filePath}`);
  
  // Use Pi CLI to analyze file
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    throw new Error(`Failed to read file: ${e.message}`);
  }
  
  const userPrompt = `Analyze this code and return JSON with functions, classes, imports, and complexity metrics:\n\n\`\`\`${getFileLanguage(filePath)}\n${content}\n\`\`\`\n\nReturn JSON: {"file": "${filePath}", "type": "<ext>", "functions": [...], "classes": [...], "imports": [...]}`;
  
  try {
    const analysis = await callPiCLI(userPrompt, 'fast');
    console.log(JSON.stringify(analysis, null, 2));
  } catch (e) {
    throw e;
  }
}

// Run
if (require.main === module) {
  main();
}

module.exports = { generateCodemap, analyzeCode };