/**
 * Auto-memory checkpoints: decides when to flush, runs LLM extraction in the
 * background, feeds new entries into the vector index and the audit log.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { config } from "../config.ts";
import { log } from "../logger.ts";
import { runAutoMemoryExtraction } from "../memory-llm.ts";
import { readRoleMemory } from "../memory-md.ts";
import { isVectorActive, queueVectorIndex, replaceVectorIndex } from "../memory-vector.ts";
import { memLogPush, type Runtime } from "./context.ts";
import { isTuiAvailable } from "./ui.ts";

export function stopMemoryCheckpointSpinner(rt: Runtime): void {
  if (rt.state.memoryCheckpointSpinner) {
    clearInterval(rt.state.memoryCheckpointSpinner);
    rt.state.memoryCheckpointSpinner = null;
  }
}

function startMemoryCheckpointSpinner(rt: Runtime, ctx: ExtensionContext): void {
  if (!isTuiAvailable(ctx)) return;
  stopMemoryCheckpointSpinner(rt);

  // Spinner frames/interval are sampled once per spinner start; a config reload
  // takes effect on the next checkpoint, which is acceptable for a UI spinner.
  const spinnerFrames = config.ui.spinnerFrames;
  const spinnerInterval = config.ui.spinnerIntervalMs;

  rt.state.memoryCheckpointFrame = 0;
  // ctx.ui.setStatus("memory-checkpoint", spinnerFrames[rt.state.memoryCheckpointFrame]);

  rt.state.memoryCheckpointSpinner = setInterval(() => {
    try {
      rt.state.memoryCheckpointFrame = (rt.state.memoryCheckpointFrame + 1) % spinnerFrames.length;
      // ctx.ui.setStatus("memory-checkpoint", spinnerFrames[rt.state.memoryCheckpointFrame]);
    } catch {
      // ctx is stale after session replacement/reload — stop spinner
      stopMemoryCheckpointSpinner(rt);
    }
  }, spinnerInterval);
}

export function setMemoryCheckpointResult(ctx: ExtensionContext, _reason: string, _learnings: number, _prefs: number): void {
  if (!isTuiAvailable(ctx)) return;
  // ctx.ui.setStatus("memory-checkpoint", `${badge} ${reasonLabel} ${learnings}L ${prefs}P`);
}

export async function flushAutoMemory(rt: Runtime, messages: unknown[], ctx: ExtensionContext, reason: string): Promise<void> {
  const { state } = rt;
  if (!config.autoMemory.enabled || state.autoMemoryInFlight) return;
  if (!state.currentRole || !state.currentRolePath) return;

  state.autoMemoryInFlight = true;
  startMemoryCheckpointSpinner(rt, ctx);

  const sliceStart = Math.max(0, state.autoMemoryLastFlushLen - config.autoMemory.contextOverlap);
  const recentMessages = messages.slice(sliceStart);

  log("checkpoint", `flush reason=${reason} totalMessages=${messages.length} sliceStart=${sliceStart} newMessages=${recentMessages.length} pendingTurns=${state.autoMemoryPendingTurns}`);

  try {
    const extracted = await runAutoMemoryExtraction(state.currentRole, state.currentRolePath, ctx, recentMessages, {
      enabled: config.autoMemory.enabled,
      model: config.autoMemory.model,
      maxItems: config.autoMemory.maxItems,
      maxText: config.autoMemory.maxText,
      reserveTokens: config.autoMemory.reserveTokens,
    });

    state.autoMemoryLastFlushLen = messages.length;
    state.autoMemoryLastAt = Date.now();
    state.autoMemoryPendingTurns = 0;

    if (extracted) {
      log("checkpoint", `result: +${extracted.storedLearnings}L +${extracted.storedPrefs}P ~${extracted.updatedLearnings}L ~${extracted.updatedPrefs}P`);
      setMemoryCheckpointResult(ctx, reason, extracted.storedLearnings + extracted.updatedLearnings, extracted.storedPrefs + extracted.updatedPrefs);

      // Auto-index newly extracted memories to vector DB
      if (isVectorActive() && config.vectorMemory?.autoIndex && (
        extracted.storedLearnings > 0 ||
        extracted.storedPrefs > 0 ||
        extracted.updatedItems.length > 0
      )) {
        const data = readRoleMemory(state.currentRolePath, state.currentRole);
        // Index the most recent N learnings (matching storedLearnings count)
        const recentLearnings = data.learnings.filter(l => l.used === 0).slice(-extracted.storedLearnings);
        for (const l of recentLearnings) {
          queueVectorIndex(l.id, l.text, "learning");
        }
        // Index recent preferences
        const recentPrefs = data.preferences.slice(-extracted.storedPrefs);
        for (const p of recentPrefs) {
          queueVectorIndex(p.id, p.text, "preference", p.category);
        }
        for (const item of extracted.updatedItems) {
          replaceVectorIndex(item.oldId, item.id, item.text, item.type, item.category);
        }
      }

      // Keep one audit entry per model persistence attempt, including skipped writes.
      for (const item of extracted.items) {
        memLogPush(rt, {
          source: "auto-extract",
          op: item.op,
          content: item.content,
          previous: item.previous,
          id: item.id,
          oldId: item.oldId,
          category: item.category,
          stored: item.stored,
          detail: item.detail || `reason=${reason}`,
        });
      }
    } else {
      log("checkpoint", "result: null (no extraction)");
    }
  } finally {
    stopMemoryCheckpointSpinner(rt);
    state.autoMemoryInFlight = false;
  }
}

