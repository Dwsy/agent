export const COMPACTION_ALGORITHMS = ["pi-default", "structured"] as const;

export type CompactionAlgorithm = (typeof COMPACTION_ALGORITHMS)[number];

export interface ModelReference {
  provider: string;
  id: string;
}

export interface CustomCompactionConfig {
  enabled: boolean;
  model: ModelReference | null;
  algorithm: CompactionAlgorithm;
  maxSummaryTokens: number;
  showStatusWidget: boolean;
}

export interface ConfigLoadResult {
  config: CustomCompactionConfig;
  warning?: string;
}

export interface ConfigSaveResult {
  success: boolean;
  error?: string;
}

export interface AvailableModel {
  provider: string;
  id: string;
  name: string;
  outputCost: number;
}

export const DEFAULT_CONFIG: CustomCompactionConfig = {
  enabled: true,
  model: null,
  algorithm: "pi-default",
  maxSummaryTokens: 8192,
  showStatusWidget: false,
};
