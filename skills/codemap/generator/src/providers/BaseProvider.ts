/**
 * AI 提供者基类
 */

import type { CodeMap } from '../types.js';

export abstract class BaseProvider implements AIProvider {
  abstract name: string;
  abstract generate(prompt: string, modelTier: 'fast' | 'smart'): Promise<CodeMap>;
  abstract analyze(prompt: string): Promise<any>;

  /**
   * 验证 CodeMap 结构
   */
  protected validateCodemap(codemap: any): CodeMap {
    // 验证必需字段
    if (!codemap.schemaVersion || typeof codemap.schemaVersion !== 'number') {
      throw new Error('Invalid codemap: missing or invalid schemaVersion');
    }

    if (!codemap.traces || !Array.isArray(codemap.traces)) {
      throw new Error('Invalid codemap: missing traces array');
    }

    if (!codemap.mermaidDiagram) {
      throw new Error('Invalid codemap: missing mermaidDiagram');
    }

    // 添加缺失的必需字段
    if (!codemap.created_at) {
      codemap.created_at = new Date().toISOString();
    }

    return codemap as CodeMap;
  }

  /**
   * 从 Markdown 代码块中提取 JSON
   */
  protected extractJsonFromMarkdown(content: string): any {
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\n\})\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw new Error('Could not extract JSON from markdown block');
  }

  /**
   * 从内容中提取第一个完整的 JSON 对象
   */
  protected extractFirstJsonObject(content: string): any {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(content.substring(firstBrace, lastBrace + 1));
    }
    throw new Error('Could not extract JSON object');
  }
}