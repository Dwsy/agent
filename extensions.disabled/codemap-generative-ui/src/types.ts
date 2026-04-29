export interface CodeMapMeta {
  id?: string;
  filename?: string;
  title?: string;
  description?: string;
  query?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  note?: string;
}

export interface CodeMapLocation {
  id?: string;
  path: string;
  lineNumber?: number;
  lineContent?: string;
  title?: string;
  description?: string;
}

export interface CodeMapTrace {
  id: string;
  title: string;
  description?: string;
  locations?: CodeMapLocation[];
  traceTextDiagram?: string;
  traceGuide?: string;
}

export interface CodeMapDocument {
  schemaVersion?: number;
  metadata?: CodeMapMeta;
  title: string;
  description?: string;
  mermaidDiagram?: string;
  traces: CodeMapTrace[];
}

export interface CodeMapIndexEntry extends CodeMapMeta {
  id: string;
  filename: string;
}

export interface CodeMapIndexDocument {
  version?: number;
  projectRoot?: string;
  codemaps?: CodeMapIndexEntry[];
}

export interface ResolvedCodeMap {
  html: string;
  sourcePath: string;
  title: string;
  kind: "html" | "json";
}
