/**
 * Embedding Service — vector memory lifecycle management.
 */

import type { VectorStats, RebuildResult } from "../core/types.ts";
import {
  initVectorMemory,
  isVectorActive,
  flushVectorIndex,
  disposeVectorMemory,
  rebuildVectorIndex,
  getVectorStats,
} from "../core/memory-vector.ts";
import { log } from "../core/logger.ts";
import type { ServiceContext } from "./context.ts";
import { requireActiveRole } from "./context.ts";

export interface EmbeddingService {
  init(rolePath: string): Promise<boolean>;
  isActive(): boolean;
  flush(): Promise<void>;
  dispose(): void;
  rebuild(): Promise<RebuildResult>;
  stats(): Promise<VectorStats | null>;
}

export function createEmbeddingService(ctx: ServiceContext): EmbeddingService {
  return {
    async init(rolePath: string) {
      try {
        const ok = await initVectorMemory(rolePath, ctx as any);
        if (ok) {
          log("vector", `vector memory active for role=${ctx.activeRole?.name}`);
        }
        return ok;
      } catch (err) {
        log("vector", `vector memory init failed: ${err}`);
        return false;
      }
    },

    isActive() {
      return isVectorActive();
    },

    async flush() {
      await flushVectorIndex().catch((err) => log("vector", `flush failed: ${err}`));
    },

    dispose() {
      disposeVectorMemory();
    },

    async rebuild() {
      const { path: rolePath, name: roleName } = requireActiveRole(ctx);
      return rebuildVectorIndex(rolePath, roleName);
    },

    async stats() {
      return getVectorStats();
    },
  };
}
