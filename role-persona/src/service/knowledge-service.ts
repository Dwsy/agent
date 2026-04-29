/**
 * Knowledge Service — knowledge base CRUD and search.
 */

import { basename } from "node:path";
import type {
  KnowledgeListResult,
  KnowledgeSearchResultItem,
  KnowledgeReadResult,
  KnowledgeWriteInput,
  KnowledgeWriteResult,
  KnowledgeSearchParams,
} from "../core/types.ts";
import {
  listKnowledge,
  readKnowledge,
  searchKnowledge,
  writeKnowledge,
} from "../core/knowledge.ts";
import { log } from "../core/logger.ts";
import type { ServiceContext } from "./context.ts";
import { requireActiveRole } from "./context.ts";

export interface KnowledgeService {
  list(category?: string): KnowledgeListResult;
  search(query: string, opts?: KnowledgeSearchParams): KnowledgeSearchResultItem[];
  read(path: string): KnowledgeReadResult | null;
  write(entry: KnowledgeWriteInput): KnowledgeWriteResult;
}

export function createKnowledgeService(ctx: ServiceContext): KnowledgeService {
  return {
    list(category?: string) {
      const rolePath = ctx.activeRole?.path;
      const result = listKnowledge(rolePath);

      if (category) {
        for (const src of result.sources) {
          src.categories = src.categories.filter((c) => c.category === category);
        }
      }

      return result;
    },

    search(query: string, opts?: KnowledgeSearchParams) {
      const rolePath = ctx.activeRole?.path;
      const knowledgeConfig = ctx.config.knowledge;
      return searchKnowledge(rolePath, {
        query,
        tags: opts?.tags,
        category: opts?.category,
        scope: opts?.scope,
        limit: opts?.limit || knowledgeConfig.search.maxResults,
        roleBoost: opts?.roleBoost || knowledgeConfig.search.roleBoost,
      });
    },

    read(path: string) {
      const rolePath = ctx.activeRole?.path;
      return readKnowledge(path, rolePath);
    },

    write(entry: KnowledgeWriteInput) {
      const rolePath = ctx.activeRole?.path;
      const result = writeKnowledge(rolePath, entry);
      log("knowledge", `${result.isNew ? "Created" : "Updated"} [${result.source}] ${result.category}/${basename(result.written)} v${result.version}`);
      return result;
    },
  };
}
