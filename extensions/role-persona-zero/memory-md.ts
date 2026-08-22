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
  type DailyEntry,
  type DailyMemory,
  deleteDailyEntry,
  ensureDailySummaryDir,
  listAllDailySummaries,
  listDailySummariesToGenerate,
  parseDailyEntries,
  readDailyMemories,
  readDailyMemoryRaw,
  readDailySummary,
  renderDailyFile,
  updateDailyEntry,
  writeDailySummary,
} from "./memory/daily.ts";

export {
  addRoleEvent,
  addRoleLearning,
  addRoleLearningWithTags,
  addRolePreference,
  deleteRoleEvent,
  deleteRoleLearning,
  deleteRolePreference,
  reinforceRoleLearning,
  updateRoleEvent,
  updateRoleLearning,
  updateRolePreference,
} from "./memory/mutations.ts";

export { formatSearchMatchLine, searchRoleMemory } from "./memory/search.ts";

export {
  buildMemoryEditInstruction,
  buildPendingReviewBlock,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
  readMemoryPromptBlocks,
} from "./memory/prompt.ts";

export {
  extractMemoryFacts,
  getMemoryStats,
  isMemoryReadSection,
  listRoleMemory,
  type MemoryReadSection,
  type MemoryStats,
  renderMemoryReadView,
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

export {
  buildMemoryExportData,
  CORE_FILE_DIRS,
  exportMemoryToHtml,
  type LearningTier,
  type MemoryExportData,
  renderMemoryViewerHtml,
  type ViewerCoreFile,
  type ViewerMode,
} from "./memory/html-export.ts";
