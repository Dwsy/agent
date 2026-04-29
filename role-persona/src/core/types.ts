/**
 * Shared type definitions for role-persona.
 * Zero external dependencies — pure TypeScript types.
 */

// ============================================================================
// Config Types
// ============================================================================

export interface ModelSpec {
  provider: string;
  model: string;
}

export interface AutoMemoryConfig {
  enabled: boolean;
  model: string | string[] | ModelSpec[];
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
  mode: "direct" | "daemon";
  modelPath?: string;
  daemonSocketPath?: string;
  maxSeqLength?: number;
  batchSize?: number;
  timeoutMs?: number;
  autoStartDaemon?: boolean;
  useGPU?: boolean;
}

export interface VectorMemoryConfig {
  enabled: boolean;
  provider: "openai" | "local" | "minilm-direct" | "minilm-daemon";
  model: string;
  apiKey: string | null;
  baseUrl: string;
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
  rolesDir: string;
}

export interface RolePersonaConfig {
  storage: StorageConfig;
  autoMemory: AutoMemoryConfig;
  logging: LoggingConfig;
  memory: MemoryConfig;
  ui: UIConfig;
  vectorMemory: VectorMemoryConfig;
  advanced: AdvancedConfig;
  externalReadonly: ExternalReadonlyConfig;
  knowledge: KnowledgeConfig;
}

// ============================================================================
// Role Types
// ============================================================================

export interface RoleConfig {
  defaultRole?: string;
  mappings: Record<string, string>;
  disabledPaths?: string[];
}

export interface RoleResolution {
  role: string | null;
  source: "mapping" | "disabled" | "default" | "none";
  matchedPath?: string;
}

export interface RoleIdentity {
  name?: string;
  emoji?: string;
}

export interface MigrationResult {
  roles: number;
  migratedFiles: number;
  removedFiles: number;
}

// ============================================================================
// Memory Types
// ============================================================================

export interface MemoryLearningRecord {
  id: string;
  text: string;
  used: number;
  source?: string;
  tags?: string[];
  weight?: number;
  lastAccessed?: string;
}

export interface MemoryPreferenceRecord {
  id: string;
  category: string;
  text: string;
  tags?: string[];
}

export interface RoleMemoryMetadata {
  name: string;
  version: string;
  created: string;
  updated: string;
  autoConsolidate: boolean;
  consolidationInterval: string;
  tags: string[];
}

export interface RoleMemoryData {
  roleName: string;
  metadata: RoleMemoryMetadata;
  autoExtracted: boolean;
  lastConsolidated?: string;
  learnings: MemoryLearningRecord[];
  preferences: MemoryPreferenceRecord[];
  events: string[];
  issues: string[];
}

export interface MemorySearchMatch {
  kind: "learning" | "preference" | "event";
  id?: string;
  text: string;
  category?: string;
  used?: number;
}

export interface ScoredMemoryMatch extends MemorySearchMatch {
  score: number;
}

export interface PendingMemoryRecord {
  id: string;
  text: string;
  source: string;
  category?: string;
  createdAt: string;
  promoted: boolean;
  discarded: boolean;
}

export interface PendingMemoryData {
  roleName: string;
  updated: string;
  items: PendingMemoryRecord[];
}

export interface MemoryLogEntry {
  time: string;
  source: "compaction" | "auto-extract" | "tool" | "manual";
  op: "learning" | "preference" | "event" | "knowledge" | "reinforce" | "consolidate" | "update_learning" | "update_preference" | "delete_learning" | "delete_preference";
  content: string;
  stored: boolean;
  detail?: string;
}

export interface AddMemoryOpts {
  appendDaily?: boolean;
  source?: string;
}

export interface MemoryResult {
  stored: boolean;
  id?: string;
  reason?: string;
  duplicate?: boolean;
  tags?: string[];
  text?: string;
}

export interface UpdateResult {
  updated: boolean;
  id?: string;
  oldText?: string;
  newText?: string;
  reason?: string;
}

export interface DeleteResult {
  deleted: boolean;
  id?: string;
  text?: string;
  reason?: string;
}

export interface ReinforceResult {
  updated: boolean;
  id?: string;
  used?: number;
}

export interface ConsolidateResult {
  beforeLearnings: number;
  afterLearnings: number;
  beforePreferences: number;
  afterPreferences: number;
}

export interface RepairResult {
  repaired: boolean;
  issues: number;
}

export interface PendingStats {
  total: number;
  pending: number;
  promoted: number;
  discarded: number;
}

export interface ExpireResult {
  expired: number;
}

export interface PromoteResult {
  promoted: boolean;
  id?: string;
  reason?: string;
}

export interface LlmTidyResult {
  model: string;
  apply: {
    beforeLearnings: number;
    afterLearnings: number;
    beforePreferences: number;
    afterPreferences: number;
    addedLearnings: number;
    addedPreferences: number;
    rewrittenLearnings: number;
    rewrittenPreferences: number;
  };
}

export interface LlmTidyError {
  error: string;
}

export interface ConflictReport {
  conflicts: Array<{
    id1: string;
    id2: string;
    text1: string;
    text2: string;
    similarity: number;
  }>;
  report: string;
}

export interface MemoryListResult {
  text: string;
  learnings: number;
  preferences: number;
  issues: number;
}

export interface OnDemandResult {
  content: string;
  matchCount: number;
}

export interface ExtractResult {
  storedLearnings: number;
  storedPrefs: number;
  items?: Array<{
    type: string;
    text?: string;
    content?: string;
    stored?: boolean;
  }>;
}

// ============================================================================
// Knowledge Types
// ============================================================================

export interface KnowledgeFrontmatter {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  version: number;
  created: string;
  updated: string;
  scope?: string;
  author?: string;
  name?: string;
}

export interface KnowledgeEntry {
  relativePath: string;
  absolutePath: string;
  meta: KnowledgeFrontmatter;
  source: string;
  readonly: boolean;
  category: string;
  slug: string;
}

export interface KnowledgeSearchResultItem {
  entry: KnowledgeEntry;
  relevance: number;
  matchedOn: string[];
}

export interface CategoryInfo {
  category: string;
  entries: Array<{
    file: string;
    title: string;
    description: string;
    tags: string[];
    updated: string;
    scope?: string;
  }>;
}

export interface SourceInfo {
  id: string;
  description?: string;
  readonly: boolean;
  categories: CategoryInfo[];
}

export interface KnowledgeListResult {
  sources: SourceInfo[];
  tagIndex: Record<string, string[]>;
  totalEntries: number;
}

export interface KnowledgeWriteInput {
  title: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  scope?: string;
  global?: boolean;
}

export interface KnowledgeWriteResult {
  source: string;
  category: string;
  written: string;
  isNew: boolean;
  version: number;
  suggestion?: string;
}

export interface KnowledgeReadResult {
  frontmatter: KnowledgeFrontmatter;
  body: string;
  source: string;
  readonly: boolean;
  absolutePath: string;
  charCount: number;
  lineCount: number;
}

export interface KnowledgeSearchParams {
  query?: string;
  tags?: string[];
  category?: string;
  scope?: string;
  limit?: number;
  roleBoost?: number;
}

// ============================================================================
// Embedding / Vector Types
// ============================================================================

export interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  kind: "learning" | "preference";
  category: string;
  createdAt: number;
}

export interface VectorSearchResult {
  entry: VectorEntry;
  score: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  readonly dim: number;
  readonly model: string;
}

export interface VectorStats {
  enabled: boolean;
  active: boolean;
  model: string | null;
  dim: number | null;
  count: number;
  dbPath: string | null;
}

export interface RebuildResult {
  indexed: number;
  total: number;
  errors: number;
}

// ============================================================================
// Tag Types
// ============================================================================

export interface TagInfo {
  count: number;
  strength: number;
  confidence: number;
  firstSeen: string;
  lastUsed: string;
  lastExtracted: string;
  sources: string[];
  associated: string[];
  context: string[];
}

export interface TagRegistry {
  [tag: string]: TagInfo;
}

// ============================================================================
// Service Layer Types
// ============================================================================

export interface ActiveRole {
  name: string;
  path: string;
  identity: RoleIdentity | null;
  isFirstRun: boolean;
}

export interface InitResult {
  role: ActiveRole | null;
  resolution: RoleResolution;
  migration: MigrationResult;
}

export interface ActivateResult {
  ok: boolean;
  role: ActiveRole;
}

export interface MapResult {
  ok: boolean;
  cwd: string;
  role: string;
}

export interface UnmapResult {
  ok: boolean;
  removedMapping: boolean;
}

export interface RoleCreateResult {
  ok: boolean;
  path: string;
  name: string;
}

export interface DirectoryListing {
  path: string;
  base: string;
  files: string[];
  count: number;
  recursive: boolean;
}

/** Message format for conversation context */
export interface Message {
  role: "user" | "assistant" | "system";
  content: Array<{ type: string; text?: string; thinking?: string }>;
}

/** Tool call result — compatible with Pi, MCP, and CLI */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, any>;
  isError?: boolean;
}

/** Search options for memory search */
export interface SearchOpts {
  maxResults?: number;
  minScore?: number;
}

/** Options for LLM operations */
export interface LlmOpts {
  model?: string;
}

// ============================================================================
// Helper: create ToolCallResult
// ============================================================================

export function ok(text: string, details?: Record<string, any>): ToolCallResult {
  return { content: [{ type: "text", text }], details };
}

export function err(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
