/**
 * CodeMap 类型定义 (基于新的 Prompt Schema)
 */

export interface CodeMap {
  schemaVersion: number;
  title: string;
  description: string;
  mermaidDiagram: string;
  traces: Trace[];
}

export interface Trace {
  id: string;
  title: string;
  description: string;
  locations: Location[];
  traceTextDiagram: string;
  traceGuide: TraceGuide;
}

export interface Location {
  id: string;
  path: string;
  lineNumber: number;
  lineContent: string;
  title: string;
  description: string;
}

export interface TraceGuide {
  motivation: string;
  details: string;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface GenerateOptions {
  query: string;
  files: string[];
  projectRoot: string;
  modelTier: 'fast' | 'smart';
  provider?: 'pi' | 'claude';
}

export interface AnalyzeOptions {
  filePath: string;
  provider?: 'pi' | 'claude';
}

export interface AIProvider {
  name: string;
  generate(prompt: string, modelTier: 'fast' | 'smart'): Promise<CodeMap>;
  analyze(prompt: string): Promise<any>;
}