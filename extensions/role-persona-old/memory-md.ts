/**
 * Markdown source-of-truth for role memory.
 *
 * Facade only: the implementation lives in memory/*. Importers keep using
 * this module; each submodule owns one concern (see memory/ directory).
 */
export {
  DEFAULT_MEMORY_CATEGORIES,
  eventSearchText,
  type MemoryCategory,
  type MemoryEventRecord,
  type MemoryLearningRecord,
  type MemoryPreferenceRecord,
  type MemorySearchMatch,
  type PendingMemoryData,
  type PendingMemoryRecord,
  type RoleMemoryData,
  type RoleMemoryMetadata,
  type ScoredMemoryMatch,
} from "./memory/types.ts";

export { dailySummaryPath } from "./memory/paths.ts";

export {
  ensureRoleMemoryFiles,
  parseEventBlocks,
  readRoleMemory,
  repairRoleMemory,
} from "./memory/consolidated.ts";

export {
  addPendingLearning,
  discardPendingLearning,
  expirePendingMemories,
  getPendingMemories,
  getPendingStats,
  promotePendingLearning,
} from "./memory/pending.ts";

export {
  appendDailyRoleMemory,
  ensureDailySummaryDir,
  listAllDailySummaries,
  listDailySummariesToGenerate,
  readDailyMemories,
  readDailyMemoryRaw,
  readDailySummary,
  writeDailySummary,
} from "./memory/daily.ts";

export {
  addRoleEvent,
  addRoleLearning,
  addRoleLearningWithTags,
  addRolePreference,
  deleteRoleLearning,
  deleteRolePreference,
  reinforceRoleLearning,
  updateRoleLearning,
  updateRolePreference,
} from "./memory/mutations.ts";

export { formatSearchMatchLine, searchRoleMemory } from "./memory/search.ts";

export {
  buildMemoryEditInstruction,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
  readMemoryPromptBlocks,
} from "./memory/prompt.ts";

export {
  extractMemoryFacts,
  getMemoryStats,
  listRoleMemory,
  type MemoryStats,
} from "./memory/stats.ts";

export {
  applyLlmTidyPlan,
  consolidateRoleMemory,
  type LlmTidyPlan,
} from "./memory/tidy.ts";

export {
  detectMemoryConflicts,
  getConflictReport,
  type MemoryConflict,
} from "./memory/conflicts.ts";

export { exportMemoryToHtml, type MemoryExportData } from "./memory/html-export.ts";
