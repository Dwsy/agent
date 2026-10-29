/**
 * System prompt injection (before_agent_start): file location instructions,
 * bootstrap guidance, role prompts, memory blocks, vector auto-recall,
 * external readonly hints, and memory-distill mode.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { log } from "../logger.ts";
import {
  buildPendingReviewBlock,
  loadMemoryOnDemand,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
} from "../memory-md.ts";
import { autoRecall, isVectorActive } from "../memory-vector.ts";
import { isFirstRun } from "../role-store.ts";
import type { Runtime } from "./context.ts";
import { buildExternalReadonlyPrompt, isExternalReadonlyEnabled } from "./external-readonly.ts";

function buildFileLocationInstruction(currentRolePath: string): string {
  return `## 🧠 ROLE & MEMORY

Role directory: ${currentRolePath} (core/*.md = persona; memory/consolidated.md + memory/daily/ = memory). Do not mechanically read role files for greetings or normal replies.

You own this role's memory — background extraction is only a safety net. Two tools:
- \`role_search({ query, scope? })\` — search memory + knowledge when prior cross-session context could change your answer. Not for greetings or self-contained tasks.
- \`role_exec({ op, args })\` — all operations: add_learning / add_preference / add_event / update_* / delete_* / promote_pending / discard_pending / reinforce / read / kb_* … Run \`role_exec({ op: "help" })\` for the full catalog and argument specs.

Protocol:
- Write durable insights the moment they occur (test: useful next session?); skip task-local noise; no mechanical end-of-task reflections.
- Injected memory entries carry \`[id:...]\` — fix wrong/stale entries on sight by passing that id to update_*/delete_*; \`reinforce\` entries that proved useful. Never delete preferences without user confirmation.
- Pending candidates (if shown below) → review with promote_pending / discard_pending.`;
}

export function buildMemoryPrompt(rt: Runtime): string {
  const { state } = rt;
  // A frozen snapshot must never outlive the switches that produced it:
  // toggling injection off mid-session has to take effect on the next turn.
  const configKey = memoryInjectionConfigKey();
  if (state.memoryPromptSnapshot !== null && state.memoryPromptConfigKey === configKey) {
    return state.memoryPromptSnapshot;
  }
  state.memoryPromptConfigKey = configKey;

  const injection = config.memory.injection;
  if (!injection.enabled) {
    state.memoryPromptSnapshot = "";
    return "";
  }

  const currentRolePath = state.currentRolePath!;
  const currentRole = state.currentRole!;
  const memoryBlocks: string[] = [];

  if (injection.longTerm) {
    const longTerm = readLongTermMemoryBlock(currentRolePath, currentRole);
    if (longTerm) memoryBlocks.push(longTerm);

    const pendingReview = buildPendingReviewBlock(currentRolePath);
    if (pendingReview) memoryBlocks.push(pendingReview);
  }

  if (config.memory.dailyInjection.enabled) {
    const dailyBlocks = readDailyMemoryBlocks(currentRolePath);
    if (dailyBlocks.length > 0) memoryBlocks.push(...dailyBlocks);
  }

  state.memoryPromptSnapshot = memoryBlocks.length === 0
    ? ""
    : `\n\n## Your Memory\n\n${memoryBlocks.join("\n\n---\n\n")}`;
  return state.memoryPromptSnapshot;
}

/**
 * Fingerprint of every switch that shapes the memory snapshot.
 * Kept as a plain string so a config change invalidates the snapshot cheaply.
 */
function memoryInjectionConfigKey(): string {
  const { injection, dailyInjection, dailySummary } = config.memory;
  return [injection.enabled, injection.longTerm, dailyInjection.enabled, dailySummary.enabled, dailySummary.recentDays].join("|");
}

function buildOnDemandRecallPrompt(rt: Runtime, event: any): string {
  const { state } = rt;
  if (!config.memory.injection.enabled) return "";
  if (!config.memory.onDemandSearch.enabled || !state.isFirstUserMessage) return "";
  state.isFirstUserMessage = false;

  const userQuery = typeof event.prompt === "string" ? event.prompt : "";
  if (!userQuery) return "";

  const onDemand = loadMemoryOnDemand(state.currentRolePath!, state.currentRole!, userQuery, {
    maxResults: config.memory.onDemandSearch.maxResults,
    minScore: config.memory.onDemandSearch.minScore,
    includeHighPriority: config.memory.onDemandSearch.alwaysLoadHighPriority,
  });
  if (!onDemand.content) return "";
  log("memory-on-demand", `First message: loaded ${onDemand.matchCount} relevant memories + high priority`);
  return onDemand.content;
}

async function buildVectorRecallPrompt(event: any): Promise<string> {
  if (!isVectorActive() || !config.vectorMemory?.autoRecall) return "";

  const queryText = typeof event.prompt === "string" ? event.prompt : "";

  if (queryText.length <= 10) return "";

  const recalled = await autoRecall(
    queryText,
    config.vectorMemory.recallLimit,
    config.vectorMemory.recallMinScore,
  );
  if (!recalled) return "";

  log("vector-recall", `injected semantic context for: "${queryText.slice(0, 60)}..."`);
  return `\n\n${recalled}`;
}

function buildMemoryDistillPrompt(rt: Runtime): string {
  const { memoryDistillMode, currentRole } = rt.state;
  if (!memoryDistillMode?.active) return "";

  return `\n\n## Memory Distill Mode\nYou are currently in an interactive memory→knowledge distillation workflow for role \`${currentRole}\`.\n\nGoals:\n1. Read the role's memory and knowledge state using the available tools.\n2. Ask concise clarification questions when needed instead of assuming promotion decisions.\n3. Produce a promotion proposal, not a vague reflection.\n4. Distinguish between memory, role knowledge, project knowledge, and global knowledge.\n5. Be conservative: bad knowledge is more expensive than extra memory.\n\nBehavior:\n- First, inspect relevant memory files and existing knowledge entries.\n- If key ambiguity remains, ask a small number of high-value questions to the user.\n- If enough evidence already exists, skip the questions and directly produce a distillation proposal.\n- Prefer operational rules, reusable heuristics, and architectural conventions over emotional reflection.\n- Do not write knowledge automatically unless the user explicitly asks you to execute the promotion.\n\nSuggested output sections:\n- Summary\n- Candidate Decisions\n- Open Questions\n- Promotion Plan\n\nRequested model hint: ${memoryDistillMode.requestedModel || "(use current session model)"}`;
}

export function registerInjection(rt: Runtime): void {
  rt.pi.on("before_agent_start", async (event, ctx) => {
    const { state } = rt;
    if (!state.currentRolePath || !state.currentRole) return;

    const fileLocationInstruction = buildFileLocationInstruction(state.currentRolePath);

    // First run: inject BOOTSTRAP guidance
    if (isFirstRun(state.currentRolePath)) {
      const bootstrapPath = join(state.currentRolePath, "BOOTSTRAP.md");
      const bootstrap = readFileSync(bootstrapPath, "utf-8");

      return {
        systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n## [FIRST RUN] FIRST RUN - BOOTSTRAP\n\n${bootstrap}\n\n---\n\nFollow the BOOTSTRAP.md guidance above. After initialization is complete, delete BOOTSTRAP.md.`
      };
    }

    // Normal operation: static role/memory snapshots stay in the system prompt.
    const rolePrompt = state.rolePromptSnapshot || "";
    const memoryPrompt = buildMemoryPrompt(rt);
    const onDemandRecallPrompt = buildOnDemandRecallPrompt(rt, event as any);
    const vectorRecallPrompt = await buildVectorRecallPrompt(event as any);

    // External readonly memory (optional): inject cross-session hints.
    let externalReadonlyPrompt = "";
    if (isExternalReadonlyEnabled()) {
      externalReadonlyPrompt = await buildExternalReadonlyPrompt(event.prompt || "", ctx.cwd || "");
    }

    const memoryDistillPrompt = buildMemoryDistillPrompt(rt);
    const dynamicContext = [onDemandRecallPrompt, vectorRecallPrompt, externalReadonlyPrompt, memoryDistillPrompt]
      .filter(Boolean)
      .join("\n\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n${rolePrompt}${memoryPrompt}`,
      ...(dynamicContext ? {
        message: {
          customType: "role-persona-context",
          content: dynamicContext,
          display: false,
        },
      } : {}),
    };
  });
}
