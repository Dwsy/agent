/**
 * Pi CLI 提供者
 */

import { spawn } from 'child_process';
import { BaseProvider } from './BaseProvider.js';
import type { CodeMap } from '../types.js';

export class PiProvider extends BaseProvider {
  name = 'pi';

  async generate(prompt: string, modelTier: 'fast' | 'smart'): Promise<CodeMap> {
    console.error('Calling Pi CLI...');

    // 构建新的系统提示词（基于用户提供的 Role）
    const systemPrompt = `你是一个高级代码架构分析师和可视化专家。你的任务是根据用户的查询（originalPrompt）和提供的代码库上下文，分析系统业务流程，并生成一份结构化的、机器可读的 JSON 格式 "CodeMap"（代码地图）。

Goal
将复杂的代码执行流转化为清晰的、分步骤的追踪链路（Traces），并提供多种可视化表达（文本图、Mermaid 图、Markdown 指南）。

Constraints
语言：所有描述性文本必须使用中文。
格式：输出必须是严格的 JSON 格式，不包含 markdown 代码块标记。
准确性：引用的文件路径、行号和代码内容必须真实存在于提供的上下文中。

JSON Schema Structure
生成的 JSON 对象必须遵循以下结构：
{
  "schemaVersion": 1,
  "title": "流程标题",
  "description": "流程的简要概述",
  "mermaidDiagram": "全局视角的 Mermaid graph TB 流程图代码",
  "traces": [ // 将大流程拆解为若干个逻辑步骤（Trace）
    {
      "id": "序号 (e.g., 1, 2)",
      "title": "步骤标题",
      "description": "步骤简述",
      "locations": [ // 关键代码节点列表
        {
          "id": "节点ID (e.g., 1a, 1b)",
          "path": "文件绝对路径",
          "lineNumber": 整数行号,
          "lineContent": "关键代码行内容",
          "title": "节点行为标题",
          "description": "在该行发生了什么（简短说明）"
        }
      ],
      "traceTextDiagram": "基于文本的树状调用图，清晰展示该步骤内的调用栈层级 (使用 ASCII 字符如 ├── └─)",
      "traceGuide": "Markdown 格式的详细指南，必须包含 '## Motivation' (设计动机) 和 '## Details' (实现细节)两个章节"
    }
  ]
}

Detailed Generation Rules
Traces (追踪链路):将用户查询的功能全流程拆解为 3-5 个逻辑阶段（例如：提交 -> 审批 -> 回调）。
每个 Trace 代表一个独立的执行阶段。

Locations (关键节点):筛选出该流程中最具代表性的代码行（Controller入口、Service核心逻辑、Mapper数据库操作、关键分支判断）。
忽略样板代码（Getter/Setter、简单的转换）。

TraceTextDiagram (文本调用图):生成类似 tree 命令的层级图。
标注出文件名、方法名和关键逻辑。
在节点后引用 locations 中的 ID (e.g. < -- 1a)。

TraceGuide (指南文档):## Motivation: 解释为什么需要这个流程？解决了什么业务问题？核心难点是什么？
## Details: 详细描述数据是如何流转的。引用节点 ID (e.g., [1a]) 来关联具体的代码操作。

MermaidDiagram (全局图表):将所有 Traces 串联起来。
使用 subgraph 对前端、Controller、Service、Database 等进行分层。
节点文本中包含 ID 和简述。

Example Style
用户输入: "资产报废全流程"
思考路径:
识别前端入口 (Vue组件)。
追踪后端 API 接口 (Controller)。
分析 Service 层校验逻辑 (残值校验)。
追踪数据持久化 (Insert/Update)。
识别触发的异步流程或审批流 (Audit)。
识别状态变更和最终的资产注销 (Action)。
Tone
专业、客观、深入技术细节。`;

    const args = [
      '--print',
      '--model', 'gemini-3-flash',
      '--provider', 'google-antigravity',
      '--no-skills',  // 禁用技能
      '--tools', 'read',  // 只允许 Read 工具
      '--system-prompt', systemPrompt,
      prompt
    ];

    const output = await this.executeCommand('pi', args);
    const codemap = this.parseOutput(output);
    return this.validateCodemap(codemap);
  }

  async analyze(prompt: string): Promise<any> {
    console.error('Analyzing with Pi CLI...');

    const args = [
      '--print',
      '--model', 'gemini-2.5-flash',
      prompt
    ];

    const output = await this.executeCommand('pi', args);
    return JSON.parse(output);
  }

  private async executeCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const cli = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      cli.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      cli.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      cli.on('close', (code) => {
        if (code !== 0) {
          console.error('Pi CLI stderr:', stderr);
          reject(new Error(`Pi CLI exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout);
      });

      cli.on('error', (error) => {
        reject(new Error(`Failed to spawn Pi CLI: ${error.message}`));
      });

      // 60 秒超时
      setTimeout(() => {
        cli.kill();
        reject(new Error('Pi CLI timeout after 60 seconds'));
      }, 60000);
    });
  }

  private parseOutput(stdout: string): any {
    console.error('Pi CLI output length:', stdout.length);

    // 检查是否是流式 JSON（每行都是 JSON）
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const isStreaming = lines.every(line => {
      try {
        JSON.parse(line);
        return true;
      } catch {
        return false;
      }
    });

    if (isStreaming && lines.length > 1) {
      console.error('Detected streaming JSON format, parsing...');
      return this.parseStreamingOutput(stdout);
    } else {
      console.error('Detected plain JSON format, parsing directly...');
      return this.parsePlainOutput(stdout);
    }
  }

  private parseStreamingOutput(stdout: string): any {
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    console.error('Total lines:', lines.length);

    let fullContent = '';

    // 解析流式 JSON
    for (const line of lines) {
      try {
        const json = JSON.parse(line);

        if (json.type === 'message_update' && json.assistantMessageEvent) {
          const event = json.assistantMessageEvent;

          // 优先提取 delta
          if (event.delta && typeof event.delta === 'string') {
            fullContent += event.delta;
          }

          // 提取 content
          if (event.content && Array.isArray(event.content)) {
            for (const item of event.content) {
              if (item.type === 'text' && item.text) {
                fullContent += item.text;
              }
            }
          }
        }

        // 提取最终消息
        if (json.message && json.message.content && Array.isArray(json.message.content)) {
          for (const item of json.message.content) {
            if (item.type === 'text' && item.text) {
              fullContent += item.text;
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse line:', line.substring(0, 100));
      }
    }

    console.error('Extracted content length:', fullContent.length);

    // 如果没有提取到内容，尝试直接使用原始输出
    if (!fullContent.trim()) {
      console.error('Using raw stdout');
      fullContent = stdout;
    }

    // 尝试提取 JSON
    return this.extractJson(fullContent);
  }

  private parsePlainOutput(stdout: string): any {
    // 直接解析 JSON
    return this.extractJson(stdout);
  }

  private extractJson(content: string): any {
    // 尝试从 markdown 代码块提取
    try {
      return this.extractJsonFromMarkdown(content);
    } catch (e) {
      // 尝试直接解析
      try {
        return JSON.parse(content.trim());
      } catch (e2) {
        // 尝试提取第一个 JSON 对象
        return this.extractFirstJsonObject(content);
      }
    }
  }
}