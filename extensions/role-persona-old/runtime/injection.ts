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
  buildMemoryEditInstruction,
  buildPendingReviewBlock,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
} from "../memory-md.ts";
import { autoRecall, isVectorActive } from "../memory-vector.ts";
import { isFirstRun, loadRolePrompts } from "../role-store.ts";
import type { Runtime } from "./context.ts";
import { buildExternalReadonlyPrompt, isExternalReadonlyEnabled } from "./external-readonly.ts";
import { getLastUserText } from "./messages.ts";
import { autoRepairRoleMemory } from "./role-activation.ts";

function buildFileLocationInstruction(currentRolePath: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `## 📁 FILE LOCATIONS

IMPORTANT: All persona files are stored in the role directory:
**${currentRolePath}**

Structured paths (v2):
- identity → ${currentRolePath}/core/identity.md
- user → ${currentRolePath}/core/user.md
- soul → ${currentRolePath}/core/soul.md
- constraints → ${currentRolePath}/core/constraints.md
- memory consolidated → ${currentRolePath}/memory/consolidated.md
- daily memories → ${currentRolePath}/memory/daily/${today}.md

Use these paths only when you need to inspect or edit on-disk state.
They are not a mandatory startup checklist, and you should not mechanically read role files for greetings or normal replies.

## 🧠 MEMORY (YOU OWN IT)

You are the primary editor of this role's memory. Background extraction and compaction are only a safety net for what you miss — do not rely on them. Manage memory proactively with the \`memory\` tool, in the natural flow of the conversation.

**Recall** — \`memory({ action: "search", query })\` when prior cross-session context could change your answer; \`memory({ action: "read", section })\` for a full ID-annotated view. Don't search mechanically on greetings or self-contained tasks.

**Write immediately when it happens** (don't defer to background extraction):
- Durable lesson, non-obvious insight, hard-won fix → \`add_learning\`
- Stable user preference or working convention you observed → \`add_preference\`
- Milestone, decision, or notable episode → \`add_event\`
Skip trivial, one-off, task-local noise. Test: "would I want to know this in the next session?"

**Curate on sight** — injected memory entries carry \`[id:...]\`; act the moment you notice a problem:
- Outdated or wrong entry → \`update_learning\` / \`update_preference\` / \`update_event\` with its id
- Duplicate or obsolete entry → \`delete_*\` (never delete preferences without user confirmation)
- An entry proved genuinely useful this session → \`reinforce\`
- Pending candidates shown below → review with \`promote_pending\` / \`discard_pending\` (batch via \`ids\`)

Fixing a wrong memory you just noticed is part of answering well — do it inline, no permission needed. Do NOT write mechanical end-of-task reflections.

Bundled skills may guide this behavior (for example: memory-recall, memory-retro, memory-organize, memory-best-practices).

${buildMemoryEditInstruction(currentRolePath)}`;
}

function buildMemoryPrompt(rt: Runtime, event: any): string {
  const { state } = rt;
  const currentRolePath = state.currentRolePath!;
  const currentRole = state.currentRole!;

  // Memory injection strategy:
  // - On first message: on-demand/high-priority hits + long-term memory + recent daily memory
  // - Subsequent messages: long-term memory + recent daily memory
  // Daily memory stays in the system prompt path. If summary generation is enabled,
  // startup may block while missing summaries are generated, and the user sees the
  // daily-summary status line during that warmup.
  const memoryBlocks: string[] = [];

  if (config.memory.onDemandSearch.enabled && state.isFirstUserMessage) {
    const messages = event.messages || [];
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user");
    const userQuery = lastUserMessage?.content?.[0]?.text || "";

    if (userQuery) {
      const onDemand = loadMemoryOnDemand(currentRolePath, currentRole, userQuery, {
        maxResults: config.memory.onDemandSearch.maxResults,
        minScore: config.memory.onDemandSearch.minScore,
        includeHighPriority: config.memory.onDemandSearch.alwaysLoadHighPriority,
      });
      if (onDemand.content) {
        memoryBlocks.push(onDemand.content);
        log("memory-on-demand", `First message: loaded ${onDemand.matchCount} relevant memories + high priority`);
      }
    } else {
      const highPriority = loadHighPriorityMemories(currentRolePath, currentRole);
      if (highPriority) memoryBlocks.push(highPriority);
    }

    state.isFirstUserMessage = false;
  }

  const longTerm = readLongTermMemoryBlock(currentRolePath, currentRole);
  if (longTerm) memoryBlocks.push(longTerm);

  if (config.memory.dailyInjection.enabled) {
    const dailyBlocks = readDailyMemoryBlocks(currentRolePath);
    if (dailyBlocks.length > 0) memoryBlocks.push(...dailyBlocks);
  }

  const pendingReview = buildPendingReviewBlock(currentRolePath);
  if (pendingReview) memoryBlocks.push(pendingReview);

  if (memoryBlocks.length === 0) return "";
  return `\n\n## Your Memory\n\n${memoryBlocks.join("\n\n---\n\n")}`;
}

async function buildVectorRecallPrompt(event: any): Promise<string> {
  if (!isVectorActive() || !config.vectorMemory?.autoRecall) return "";

  const messages = event.messages || [];
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  const userText = lastUserMsg?.content?.[0]?.text || lastUserMsg?.content || "";
  const queryText = typeof userText === "string" ? userText : "";

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

    autoRepairRoleMemory(rt, state.currentRolePath, state.currentRole, ctx, "before_agent_start");

    const fileLocationInstruction = buildFileLocationInstruction(state.currentRolePath);

    // First run: inject BOOTSTRAP guidance
    if (isFirstRun(state.currentRolePath)) {
      const bootstrapPath = join(state.currentRolePath, "BOOTSTRAP.md");
      const bootstrap = readFileSync(bootstrapPath, "utf-8");

      return {
        systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n## [FIRST RUN] FIRST RUN - BOOTSTRAP\n\n${bootstrap}\n\n---\n\nFollow the BOOTSTRAP.md guidance above. After initialization is complete, delete BOOTSTRAP.md.`
      };
    }

    // Normal operation: inject role prompts
    const rolePrompt = await loadRolePrompts(state.currentRolePath);
    const memoryPrompt = buildMemoryPrompt(rt, event as any);
    const vectorRecallPrompt = await buildVectorRecallPrompt(event as any);

    // External readonly memory (optional): inject cross-session hints.
    let externalReadonlyPrompt = "";
    if (isExternalReadonlyEnabled()) {
      const queryText = getLastUserText((event as any).messages || []);
      externalReadonlyPrompt = await buildExternalReadonlyPrompt(queryText, ctx.cwd || "");
    }

    const memoryDistillPrompt = buildMemoryDistillPrompt(rt);

    return {
      systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n${rolePrompt}${memoryPrompt}${vectorRecallPrompt}${externalReadonlyPrompt}${memoryDistillPrompt}`
    };
  });
}
