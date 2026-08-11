/**
 * Role setup/activation: resets per-role runtime state, ensures memory files,
 * expires stale pending entries, kicks off vector init and daily summaries.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { config } from "../config.ts";
import { log, logError } from "../logger.ts";
import { ensureDailySummaries } from "../memory-llm.ts";
import {
  ensureRoleMemoryFiles,
  expirePendingMemories,
  getPendingMemories,
  listDailySummariesToGenerate,
  repairRoleMemory,
} from "../memory-md.ts";
import { initVectorMemory } from "../memory-vector.ts";
import { getRoleIdentity } from "../role-store.ts";
import type { Runtime } from "./context.ts";
import { stopMemoryCheckpointSpinner } from "./auto-memory.ts";
import { isTuiAvailable, notify } from "./ui.ts";

export function autoRepairRoleMemory(rt: Runtime, rolePath: string, roleName: string, ctx: ExtensionContext, source: string) {
  try {
    const result = repairRoleMemory(rolePath, roleName);
    if (result.repaired) {
      log("repair", `auto-repair ${source}: applied (${result.issues} issues)`);
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("repair", `auto-repair ${source} failed: ${message}`);
    notify(rt, ctx, `memory/consolidated.md 自动修复失败: ${message}`, "error");
    return { repaired: false, issues: 0 };
  }
}

export async function activateRole(rt: Runtime, roleName: string, rolePath: string, ctx: ExtensionContext): Promise<void> {
  const { state } = rt;
  state.currentRole = roleName;
  state.currentRolePath = rolePath;
  state.autoMemoryInFlight = false;
  state.autoMemoryBgScheduled = false;
  state.autoMemoryPendingTurns = 0;
  state.autoMemoryLastFlushLen = 0;
  state.autoMemoryLastMessages = null;
  stopMemoryCheckpointSpinner(rt);

  ensureRoleMemoryFiles(rolePath, roleName);
  autoRepairRoleMemory(rt, rolePath, roleName, ctx, "activateRole");

  // Pending layer: do NOT randomly promote items.
  // Promotion must remain usage-driven (search/relevance/manual action), otherwise
  // pending loses its meaning as a verification buffer.
  const pending = getPendingMemories(rolePath);
  if (pending.length > 0) {
    log("pending", `session start: ${pending.length} pending memories waiting for verification`);
  }

  // Expire old pending memories (> 7 days without promotion)
  const expireResult = expirePendingMemories(rolePath, 7);
  if (expireResult.expired > 0) {
    log("pending", `session start: expired ${expireResult.expired} old pending memories`);
  }

  // Initialize vector memory (async, non-blocking)
  initVectorMemory(rolePath, ctx).then((ok) => {
    if (ok && isTuiAvailable(ctx)) {
      log("vector", `vector memory active for role=${roleName}`);
    }
  }).catch((err) => {
    log("vector", `vector memory init failed: ${err}`);
  });

  // Daily summary generation: only run when there are actually missing
  // summaries for the configured window. The file system IS the cache.
  if (
    config.memory.dailySummary.enabled &&
    config.memory.dailySummary.autoGenerate &&
    state.dailySummaryEnsuredFor !== rolePath
  ) {
    const missing = listDailySummariesToGenerate(rolePath, config.memory.dailySummary.recentDays);
    if (missing.length === 0) {
      log("daily-summary", `activateRole: all summaries cached (window=${config.memory.dailySummary.recentDays})`);
      state.dailySummaryEnsuredFor = rolePath;
    } else {
      try {
        if (isTuiAvailable(ctx)) {
          ctx.ui.setStatus("daily-summary", `generating ${missing.length}\u2026`);
        }
        const result = await ensureDailySummaries(ctx, rolePath);
        if (result.generated > 0 || result.failed > 0) {
          log(
            "daily-summary",
            `activateRole: generated=${result.generated} failed=${result.failed}`
          );
          if (isTuiAvailable(ctx) && result.generated > 0) {
            notify(rt, ctx, `Daily summaries: +${result.generated}`, "info");
          }
        }
        state.dailySummaryEnsuredFor = rolePath;
      } catch (err) {
        logError("daily-summary", "activateRole generation failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (isTuiAvailable(ctx)) {
          ctx.ui.setStatus("daily-summary", undefined);
        }
      }
    }
  }

  if (isTuiAvailable(ctx)) {
    const identity = getRoleIdentity(rolePath);
    const displayName = identity?.name || roleName;

    ctx.ui.setStatus("role", displayName);
    ctx.ui.setStatus("memory-checkpoint", undefined);
  }
}
