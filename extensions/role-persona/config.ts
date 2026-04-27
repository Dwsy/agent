/**
 * Role Persona Extension - Configuration System
 * 
 * 配置优先级（高到低）：
 * 1. 环境变量（ROLE_*）
 * 2. pi-role-persona.jsonc 配置文件
 * 3. 内置默认值
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getDefaultSpinnerFrames } from "./spinner-utils.ts";

// ============================================================================
// 配置类型定义
// ============================================================================

export interface ModelSpec {
  /** 提供商 ID */
  provider: string;
  /** 模型 ID（可包含斜杠） */
  model: string;
}

export interface AutoMemoryConfig {
  enabled: boolean;
  /** 模型配置（支持多种格式）：
   * - 单个字符串: "provider/model-id"
   * - 字符串数组: ["provider/model-id", ...]
   * - 对象数组: [{ provider: "...", model: "..." }, ...]
   * 按顺序尝试，失败自动 fallback
   */
  model: string | string[] | ModelSpec[];
  /** 标签提取专用模型（默认继承 autoMemory.model） */
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

export interface MiniLMConfig {
  /** Provider mode: direct (single-process) or daemon (shared process) */
  mode: "direct" | "daemon";
  /** Path to ONNX model file. Auto-resolved if not provided */
  modelPath?: string;
  /** Daemon socket path (Unix socket or Windows named pipe). Auto-resolved if not provided */
  daemonSocketPath?: string;
  /** Max sequence length for tokenization (default: 512) */
  maxSeqLength?: number;
  /** Batch size for inference (default: 8 for daemon, 1 for direct) */
  batchSize?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Auto-start daemon if not running (daemon mode only, default: true) */
  autoStartDaemon?: boolean;
  /** Use GPU acceleration if available (direct mode only, default: false) */
  useGPU?: boolean;
}

export interface VectorMemoryConfig {
  enabled: boolean;
  provider: "openai" | "local" | "minilm-direct" | "minilm-daemon";
  model: string;
  apiKey: string | null;
  baseUrl: string;  // for local provider (pi-session-manager embedding service)
  /** all-MiniLM-L6-v2 specific configuration (provider=minilm-*) */
  minilm?: MiniLMConfig;
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

export interface KnowledgeExternalSource {
  id: string;
  path: string;
  description?: string;
}

export interface KnowledgeConfig {
  enabled: boolean;
  vectorTable: string;
  search: {
    maxResults: number;
    minScore: number;
    roleBoost: number;
  };
  externalSources: KnowledgeExternalSource[];
}

export interface StorageConfig {
  /** Roles directory path. Supports ~ expansion. Default: ~/.pi/roles */
  rolesDir: string;
}

export interface RolePersonaConfig {
  storage: StorageConfig;
  autoMemory: AutoMemoryConfig;
  logging: LoggingConfig;
  memory: MemoryConfig;
  ui: UIConfig;
  advanced: AdvancedConfig;
  vectorMemory: VectorMemoryConfig;
  externalReadonly: ExternalReadonlyConfig;
  knowledge: KnowledgeConfig;
}

// ============================================================================
// 内置默认值
// ============================================================================

const DEFAULT_CONFIG: RolePersonaConfig = {
  storage: {
    rolesDir: "~/.pi/roles",
  },
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
    level: "debug",
    retentionDays: 7,
  },
  memory: {
    defaultCategories: ["Communication", "Code", "Tools", "Workflow", "General"],
    dailyPathTemplate: "{rolePath}/memory/daily/{date}.md",
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
    spinnerIntervalMs: 120,
    spinnerFrames: getDefaultSpinnerFrames(),
    viewerDefaultFilter: "all",
  },
  advanced: {
    shutdownFlushTimeoutMs: 1500,
    forceKeywords: "结束|总结|退出|收尾|结束会话|final|summary|wrap\\s?up|quit|exit",
    evolutionReminderTurns: 10,
  },
  vectorMemory: {
    enabled: false,
    provider: "local",
    model: "embeddinggemma-300m-qat-q8_0",
    apiKey: null,
    baseUrl: "http://127.0.0.1:52131",
    minilm: {
      mode: "daemon",
      maxSeqLength: 512,
      batchSize: 8,
      timeoutMs: 5000,
      autoStartDaemon: true,
      useGPU: false,
    },
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
  knowledge: {
    enabled: true,
    vectorTable: "knowledge",
    search: {
      maxResults: 5,
      minScore: 0.2,
      roleBoost: 1.2,
    },
    externalSources: [],
  },
};

// ============================================================================
// JSONC 解析（简单实现：去除注释）
// ============================================================================

function stripJsoncComments(jsonc: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let quote = '"';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < jsonc.length) {
    const ch = jsonc[i];
    const next = jsonc[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      // 保留换行，避免错误行号漂移
      if (ch === "\n") out += ch;
      i += 1;
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function stripTrailingCommas(json: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let quote = '"';
  let escaped = false;

  while (i < json.length) {
    const ch = json[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j += 1;
      const next = json[j];
      if (next === "}" || next === "]") {
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

function parseJsonc(content: string): unknown {
  const noComments = stripJsoncComments(content);
  const clean = stripTrailingCommas(noComments);
  return JSON.parse(clean);
}

// ============================================================================
// 环境变量覆盖
// ============================================================================

function applyEnvOverrides(config: RolePersonaConfig): RolePersonaConfig {
  const result = structuredClone(config);

  // storage.rolesDir
  if (process.env.PI_ROLES_DIR) {
    result.storage.rolesDir = process.env.PI_ROLES_DIR;
  }
  // Legacy env var support (backward compat)
  if (process.env.PI_AGENT_ROLES_DIR) {
    result.storage.rolesDir = process.env.PI_AGENT_ROLES_DIR;
  }

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
    const val = process.env.ROLE_AUTO_MEMORY_MODEL.trim();
    // 尝试解析为 JSON（对象数组）
    if (val.startsWith("[")) {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          result.autoMemory.model = parsed;
        }
      } catch {
        // JSON 解析失败，回退到逗号分隔
        result.autoMemory.model = val.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else if (val.includes(",")) {
      // 逗号分隔的多模型
      result.autoMemory.model = val.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      // 单个模型
      result.autoMemory.model = val;
    }
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
  // vectorMemory.provider
  if (process.env.ROLE_VECTOR_PROVIDER) {
    const p = process.env.ROLE_VECTOR_PROVIDER;
    if (p === "openai" || p === "local") {
      result.vectorMemory.provider = p;
    }
  }
  // vectorMemory.baseUrl
  if (process.env.ROLE_VECTOR_BASE_URL) {
    result.vectorMemory.baseUrl = process.env.ROLE_VECTOR_BASE_URL;
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
// 跨平台路径工具
// ============================================================================

/**
 * 展开路径中的 ~ 为用户主目录（跨平台支持 macOS/Linux/Windows）
 */
function expandHomeDir(input: string): string {
  if (!input || !input.startsWith("~")) return input;
  return join(homedir(), input.slice(1));
}

/**
 * 获取配置搜索路径列表（按优先级降序）
 * 1. 环境变量 PI_ROLES_DIR / PI_AGENT_ROLES_DIR 指定的目录
 * 2. ~/.pi/roles/ 目录
 * 3. 脚本所在目录 (extensionDir)
 * 4. 当前工作目录 (cwd)
 */
function getConfigSearchPaths(extensionDir?: string): string[] {
  const paths: string[] = [];

  // 1. 环境变量指定的目录
  if (process.env.PI_ROLES_DIR) {
    paths.push(expandHomeDir(process.env.PI_ROLES_DIR));
  }
  if (process.env.PI_AGENT_ROLES_DIR) {
    paths.push(expandHomeDir(process.env.PI_AGENT_ROLES_DIR));
  }

  // 2. ~/.pi/roles/ 目录
  paths.push(join(homedir(), ".pi", "roles"));

  // 3. 脚本/扩展所在目录
  const scriptDir = extensionDir || (typeof __dirname !== "undefined" ? __dirname : ".");
  paths.push(scriptDir);

  // 4. 当前工作目录
  paths.push(process.cwd());

  // 去重（保留顺序）
  return paths.filter((p, i, arr) => arr.indexOf(p) === i);
}

/**
 * 从多个配置源加载配置（高优先级覆盖低优先级）
 */
function loadConfigFromSources(searchPaths: string[]): Partial<RolePersonaConfig> {
  const mergedConfig: Partial<RolePersonaConfig> = {};

  // 按优先级顺序加载（低优先级先加载，高优先级后覆盖）
  // 数组已按优先级降序排列，所以反转后从低到高加载
  const paths = [...searchPaths].reverse();

  for (const dir of paths) {
    const configPath = join(dir, "pi-role-persona.jsonc");
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = parseJsonc(content) as Partial<RolePersonaConfig>;
        // 深度合并到结果（高优先级覆盖低优先级）
        Object.assign(mergedConfig, deepMerge(mergedConfig, parsed));
      } catch (err) {
        console.warn(`[role-persona] Warning: Failed to load config from ${configPath}:`, err);
      }
    }
  }

  return mergedConfig;
}

// ============================================================================
// 配置加载
// ============================================================================

let cachedConfig: RolePersonaConfig | null = null;

export function loadConfig(extensionDir?: string): RolePersonaConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 获取配置搜索路径（按优先级降序）
  const searchPaths = getConfigSearchPaths(extensionDir);

  // 从所有配置源加载（合并）
  const fileConfig = loadConfigFromSources(searchPaths);

  // 深度合并：默认值 <- 配置文件（低优先级到高优先级）
  const merged = deepMerge(DEFAULT_CONFIG, fileConfig);

  // 应用环境变量覆盖（最高优先级）
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
  get storage(): StorageConfig {
    return getConfig().storage;
  },
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
  get knowledge(): KnowledgeConfig {
    return getConfig().knowledge;
  },
};
