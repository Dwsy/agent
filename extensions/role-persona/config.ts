/**
 * Role Persona Extension - Configuration System
 * 
 * 配置优先级（高到低）：
 * 1. 环境变量（ROLE_*）
 * 2. pi-role-persona.jsonc 配置文件
 * 3. 内置默认值
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// 配置类型定义
// ============================================================================

export interface AutoMemoryConfig {
  enabled: boolean;
  model: string;
  tagModel: string | null;
  reserveTokens: number;
  maxItems: number;
  maxText: number;
  batchTurns: number;
  minTurns: number;
  intervalMs: number;
  contextOverlap: number;
}

export interface LoggingConfig {
  enabled: boolean;
  level: "debug" | "info" | "warn" | "error";
  retentionDays: number;
}

export interface MemoryConfig {
  defaultCategories: string[];
  dailyPathTemplate: string;
  dedupeThreshold: number;
  onDemandSearch: {
    enabled: boolean;
    maxResults: number;
    minScore: number;
    alwaysLoadHighPriority: boolean;
  };
  searchDefaults: {
    maxResults: number;
    minScore: number;
    includeDailyMemory: boolean;
  };
}

export interface UIConfig {
  spinnerIntervalMs: number;
  spinnerFrames: string[];
  viewerDefaultFilter: "all" | "learnings" | "preferences" | "events";
}

export interface VectorMemoryConfig {
  enabled: boolean;
  provider: "openai";
  model: string;
  apiKey: string | null;
  autoRecall: boolean;
  autoIndex: boolean;
  recallLimit: number;
  recallMinScore: number;
  hybridSearch: boolean;
  vectorWeight: number;
  dbPath: string;
}

export interface AdvancedConfig {
  shutdownFlushTimeoutMs: number;
  forceKeywords: string;
  evolutionReminderTurns: number;
}

export interface ExternalReadonlyConfig {
  enabled: boolean;
  baseUrl: string;
  token: string | null;
  timeoutMs: number;
  topK: number;
  experienceLimit: number;
  minConfidence: number;
}

export interface RolePersonaConfig {
  autoMemory: AutoMemoryConfig;
  logging: LoggingConfig;
  memory: MemoryConfig;
  ui: UIConfig;
  advanced: AdvancedConfig;
  vectorMemory: VectorMemoryConfig;
  externalReadonly: ExternalReadonlyConfig;
}

// ============================================================================
// 内置默认值
// ============================================================================

const DEFAULT_CONFIG: RolePersonaConfig = {
  autoMemory: {
    enabled: true,
    model: "openai-codex/gpt-5.1-codex-mini",
    tagModel: null,
    reserveTokens: 8192,
    maxItems: 3,
    maxText: 200,
    batchTurns: 5,
    minTurns: 2,
    intervalMs: 30 * 60 * 1000, // 30 minutes
    contextOverlap: 4,
  },
  logging: {
    enabled: true,
    level: "info",
    retentionDays: 7,
  },
  memory: {
    defaultCategories: ["Communication", "Code", "Tools", "Workflow", "General"],
    dailyPathTemplate: "{rolePath}/memory/{date}.md",
    dedupeThreshold: 0.9,
    onDemandSearch: {
      enabled: true,
      maxResults: 5,
      minScore: 0.2,
      alwaysLoadHighPriority: true,
    },
    searchDefaults: {
      maxResults: 20,
      minScore: 0.1,
      includeDailyMemory: true,
    },
  },
  ui: {
    spinnerIntervalMs: 260,
    spinnerFrames: ["✳", "✶", "✧", "✦"],
    viewerDefaultFilter: "all",
  },
  advanced: {
    shutdownFlushTimeoutMs: 1500,
    forceKeywords: "结束|总结|退出|收尾|结束会话|final|summary|wrap\\s?up|quit|exit",
    evolutionReminderTurns: 10,
  },
  vectorMemory: {
    enabled: false,
    provider: "openai",
    model: "text-embedding-3-small",
    apiKey: null,
    autoRecall: true,
    autoIndex: true,
    hybridSearch: true,
    vectorWeight: 1.0,
    recallLimit: 3,
    recallMinScore: 0.3,
    dbPath: ".vector-db",
  },
  externalReadonly: {
    enabled: false,
    baseUrl: "http://127.0.0.1:52131",
    token: null,
    timeoutMs: 1200,
    topK: 8,
    experienceLimit: 8,
    minConfidence: 0.35,
  },
};

// ============================================================================
// JSONC 解析（简单实现：去除注释）
// ============================================================================

function stripJsoncComments(jsonc: string): string {
  // 移除单行注释
  let result = jsonc.replace(/\/\/.*$/gm, "");
  // 移除多行注释
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  // 移除尾部逗号（JSONC 允许）
  result = result.replace(/,(\s*[}\]])/g, "$1");
  return result;
}

function parseJsonc(content: string): unknown {
  const clean = stripJsoncComments(content);
  return JSON.parse(clean);
}

// ============================================================================
// 环境变量覆盖
// ============================================================================

function applyEnvOverrides(config: RolePersonaConfig): RolePersonaConfig {
  const result = structuredClone(config);

  // autoMemory.enabled
  if (process.env.ROLE_AUTO_MEMORY !== undefined) {
    result.autoMemory.enabled = process.env.ROLE_AUTO_MEMORY !== "0" && process.env.ROLE_AUTO_MEMORY !== "false";
  }
  // 子代理模式强制禁用
  if (process.env.RHO_SUBAGENT === "1") {
    result.autoMemory.enabled = false;
  }

  // autoMemory.model
  if (process.env.ROLE_AUTO_MEMORY_MODEL) {
    result.autoMemory.model = process.env.ROLE_AUTO_MEMORY_MODEL;
  }

  // autoMemory.tagModel
  if (process.env.ROLE_TAG_MODEL) {
    result.autoMemory.tagModel = process.env.ROLE_TAG_MODEL;
  }

  // autoMemory.reserveTokens
  if (process.env.ROLE_AUTO_MEMORY_RESERVE_TOKENS) {
    const val = parseInt(process.env.ROLE_AUTO_MEMORY_RESERVE_TOKENS, 10);
    if (!isNaN(val) && val > 0) {
      result.autoMemory.reserveTokens = val;
    }
  }

  // logging.enabled
  if (process.env.ROLE_LOG !== undefined) {
    result.logging.enabled = process.env.ROLE_LOG !== "0" && process.env.ROLE_LOG !== "false";
  }

  // vectorMemory.enabled
  if (process.env.ROLE_VECTOR_MEMORY !== undefined) {
    result.vectorMemory.enabled = process.env.ROLE_VECTOR_MEMORY !== "0" && process.env.ROLE_VECTOR_MEMORY !== "false";
  }
  // vectorMemory.apiKey
  if (process.env.ROLE_VECTOR_API_KEY) {
    result.vectorMemory.apiKey = process.env.ROLE_VECTOR_API_KEY;
  }
  // 子代理模式强制禁用向量记忆
  if (process.env.RHO_SUBAGENT === "1") {
    result.vectorMemory.enabled = false;
  }

  // externalReadonly
  if (process.env.ROLE_EXTERNAL_READONLY !== undefined) {
    result.externalReadonly.enabled = process.env.ROLE_EXTERNAL_READONLY !== "0" && process.env.ROLE_EXTERNAL_READONLY !== "false";
  }
  if (process.env.ROLE_EXTERNAL_BASE_URL) {
    result.externalReadonly.baseUrl = process.env.ROLE_EXTERNAL_BASE_URL;
  }
  if (process.env.ROLE_EXTERNAL_TOKEN !== undefined) {
    result.externalReadonly.token = process.env.ROLE_EXTERNAL_TOKEN || null;
  }
  if (process.env.ROLE_EXTERNAL_TIMEOUT_MS) {
    const val = parseInt(process.env.ROLE_EXTERNAL_TIMEOUT_MS, 10);
    if (!isNaN(val) && val > 100) {
      result.externalReadonly.timeoutMs = val;
    }
  }
  if (process.env.ROLE_EXTERNAL_TOP_K) {
    const val = parseInt(process.env.ROLE_EXTERNAL_TOP_K, 10);
    if (!isNaN(val) && val > 0) {
      result.externalReadonly.topK = val;
    }
  }
  if (process.env.ROLE_EXTERNAL_EXP_LIMIT) {
    const val = parseInt(process.env.ROLE_EXTERNAL_EXP_LIMIT, 10);
    if (!isNaN(val) && val > 0) {
      result.externalReadonly.experienceLimit = val;
    }
  }
  if (process.env.ROLE_EXTERNAL_MIN_CONFIDENCE) {
    const val = parseFloat(process.env.ROLE_EXTERNAL_MIN_CONFIDENCE);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      result.externalReadonly.minConfidence = val;
    }
  }

  return result;
}

// ============================================================================
// 配置加载
// ============================================================================

let cachedConfig: RolePersonaConfig | null = null;

export function loadConfig(extensionDir?: string): RolePersonaConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 从配置文件加载
  // 注意：在 Bun 中使用 import.meta.dir，在 Node 中使用 __dirname
  const configDir = extensionDir || (typeof __dirname !== "undefined" ? __dirname : ".");
  const configPath = join(configDir, "pi-role-persona.jsonc");

  let fileConfig: Partial<RolePersonaConfig> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      fileConfig = parseJsonc(content) as Partial<RolePersonaConfig>;
    } catch (err) {
      console.error(`[role-persona] Failed to load config from ${configPath}:`, err);
    }
  }

  // 深度合并
  const merged = deepMerge(DEFAULT_CONFIG, fileConfig);
  
  // 应用环境变量覆盖
  cachedConfig = applyEnvOverrides(merged);
  
  return cachedConfig;
}

export function reloadConfig(extensionDir?: string): RolePersonaConfig {
  cachedConfig = null;
  return loadConfig(extensionDir);
}

export function getConfig(): RolePersonaConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

// ============================================================================
// 工具函数
// ============================================================================

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = structuredClone(base);
  
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined) {
      continue;
    }
    
    if (Array.isArray(value)) {
      (result as any)[key] = [...value];
    } else if (typeof value === "object" && !Array.isArray(value)) {
      (result as any)[key] = deepMerge((result as any)[key] || {}, value);
    } else {
      (result as any)[key] = value;
    }
  }
  
  return result;
}

// 便捷访问函数
export const config = {
  get autoMemory(): AutoMemoryConfig {
    return getConfig().autoMemory;
  },
  get logging(): LoggingConfig {
    return getConfig().logging;
  },
  get memory(): MemoryConfig {
    return getConfig().memory;
  },
  get ui(): UIConfig {
    return getConfig().ui;
  },
  get advanced(): AdvancedConfig {
    return getConfig().advanced;
  },
  get vectorMemory(): VectorMemoryConfig {
    return getConfig().vectorMemory;
  },
  get externalReadonly(): ExternalReadonlyConfig {
    return getConfig().externalReadonly;
  },
};
