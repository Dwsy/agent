/**
 * Session lifecycle handlers: session_start, resources_discover, agent_end,
 * session_shutdown, and the turn_end evolution reminder.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setProjectCwd } from "../knowledge.ts";
import { log, setCurrentRole, setSessionId } from "../logger.ts";
import { disposeVectorMemory, flushVectorIndex } from "../memory-vector.ts";
import {
  createRole,
  ensureRolesDir,
  loadRoleConfig,
  migrateAllRolesToStructuredLayout,
  resolveRoleForCwd,
  ROLES_DIR,
} from "../role-store.ts";
import { config } from "../config.ts";
import {
  flushAutoMemory,
  scheduleAutoMemoryFlush,
  shouldFlushAutoMemory,
  stopMemoryCheckpointSpinner,
} from "./auto-memory.ts";
import type { CompactionIntegration } from "./compaction.ts";
import type { Runtime } from "./context.ts";
import { runExternalExperienceExtract, isExternalReadonlyEnabled } from "./external-readonly.ts";
import { activateRole } from "./role-activation.ts";
import { isTuiAvailable, notify } from "./ui.ts";

export function registerLifecycle(rt: Runtime, compaction: CompactionIntegration): void {
  const { pi } = rt;

  // 1. Session start - auto-load role based on cwd mapping
  pi.on("session_start", async (_event, ctx) => {
    const { state } = rt;
    compaction.publish();
    ensureRolesDir();

    const migration = migrateAllRolesToStructuredLayout();
    if (migration.migratedFiles > 0 || migration.removedFiles > 0) {
      log(
        "role-migration",
        `upgraded ${migration.migratedFiles} files, removed ${migration.removedFiles} legacy files across ${migration.roles} roles`
      );
      if (isTuiAvailable(ctx)) {
        notify(
          rt,
          ctx,
          `Role data upgraded (${migration.migratedFiles} migrated, ${migration.removedFiles} legacy files removed)`,
          "info"
        );
      }
    }

    // Capture session ID from sessionManager for logging correlation
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (sessionId) {
      setSessionId(sessionId);
    }

    // Reset first message flag for on-demand memory search
    state.isFirstUserMessage = true;
    state.dailySummaryEnsuredFor = null;

    // Discover project-level knowledge base (docs/knowledge/)
    setProjectCwd(ctx.cwd);

    const roleConfig = loadRoleConfig();
    const cwd = ctx.cwd;
    const resolution = resolveRoleForCwd(cwd, roleConfig);
    const roleName = resolution.role;

    if (roleName) {
      setCurrentRole(roleName);
      const rolePath = join(ROLES_DIR, roleName);

      // 默认角色缺失时自动创建，保证默认角色可用
      if (!existsSync(rolePath) && resolution.source === "default") {
        createRole(roleName);
      }

      if (existsSync(rolePath)) {
        await activateRole(rt, roleName, rolePath, ctx);
      } else {
        notify(rt, ctx, `[WARN] 角色 "${roleName}" 不存在（source: ${resolution.source}）`, "warning");
        ctx.ui?.setStatus("role", "none");
      }
    } else {
      if (isTuiAvailable(ctx)) {
        ctx.ui.setStatus("role", resolution.source === "disabled" ? "off" : "none");
      }
    }
  });

  // 2. Resource discovery — expose bundled skills for agent-driven memory management
  pi.on("resources_discover", async () => {
    if (!existsSync(rt.skillsDir)) return;
    return {
      skillPaths: [rt.skillsDir],
    };
  });

  // 3. Smart auto-memory checkpoints (not every turn)
  pi.on("agent_end", async (event, ctx) => {
    const { state } = rt;
    if (!state.currentRole || !state.currentRolePath) return;

    // External readonly memory experience extraction (best-effort, no side effects)
    if (isExternalReadonlyEnabled()) {
      await runExternalExperienceExtract(ctx.cwd || "");
    }

    if (!config.autoMemory.enabled) return;

    state.autoMemoryPendingTurns += 1;
    state.autoMemoryLastMessages = event.messages;

    const decision = shouldFlushAutoMemory(rt, event.messages);
    if (!decision.should) return;

    // Non-blocking checkpoint: run in background, don't hold the turn.
    scheduleAutoMemoryFlush(rt, event.messages, ctx, decision.reason);
  });

  // 4. Flush on session shutdown if there are pending turns (best-effort, bounded wait)
  pi.on("session_shutdown", async (_event, ctx) => {
    const { state } = rt;
    if (config.autoMemory.enabled && state.autoMemoryPendingTurns > 0 && state.autoMemoryLastMessages) {
      await Promise.race([
        flushAutoMemory(rt, state.autoMemoryLastMessages, ctx, "session-shutdown"),
        new Promise<void>((resolve) => setTimeout(resolve, config.advanced.shutdownFlushTimeoutMs)),
      ]);
    }

    // Flush pending vector index entries
    await flushVectorIndex().catch((err) => log("vector", `flush on shutdown failed: ${err}`));
    disposeVectorMemory();

    stopMemoryCheckpointSpinner(rt);

    if (isTuiAvailable(ctx)) {
      ctx.ui.setStatus("role", undefined);
      ctx.ui.setStatus("memory-checkpoint", undefined);
    }

    compaction.unpublish();
  });

  // 5. Evolution reminder: periodic gentle nudge for daily reflection.
  // Counts USER input turns only, with 60-min cooldown to avoid spam.
  pi.on("turn_end", async (event, ctx) => {
    const { state } = rt;
    if (!state.currentRolePath || !ctx.hasUI) return;

    // Only count turns that started from a user message
    const messages = (event as any).messages || [];
    const lastUserIdx = messages.findLastIndex((m: any) => m.role === "user");
    const lastAssistantIdx = messages.findLastIndex((m: any) => m.role === "assistant");
    // If the latest user message is newer than the latest assistant, this turn was user-initiated
    if (lastUserIdx < 0 || (lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx)) return;

    state.userTurnCount++;

    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000; // 60 minutes

    // Trigger: every N user turns, max once per 60 min, once per day
    if (
      state.userTurnCount >= config.advanced.evolutionReminderTurns &&
      state.lastEvolutionDate !== today &&
      now - state.lastEvolutionAt >= cooldownMs
    ) {
      state.lastEvolutionDate = today;
      state.lastEvolutionAt = now;
      state.userTurnCount = 0;

      // Low-priority note — must NOT override user intent
      pi.sendMessage({
        customType: "evolution-reminder",
        content: `[Low-priority note] When you have a natural pause, consider a brief daily reflection:
- Skim ${state.currentRolePath}/memory/daily/ for today's notes
- Optionally update memory/consolidated.md with durable insights
This is background housekeeping — always prioritize the user's current question first.`,
        display: false
      }, {
        triggerTurn: false,
        deliverAs: "nextTurn"
      });
    }
  });
}
