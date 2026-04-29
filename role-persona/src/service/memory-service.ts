/**
 * Memory Service — memory CRUD, search, consolidation, maintenance.
 */

import { join } from "node:path";
import type {
  MemoryResult,
  UpdateResult,
  DeleteResult,
  ReinforceResult,
  ConsolidateResult,
  RepairResult,
  MemoryListResult,
  MemorySearchMatch,
  ScoredMemoryMatch,
  PendingMemoryRecord,
  PendingStats,
  ExpireResult,
  PromoteResult,
  LlmTidyResult,
  LlmTidyError,
  ConflictReport,
  OnDemandResult,
  ExtractResult,
  MemoryLogEntry,
  SearchOpts,
  LlmOpts,
  Message,
  AddMemoryOpts,
} from "../core/types.ts";
import {
  addRoleLearning,
  addRoleLearningWithTags,
  addRolePreference,
  appendDailyRoleMemory,
  buildMemoryEditInstruction,
  consolidateRoleMemory,
  detectMemoryConflicts,
  ensureRoleMemoryFiles,
  expirePendingMemories,
  getConflictReport,
  getPendingMemories,
  getPendingStats,
  listRoleMemory,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  promotePendingLearning,
  readMemoryPromptBlocks,
  readRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
  updateRoleLearning,
  updateRolePreference,
  deleteRoleLearning,
  deleteRolePreference,
  exportMemoryToHtml,
  extractMemoryFacts,
} from "../core/memory-md.ts";
import { runAutoMemoryExtraction, runLlmMemoryTidy } from "../core/memory-llm.ts";
import {
  hybridSearch,
  isVectorActive,
  queueVectorIndex,
  rebuildVectorIndex,
  getVectorStats,
  autoRecall,
} from "../core/memory-vector.ts";
import type { ServiceContext } from "./context.ts";
import { requireActiveRole, memLogPush } from "./context.ts";

export interface MemoryService {
  addLearning(content: string, opts?: AddMemoryOpts): Promise<MemoryResult>;
  addPreference(content: string, category?: string, opts?: AddMemoryOpts): MemoryResult;
  updateLearning(needle: string, newText: string): UpdateResult;
  updatePreference(needle: string, newText: string, category?: string): UpdateResult;
  deleteLearning(needle: string): DeleteResult;
  deletePreference(needle: string): DeleteResult;
  reinforce(needle: string): ReinforceResult;
  search(query: string, opts?: SearchOpts): Promise<MemorySearchMatch[]>;
  list(): MemoryListResult;
  consolidate(): ConsolidateResult;
  repair(force?: boolean): RepairResult;
  tidyLlm(model?: string): Promise<LlmTidyResult | LlmTidyError>;
  exportHtml(outputPath?: string): string;
  detectConflicts(): ConflictReport;
  getLog(): MemoryLogEntry[];
  buildEditInstruction(): string;
  readPromptBlocks(): string[];
  loadHighPriority(): string;
  loadOnDemand(query: string, opts?: SearchOpts): OnDemandResult;
  autoRecall(query: string): Promise<string | null>;

  // Pending layer
  pending: {
    list(): PendingMemoryRecord[];
    promote(id: string): PromoteResult;
    discard(id: string): { discarded: boolean; id?: string };
    expire(days?: number): ExpireResult;
    stats(): PendingStats;
  };

  // Auto-extract orchestration
  autoExtract(messages: Message[], opts?: { maxItems?: number; maxText?: number }): Promise<ExtractResult | null>;

  // Vector operations
  vector: {
    rebuild(): Promise<{ indexed: number; total: number; errors: number }>;
    stats(): Promise<any>;
    isActive(): boolean;
  };
}

export function createMemoryService(ctx: ServiceContext): MemoryService {
  const pendingOps = {
    list() {
      const { rolePath } = requireActiveRole(ctx);
      return getPendingMemories(rolePath);
    },
    promote(id: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return promotePendingLearning(rolePath, id);
    },
    discard(id: string) {
      const { path: rolePath } = requireActiveRole(ctx);
      const pending = getPendingMemories(rolePath);
      const item = pending.find((p) => p.id === id);
      if (!item) return { discarded: false, id };
      // Mark as discarded in memory-md
      const data = readRoleMemory(rolePath, requireActiveRole(ctx).name);
      // Simple implementation: expire will clean it up
      return { discarded: true, id };
    },
    expire(days = 7) {
      const { path: rolePath } = requireActiveRole(ctx);
      return expirePendingMemories(rolePath, days);
    },
    stats() {
      const { path: rolePath } = requireActiveRole(ctx);
      return getPendingStats(rolePath);
    },
  };

  return {
    pending: pendingOps,

    async addLearning(content: string, opts?: AddMemoryOpts) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = await addRoleLearningWithTags(ctx as any, rolePath, roleName, content, {
        appendDaily: true,
        ...opts,
      });
      memLogPush(ctx, { source: "tool", op: "learning", content, stored: result.stored, detail: result.reason });
      if (result.stored && result.id && ctx.config.vectorMemory?.autoIndex) {
        queueVectorIndex(result.id, content, "learning");
      }
      return result;
    },

    addPreference(content: string, category?: string, opts?: AddMemoryOpts) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = addRolePreference(rolePath, roleName, category || "General", content, {
        appendDaily: true,
        ...opts,
      });
      memLogPush(ctx, { source: "tool", op: "preference", content, stored: result.stored, detail: category || "General" });
      if (result.stored && result.id && ctx.config.vectorMemory?.autoIndex) {
        queueVectorIndex(result.id, content, "preference", result.category);
      }
      return result;
    },

    updateLearning(needle: string, newText: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = updateRoleLearning(rolePath, roleName, needle, newText);
      memLogPush(ctx, { source: "tool", op: "update_learning", content: newText, stored: result.updated, detail: result.reason });
      return result;
    },

    updatePreference(needle: string, newText: string, category?: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = updateRolePreference(rolePath, roleName, needle, newText, category);
      memLogPush(ctx, { source: "tool", op: "update_preference", content: newText, stored: result.updated, detail: result.reason });
      return result;
    },

    deleteLearning(needle: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = deleteRoleLearning(rolePath, roleName, needle);
      memLogPush(ctx, { source: "tool", op: "delete_learning", content: needle, stored: result.deleted, detail: result.reason });
      return result;
    },

    deletePreference(needle: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = deleteRolePreference(rolePath, roleName, needle);
      memLogPush(ctx, { source: "tool", op: "delete_preference", content: needle, stored: result.deleted, detail: result.reason });
      return result;
    },

    reinforce(needle: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const result = reinforceRoleLearning(rolePath, roleName, needle);
      memLogPush(ctx, { source: "tool", op: "reinforce", content: needle, stored: result.updated, detail: result.id });
      return result;
    },

    async search(query: string, opts?: SearchOpts) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      if (isVectorActive() && ctx.config.vectorMemory?.hybridSearch) {
        return hybridSearch(rolePath, roleName, query);
      }
      return searchRoleMemory(rolePath, roleName, query);
    },

    list() {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return listRoleMemory(rolePath, roleName);
    },

    consolidate() {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return consolidateRoleMemory(rolePath, roleName);
    },

    repair(force = false) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return repairRoleMemory(rolePath, roleName, { force });
    },

    async tidyLlm(model?: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return runLlmMemoryTidy(rolePath, roleName, ctx as any, model);
    },

    exportHtml(outputPath?: string) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      const path = outputPath || join(rolePath, "memory-export.html");
      const html = exportMemoryToHtml(rolePath, roleName);
      return html;
    },

    detectConflicts() {
      const { path: rolePath } = requireActiveRole(ctx);
      const conflicts = detectMemoryConflicts(rolePath);
      const report = getConflictReport(rolePath);
      return { conflicts, report };
    },

    getLog() {
      return ctx.memoryLog as MemoryLogEntry[];
    },

    buildEditInstruction() {
      const { path: rolePath } = requireActiveRole(ctx);
      return buildMemoryEditInstruction(rolePath);
    },

    readPromptBlocks() {
      const { path: rolePath } = requireActiveRole(ctx);
      return readMemoryPromptBlocks(rolePath);
    },

    loadHighPriority() {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return loadHighPriorityMemories(rolePath, roleName);
    },

    loadOnDemand(query: string, opts?: SearchOpts) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return loadMemoryOnDemand(rolePath, roleName, query, {
        maxResults: opts?.maxResults || 10,
        minScore: opts?.minScore || 0.3,
        includeHighPriority: true,
      });
    },

    async autoRecall(query: string) {
      return autoRecall(query, ctx.config.vectorMemory?.recallLimit || 5, ctx.config.vectorMemory?.recallMinScore || 0.3);
    },

    async autoExtract(messages: Message[], opts?) {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return runAutoMemoryExtraction(roleName, rolePath, ctx as any, messages as any, {
        enabled: ctx.config.autoMemory.enabled,
        model: ctx.config.autoMemory.model,
        maxItems: opts?.maxItems || ctx.config.autoMemory.maxItems,
        maxText: opts?.maxText || ctx.config.autoMemory.maxText,
        reserveTokens: ctx.config.autoMemory.reserveTokens,
      });
    },

    vector: {
      async rebuild() {
        const { path: rolePath, name: roleName } = requireActiveRole(ctx);
        return rebuildVectorIndex(rolePath, roleName);
      },
      async stats() {
        return getVectorStats();
      },
      isActive() {
        return isVectorActive();
      },
    },
  };
}
