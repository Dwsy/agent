/**
 * 文件工具
 */

import { readFileSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

export interface FileContent {
  path: string;
  content: string;
}

/**
 * 读取文件内容
 */
export function readFiles(filePaths: string[], projectRoot: string): FileContent[] {
  const files: FileContent[] = [];

  for (const filePath of filePaths) {
    try {
      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        continue;
      }

      const relativePath = relative(projectRoot, filePath);
      const content = readFileSync(filePath, 'utf-8');

      files.push({
        path: relativePath,
        content
      });
    } catch (e) {
      console.error(`Failed to read file: ${filePath}`, e);
    }
  }

  return files;
}

/**
 * 根据文件扩展名获取语言
 */
export function getFileLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();

  const langMap: Record<string, string> = {
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
 * 格式化文件为 Markdown 代码块
 */
export function formatFileAsMarkdown(file: FileContent): string {
  const lang = getFileLanguage(file.path);
  return `## ${file.path}
\`\`\`${lang}
${file.content}
\`\`\``;
}

/**
 * 构建生成提示
 */
export function buildGeneratePrompt(query: string, files: FileContent[]): string {
  const filesMarkdown = files.map(formatFileAsMarkdown).join('\n\n');

  return `Generate a CodeMap JSON for: "${query}"

Files to analyze:
${filesMarkdown}

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
}