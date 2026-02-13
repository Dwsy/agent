/**
 * Role Persona Extension - OpenClaw-style persona system for pi
 *
 * Modules:
 *   role-context.ts  — shared state (RoleContext class)
 *   role-ui.ts       — TUI role selector + setup
 *   role-store.ts    — role filesystem + config.json
 *   role-template.ts — default prompt templates
 *   memory-tool.ts   — memory tool registration
 *   commands.ts      — all registerCommand() calls
 *   memory-md.ts     — markdown memory engine
 *   memory-llm.ts    — LLM extraction + tidy
 *   memory-tags.ts   — tag system
 *   memory-viewer.ts — TUI viewer
 *   config.ts        — configuration
 *   logger.ts        — file logger
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { compact as piCompact } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { log } from "./logger.ts";
import { config } from "./config.ts";
import { RoleContext } from "./role-context.ts";
import { setupRole, activateRole } from "./role-ui.ts";
import { registerMemoryTool } from "./memory-tool.ts";
import { registerCommands } from "./commands.ts";

import {
  addRoleLearning,
  addRolePreference,
  appendDailyRoleMemory,
  buildMemoryEditInstruction,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  readMemoryPromptBlocks,
} from "./memory-md.ts";
import { runAutoMemoryExtraction } from "./memory-llm.ts";
import {
  DEFAULT_ROLE,
  ensureRolesDir,
  isRoleDisabledForCwd,
  loadRoleConfig,
  loadRolePrompts,
  resolveRoleForCwd,
  ROLES_DIR,
} from "./role-store.ts";

// Config constants
const AUTO_MEMORY_ENABLED = config.autoMemory.enabled;
const AUTO_MEMORY_MODEL = config.autoMemory.model;
const AUTO_MEMORY_MAX_ITEMS = config.autoMemory.maxItems;
const AUTO_MEMORY_MAX_TEXT = config.autoMemory.maxText;
const AUTO_MEMORY_RESERVE_TOKENS = config.autoMemory.reserveTokens;
const AUTO_MEMORY_BATCH_TURNS = config.autoMemory.batchTurns;
const AUTO_MEMORY_MIN_TURNS = config.autoMemory.minTurns;
const AUTO_MEMORY_INTERVAL_MS = config.autoMemory.intervalMs;
const AUTO_MEMORY_FORCE_KEYWORDS = new RegExp(config.advanced.forceKeywords, "i");
const AUTO_MEMORY_CONTEXT_OVERLAP = config.autoMemory.contextOverlap;
const SHUTDOWN_FLUSH_TIMEOUT = config.advanced.shutdownFlushTimeoutMs;
const EVOLUTION_REMINDER_TURNS = config.advanced.evolutionReminderTurns;
const ON_DEMAND_SEARCH_ENABLED = config.memory.onDemandSearch.enabled;
const ON_DEMAND_SEARCH_MAX_RESULTS = config.memory.onDemandSearch.maxResults;
const ON_DEMAND_SEARCH_MIN_SCORE = config.memory.onDemandSearch.minScore;
const ON_DEMAND_LOAD_HIGH_PRIORITY = config.memory.onDemandSearch.alwaysLoadHighPriority;

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default function rolePersonaExtension(pi: ExtensionAPI) {
  const rc = new RoleContext(pi);

  // ── Local helpers ──

  function messageText(messages: unknown[]): string {
    const last = (messages as any[]).findLast((m) => m.role === "user");
    return typeof last?.content === "string" ? last.content : "";
  }

  function shouldFlushAutoMemory(messages: unknown[]): { should: boolean; reason: string } {
    if (rc.autoMemoryInFlight || rc.autoMemoryBgScheduled) return { should: false, reason: "in-flight" };
    if (rc.autoMemoryPendingTurns < AUTO_MEMORY_MIN_TURNS) return { should: false, reason: "too-few-turns" };

    const text = messageText(messages);
    if (AUTO_MEMORY_FORCE_KEYWORDS.test(text)) {
      return { should: true, reason: "keyword" };
    }
    if (rc.autoMemoryPendingTurns >= AUTO_MEMORY_BATCH_TURNS) {
      return { should: true, reason: "batch-5-turns" };
    }
    const now = Date.now();
    const intervalReached = now - rc.autoMemoryLastAt >= AUTO_MEMORY_INTERVAL_MS;
    if (intervalReached && rc.autoMemoryPendingTurns >= AUTO_MEMORY_MIN_TURNS) {
      return { should: true, reason: "interval-30m" };
    }
    return { should: false, reason: "no-trigger" };
  }

  async function flushAutoMemory(messages: unknown[], ctx: ExtensionContext, reason: string): Promise<void> {
    if (!AUTO_MEMORY_ENABLED || rc.autoMemoryInFlight) return;
    if (!rc.currentRole || !rc.currentRolePath) return;

    rc.autoMemoryInFlight = true;
    rc.startMemoryCheckpointSpinner(ctx);

    const sliceStart = Math.max(0, rc.autoMemoryLastFlushLen - AUTO_MEMORY_CONTEXT_OVERLAP);
    const recentMessages = messages.slice(sliceStart);

    log("checkpoint", `flush reason=${reason} totalMessages=${messages.length} sliceStart=${sliceStart} newMessages=${recentMessages.length} pendingTurns=${rc.autoMemoryPendingTurns}`);

    try {
      const extracted = await runAutoMemoryExtraction(rc.currentRole, rc.currentRolePath, ctx, recentMessages, {
        enabled: AUTO_MEMORY_ENABLED,
        model: AUTO_MEMORY_MODEL,
        maxItems: AUTO_MEMORY_MAX_ITEMS,
        maxText: AUTO_MEMORY_MAX_TEXT,
        reserveTokens: AUTO_MEMORY_RESERVE_TOKENS,
      });

      rc.autoMemoryLastFlushLen = messages.length;
      rc.autoMemoryLastAt = Date.now();
      rc.autoMemoryPendingTurns = 0;

      if (extracted) {
        log("checkpoint", `result: ${extracted.storedLearnings}L ${extracted.storedPrefs}P`);
        rc.setMemoryCheckpointResult(ctx, reason, extracted.storedLearnings, extracted.storedPrefs);
        if (extracted.items) {
          for (const item of extracted.items) {
            rc.memLogPush({
              source: "auto-extract",
              op: item.type === "learning" ? "learning" : item.type === "preference" ? "preference" : "event",
              content: item.text || item.content || "",
              stored: item.stored !== false,
              detail: `reason=${reason}`,
            });
          }
        } else {
          rc.memLogPush({ source: "auto-extract", op: "learning", content: `(batch: ${extracted.storedLearnings}L ${extracted.storedPrefs}P)`, stored: true, detail: `reason=${reason}` });
        }
      } else {
        log("checkpoint", "result: null (no extraction)");
      }
    } finally {
      rc.autoMemoryInFlight = false;
      rc.autoMemoryBgScheduled = false;
      rc.stopMemoryCheckpointSpinner();
    }
  }

  function scheduleAutoMemoryFlush(messages: unknown[], ctx: ExtensionContext, reason: string): void {
    if (rc.autoMemoryBgScheduled) return;
    rc.autoMemoryBgScheduled = true;
    const snapshot = [...messages];
    queueMicrotask(() => {
      flushAutoMemory(snapshot, ctx, reason).catch((err) => {
        log("checkpoint", `flush error: ${err}`);
        rc.autoMemoryInFlight = false;
        rc.autoMemoryBgScheduled = false;
        rc.stopMemoryCheckpointSpinner();
      });
    });
  }

  async function loadMemoryFiles(rolePath: string): Promise<string[]> {
    return readMemoryPromptBlocks(rolePath);
  }

  // ============ EVENT HANDLERS ============

  // 1. Session start - auto-load role based on cwd mapping
  pi.on("session_start", async (_event, ctx) => {
    ensureRolesDir();
    const roleConfig = loadRoleConfig();
    const cwd = ctx.cwd;

    if (isRoleDisabledForCwd(cwd, roleConfig)) {
      log("session", `role disabled for cwd=${cwd}`);
      return;
    }

    const resolution = resolveRoleForCwd(cwd, roleConfig);
    const roleName = resolution.role || DEFAULT_ROLE;
    const rolePath = join(ROLES_DIR, roleName);

    log("session", `start cwd=${cwd} role=${roleName} source=${resolution.source}`);

    if (ctx.hasUI) {
      await setupRole(rc, roleName, ctx);
    } else {
      await activateRole(rc, roleName, rolePath, ctx);
    }
  });

  // 2. Inject prompts into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    if (!rc.currentRole || !rc.currentRolePath) return;

    const rolePath = rc.currentRolePath;
    const roleName = rc.currentRole;

    const prompts = loadRolePrompts(rolePath);
    const memoryBlocks = await loadMemoryFiles(rolePath);

    const parts: string[] = [];

    // File locations
    parts.push(`## 📁 FILE LOCATIONS\n\nIMPORTANT: All persona files are stored in the role directory:\n**${rolePath}**\n`);
    parts.push(`When creating or editing these files, ALWAYS use the full path:`);
    parts.push(`- IDENTITY.md → ${rolePath}/IDENTITY.md`);
    parts.push(`- USER.md → ${rolePath}/USER.md`);
    parts.push(`- SOUL.md → ${rolePath}/SOUL.md`);
    parts.push(`- MEMORY.md → ${rolePath}/MEMORY.md`);
    parts.push(`- Daily memories → ${rolePath}/memory/YYYY-MM-DD.md\n`);

    // Memory instruction (minimal)
    parts.push(`## 📝 MEMORY\n\nMemory is auto-managed in the background. Only use the \`memory\` tool when the user explicitly asks to remember something.\nDo NOT proactively save memories or do reflections unless asked.\n`);

    // Memory edit spec
    parts.push(buildMemoryEditInstruction(rolePath));

    // Prompt files
    for (const [label, content] of Object.entries(prompts)) {
      if (content) {
        parts.push(`## ${label}\n\n${content}\n`);
      }
    }

    // Memory blocks
    if (memoryBlocks.length > 0) {
      parts.push(`## Your Memory\n`);
      for (const block of memoryBlocks) {
        parts.push(block);
      }
    }

    // On-demand memory search (first user message gets high-priority + relevant memories)
    if (ON_DEMAND_SEARCH_ENABLED && rc.isFirstUserMessage) {
      rc.isFirstUserMessage = false;
      const userQuery = (event as any).prompt || "";
      if (userQuery.trim()) {
        const onDemand = loadMemoryOnDemand(rolePath, roleName, userQuery, {
          maxResults: ON_DEMAND_SEARCH_MAX_RESULTS,
          minScore: ON_DEMAND_SEARCH_MIN_SCORE,
        });
        if (onDemand.matchCount > 0) {
          parts.push(`\n### Relevant Memories (auto-loaded)\n`);
          for (const m of onDemand.matches) {
            parts.push(`- [${m.kind}] ${m.text}`);
          }
          log("memory-on-demand", `First message: loaded ${onDemand.matchCount} relevant memories + high priority`);
        }
      }
      if (ON_DEMAND_LOAD_HIGH_PRIORITY) {
        const highPriority = loadHighPriorityMemories(rolePath, roleName);
        if (highPriority.length > 0) {
          parts.push(`\n### Long-Term Memory\n`);
          for (const hp of highPriority) {
            parts.push(`- [${hp.used}x] ${hp.text}`);
          }
        }
      }
    }

    (event as any).systemPrompt += "\n\n" + parts.join("\n");
  });

  // 3. Smart auto-memory checkpoints (not every turn)
  pi.on("agent_end", async (event, ctx) => {
    if (!AUTO_MEMORY_ENABLED) return;
    if (!rc.currentRole || !rc.currentRolePath) return;

    rc.autoMemoryPendingTurns += 1;
    rc.autoMemoryLastMessages = event.messages;

    const decision = shouldFlushAutoMemory(event.messages);
    if (!decision.should) return;

    scheduleAutoMemoryFlush(event.messages, ctx, decision.reason);
  });

  // 3.5 Intercept compaction to extract memories before context is lost.
  pi.on("session_before_compact", async (event, ctx) => {
    if (!AUTO_MEMORY_ENABLED || !rc.currentRole || !rc.currentRolePath) return;

    const { preparation, signal } = event;
    const rolePath = rc.currentRolePath;
    const roleName = rc.currentRole;
    const model = ctx.model;
    if (!model) return;

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      log("compact-memory", "no apiKey available, skipping memory extraction");
      return;
    }

    log("compact-memory", `intercepting compaction: ${preparation.messagesToSummarize.length} messages to summarize`);

    const memoryInstruction = `

IMPORTANT: In addition to the summary above, extract key memories from this conversation that should be preserved long-term.
Output them in a <memory> block at the END of your response, after the summary.
Format:

<memory>
[
  {"type": "learning", "content": "concise factual insight or pattern"},
  {"type": "preference", "content": "user preference or habit", "category": "Communication|Code|Tools|Workflow|General"},
  {"type": "event", "content": "significant event or milestone", "date": "YYYY-MM-DD"}
]
</memory>

Rules for memory extraction:
- Only extract DURABLE, REUSABLE insights (not one-off task details)
- Keep each item under 120 chars
- Max 5 items total
- Skip the <memory> block entirely if nothing worth remembering
- The <memory> block must contain valid JSON inside the tags`;

    try {
      const result = await piCompact(preparation, model, apiKey, memoryInstruction, signal);

      const memoryMatch = result.summary.match(/<memory>\s*([\s\S]*?)\s*<\/memory>/);
      if (memoryMatch) {
        result.summary = result.summary.replace(/<memory>[\s\S]*?<\/memory>/, "").trimEnd();

        try {
          const items = JSON.parse(memoryMatch[1]) as Array<{
            type: string; content: string; category?: string; date?: string;
          }>;

          let storedL = 0, storedP = 0;
          for (const item of items) {
            if (!item.content?.trim()) continue;

            if (item.type === "learning") {
              const r = addRoleLearning(rolePath, roleName, item.content, { source: "compaction", appendDaily: true });
              rc.memLogPush({ source: "compaction", op: "learning", content: item.content, stored: r.stored, detail: r.reason });
              if (r.stored) storedL++;
            } else if (item.type === "preference") {
              const r = addRolePreference(rolePath, roleName, item.category || "General", item.content, { appendDaily: true });
              rc.memLogPush({ source: "compaction", op: "preference", content: item.content, stored: r.stored, detail: item.category });
              if (r.stored) storedP++;
            } else if (item.type === "event") {
              appendDailyRoleMemory(rolePath, "event", item.content);
              rc.memLogPush({ source: "compaction", op: "event", content: item.content, stored: true });
            }
          }

          log("compact-memory", `extracted ${storedL}L ${storedP}P from compaction`);
          rc.setMemoryCheckpointResult(ctx, "compaction", storedL, storedP);
        } catch (parseErr) {
          log("compact-memory", `failed to parse <memory> JSON: ${parseErr}`);
        }
      } else {
        log("compact-memory", "no <memory> block in compaction output");
      }

      return {
        compaction: {
          summary: result.summary,
          firstKeptEntryId: result.firstKeptEntryId,
          tokensBefore: result.tokensBefore,
          details: result.details,
        },
      };
    } catch (err) {
      log("compact-memory", `compaction failed, falling back to default: ${err}`);
      return;
    }
  });

  // 4. Flush on session shutdown if there are pending turns (best-effort, bounded wait)
  pi.on("session_shutdown", async (_event, ctx) => {
    if (AUTO_MEMORY_ENABLED && rc.autoMemoryPendingTurns > 0 && rc.autoMemoryLastMessages) {
      await Promise.race([
        flushAutoMemory(rc.autoMemoryLastMessages, ctx, "session-shutdown"),
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_TIMEOUT)),
      ]);
    }
    rc.stopMemoryCheckpointSpinner();
  });

  // ============ REGISTER TOOL & COMMANDS ============

  registerMemoryTool(pi, rc);
  registerCommands(pi, rc);

  // ============ EVOLUTION REMINDER ============

  let userTurnCount = 0;
  let lastEvolutionAt = 0;
  let lastEvolutionDate = "";

  pi.on("turn_end", async (event, ctx) => {
    if (!rc.currentRolePath || !ctx.hasUI) return;

    const messages = (event as any).messages || [];
    const lastUserIdx = messages.findLastIndex((m: any) => m.role === "user");
    const lastAssistantIdx = messages.findLastIndex((m: any) => m.role === "assistant");
    if (lastUserIdx < 0 || (lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx)) return;

    userTurnCount++;

    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000;

    if (
      userTurnCount >= EVOLUTION_REMINDER_TURNS &&
      lastEvolutionDate !== today &&
      now - lastEvolutionAt >= cooldownMs
    ) {
      lastEvolutionDate = today;
      lastEvolutionAt = now;
      userTurnCount = 0;

      pi.sendMessage({
        customType: "evolution-reminder",
        content: `[Low-priority note] When you have a natural pause, consider a brief daily reflection:
- Skim ${rc.currentRolePath}/memory/ for today's notes
- Optionally update MEMORY.md with durable insights
This is background housekeeping — always prioritize the user's current question first.`,
        display: false
      }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
  });
}
