import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { complete, completeSimple } from "@mariozechner/pi-ai";

import {
  addRoleLearning,
  addRolePreference,
  applyLlmTidyPlan,
  extractMemoryFacts,
  readRoleMemory,
  type LlmTidyPlan,
} from "./memory-md.ts";
import { log } from "./logger.ts";

type AutoMemoryResponse = {
  learnings?: Array<{ text?: string }>;
  preferences?: Array<{ text?: string; category?: string }>;
};

function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseAutoMemoryResponse(text: string): AutoMemoryResponse | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as AutoMemoryResponse;
  } catch {
    return null;
  }
}

async function resolveRequestedModel(
  ctx: ExtensionContext,
  requested?: string
): Promise<{ model: any; apiKey: string; label: string } | null> {
  if (!requested || !requested.trim()) {
    if (!ctx.model) return null;
    const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
    if (!apiKey) return null;
    return { model: ctx.model, apiKey, label: `${ctx.model.provider}/${ctx.model.id}` };
  }

  const needle = requested.trim().toLowerCase();
  const all = ctx.modelRegistry.getAll();
  const picked = all.find((m) => {
    const byId = `${m.provider}/${m.id}`.toLowerCase() === needle;
    const byName = `${m.provider}/${m.name}`.toLowerCase() === needle;
    const shortId = m.id.toLowerCase() === needle;
    const shortName = m.name.toLowerCase() === needle;
    return byId || byName || shortId || shortName;
  });

  if (!picked) return null;
  const apiKey = await ctx.modelRegistry.getApiKey(picked);
  if (!apiKey) return null;
  return { model: picked, apiKey, label: `${picked.provider}/${picked.id}` };
}

function buildLlmTidyPrompt(rolePath: string, roleName: string): string {
  const data = readRoleMemory(rolePath, roleName);

  const learnings = data.learnings.length > 0
    ? data.learnings.map((l) => `[${l.id}] [${l.used}x] ${l.text}`).join("\n")
    : "(none)";

  const preferences = data.preferences.length > 0
    ? data.preferences.map((p) => `[${p.id}] [${p.category}] ${p.text}`).join("\n")
    : "(none)";

  return [
    "You are a memory tidying planner for a markdown-based role memory system.",
    "Goal: produce conservative, high-quality memory maintenance actions.",
    "Rules:",
    "1) Remove only clear duplicates/noise.",
    "2) Rewrite only when wording can be made shorter/clearer without changing meaning.",
    "3) Add only durable cross-session learnings/preferences.",
    "4) Keep all user constraints and preferences.",
    "5) Be conservative. When uncertain, keep.",
    "",
    "Return strict JSON only with shape:",
    '{"removeLearningIds":[],"removePreferenceIds":[],"rewriteLearnings":[{"id":"...","text":"..."}],"rewritePreferences":[{"id":"...","category":"Communication|Code|Tools|Workflow|General","text":"..."}],"addLearnings":["..."],"addPreferences":[{"category":"Communication|Code|Tools|Workflow|General","text":"..."}]}',
    "",
    "Current learnings:",
    learnings,
    "",
    "Current preferences:",
    preferences,
    "",
    "You may infer from role memory context, but do not invent volatile details.",
  ].join("\n");
}

function parseLlmTidyPlan(text: string): LlmTidyPlan | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as LlmTidyPlan;
    const plan: LlmTidyPlan = {
      removeLearningIds: Array.isArray(parsed.removeLearningIds) ? parsed.removeLearningIds.filter(Boolean) : [],
      removePreferenceIds: Array.isArray(parsed.removePreferenceIds) ? parsed.removePreferenceIds.filter(Boolean) : [],
      rewriteLearnings: Array.isArray(parsed.rewriteLearnings)
        ? parsed.rewriteLearnings.filter((r) => r && r.id && r.text)
        : [],
      rewritePreferences: Array.isArray(parsed.rewritePreferences)
        ? parsed.rewritePreferences.filter((r) => r && r.id && r.text)
        : [],
      addLearnings: Array.isArray(parsed.addLearnings) ? parsed.addLearnings.filter(Boolean) : [],
      addPreferences: Array.isArray(parsed.addPreferences)
        ? parsed.addPreferences.filter((r) => r && r.text)
        : [],
    };
    return plan;
  } catch {
    return null;
  }
}

export async function runLlmMemoryTidy(
  rolePath: string,
  roleName: string,
  ctx: ExtensionContext,
  requestedModel?: string
): Promise<
  | {
      model: string;
      plan: LlmTidyPlan;
      apply: ReturnType<typeof applyLlmTidyPlan>;
    }
  | { error: string }
> {
  log("llm-tidy", `start role=${roleName} requestedModel=${requestedModel || "(session)"}`);

  const resolved = await resolveRequestedModel(ctx, requestedModel);
  if (!resolved) {
    const err = requestedModel ? `Model not found or unauthorized: ${requestedModel}` : "No active model/api key available";
    log("llm-tidy", `abort: ${err}`);
    return { error: err };
  }

  log("llm-tidy", `model resolved: ${resolved.label}`);
  const prompt = buildLlmTidyPrompt(rolePath, roleName);
  log("llm-tidy", `prompt length: ${prompt.length} chars (~${estimateTokensRough(prompt)} tokens)`);

  let result;
  try {
    result = await complete(
      resolved.model,
      {
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: resolved.apiKey, maxTokens: Math.min(2048, resolved.model.maxTokens || 2048) }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("llm-tidy", `LLM call error: ${msg}`);
    return { error: msg };
  }

  if (!result || result.stopReason === "error") {
    const msg = result?.errorMessage || "LLM tidy failed";
    log("llm-tidy", `LLM returned error: ${msg}`);
    return { error: msg };
  }

  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  log("llm-tidy", `LLM response length: ${text.length} chars`);

  const plan = parseLlmTidyPlan(text);
  if (!plan) {
    log("llm-tidy", `parse failed, raw response: ${text.slice(0, 500)}`);
    return { error: "LLM output is not valid tidy JSON" };
  }

  log("llm-tidy", `plan parsed`, {
    removeLearnings: plan.removeLearningIds?.length || 0,
    removePreferences: plan.removePreferenceIds?.length || 0,
    rewriteLearnings: plan.rewriteLearnings?.length || 0,
    rewritePreferences: plan.rewritePreferences?.length || 0,
    addLearnings: plan.addLearnings?.length || 0,
    addPreferences: plan.addPreferences?.length || 0,
  });

  const apply = applyLlmTidyPlan(rolePath, roleName, plan);
  log("llm-tidy", `applied`, {
    L: `${apply.beforeLearnings}->${apply.afterLearnings}`,
    P: `${apply.beforePreferences}->${apply.afterPreferences}`,
    added: `${apply.addedLearnings}L ${apply.addedPreferences}P`,
    rewritten: `${apply.rewrittenLearnings}L ${apply.rewrittenPreferences}P`,
  });

  return { model: resolved.label, plan, apply };
}

// ============================================================================
// AUTO MEMORY EXTRACTION (aligned with pi branch-summarization algorithm)
// ============================================================================

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for a role-based coding assistant. Your task is to read a conversation and extract durable cross-session learnings and stable user preferences.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured JSON extraction.`;

/**
 * Estimate token count from text (rough heuristic: ~4 chars per token for mixed CJK/English).
 * Same approach as pi's compaction token estimation.
 */
function estimateTokensRough(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Prepare conversation text with token budget, selecting from newest to oldest.
 * Mirrors pi's `prepareBranchEntries()` approach:
 * - Walks messages from newest to oldest
 * - Estimates tokens per message
 * - Stops when budget is exceeded
 * - Serializes kept messages via `serializeConversation()`
 */
function prepareConversationWithBudget(
  messages: unknown[],
  reserveTokens: number,
  modelContextWindow?: number,
): string {
  const contextWindow = modelContextWindow || 128000;
  const tokenBudget = contextWindow - reserveTokens;

  const llmMessages = convertToLlm(messages as any);

  // Estimate tokens per message (content length / 4)
  const estimates = llmMessages.map((msg) => {
    const raw = Array.isArray(msg.content)
      ? msg.content.map((c: any) => c.text || c.thinking || JSON.stringify(c)).join("")
      : String(msg.content || "");
    return estimateTokensRough(raw);
  });

  // Walk from newest to oldest, accumulate until budget (like prepareBranchEntries)
  let totalTokens = 0;
  let startIndex = llmMessages.length;

  for (let i = llmMessages.length - 1; i >= 0; i--) {
    if (totalTokens + estimates[i] > tokenBudget) break;
    totalTokens += estimates[i];
    startIndex = i;
  }

  const kept = llmMessages.slice(startIndex);
  return serializeConversation(kept);
}

function buildAutoMemoryPrompt(conversationText: string, existing: { learnings: string[]; preferences: string[] }): string {
  const existingBlock = [...existing.learnings, ...existing.preferences].map((x) => `- ${x}`).join("\n") || "(none)";

  return `<conversation>
${conversationText}
</conversation>

<already-stored>
${existingBlock}
</already-stored>

Extract durable learnings and stable user preferences that remain useful across sessions.
Skip transient tasks, one-off requests, and generic facts.
Keep each item concise (under 120 chars).
Do not duplicate or restate items from <already-stored>.

Return strict JSON only:
{"learnings":[{"text":"..."}],"preferences":[{"category":"Communication|Code|Tools|Workflow|General","text":"..."}]}
If nothing new, return {"learnings":[],"preferences":[]}.`;
}

export async function runAutoMemoryExtraction(
  roleName: string,
  rolePath: string,
  ctx: ExtensionContext,
  messages: unknown[],
  options?: { enabled?: boolean; model?: string; maxItems?: number; maxText?: number; reserveTokens?: number }
): Promise<{ storedLearnings: number; storedPrefs: number } | null> {
  if (options?.enabled === false) return null;

  log("auto-extract", `start role=${roleName} messages=${messages.length} model=${options?.model || "(session)"}`);

  const resolved = await resolveRequestedModel(ctx, options?.model);
  if (!resolved) {
    log("auto-extract", "abort: no model resolved");
    return null;
  }

  log("auto-extract", `model: ${resolved.label} contextWindow=${resolved.model.contextWindow || "?"}`);

  // Token-budget message selection (newest first, like pi's prepareBranchEntries)
  const reserveTokens = options?.reserveTokens ?? 8192;
  const conversationText = prepareConversationWithBudget(
    messages,
    reserveTokens,
    resolved.model.contextWindow,
  );
  if (!conversationText.trim()) {
    log("auto-extract", "abort: empty conversation after budget preparation");
    return null;
  }

  log("auto-extract", `conversation: ${conversationText.length} chars (~${estimateTokensRough(conversationText)} tokens)`);

  const existing = extractMemoryFacts(rolePath, roleName);
  log("auto-extract", `existing memory: ${existing.learnings.length}L ${existing.preferences.length}P`);

  const prompt = buildAutoMemoryPrompt(conversationText, existing);
  log("auto-extract", `prompt total: ${prompt.length} chars (~${estimateTokensRough(prompt)} tokens)`);

  // Use completeSimple with system prompt (like pi's generateBranchSummary)
  let result;
  try {
    result = await completeSimple(
      resolved.model,
      {
        systemPrompt: MEMORY_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: resolved.apiKey, maxTokens: Math.min(512, resolved.model.maxTokens || 512) },
    );
  } catch (error) {
    log("auto-extract", `LLM call error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  if (!result || result.stopReason === "error") {
    log("auto-extract", `LLM returned error: ${(result as any)?.errorMessage || "unknown"}`);
    return null;
  }

  const responseText = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  log("auto-extract", `LLM response: ${responseText.length} chars`);

  const parsed = parseAutoMemoryResponse(responseText);
  if (!parsed) {
    log("auto-extract", `parse failed, raw: ${responseText.slice(0, 300)}`);
    return null;
  }

  log("auto-extract", `parsed: ${parsed.learnings?.length || 0} learnings, ${parsed.preferences?.length || 0} preferences`);

  const maxItems = options?.maxItems ?? 3;
  const maxText = options?.maxText ?? 200;

  let remaining = maxItems;
  let storedLearnings = 0;
  let storedPrefs = 0;

  for (const item of parsed.learnings || []) {
    if (remaining <= 0) break;
    const text = normalizeMemoryText(item.text || "");
    if (!text || text.length > maxText) continue;
    const stored = addRoleLearning(rolePath, roleName, text, { source: "auto", appendDaily: true });
    if (stored.stored) {
      log("auto-extract", `+learning: ${text}`);
      storedLearnings += 1;
      remaining -= 1;
    } else {
      log("auto-extract", `skip learning (${stored.reason}): ${text}`);
    }
  }

  for (const item of parsed.preferences || []) {
    if (remaining <= 0) break;
    const text = normalizeMemoryText(item.text || "");
    if (!text || text.length > maxText) continue;
    const stored = addRolePreference(rolePath, roleName, item.category || "General", text, { appendDaily: true });
    if (stored.stored) {
      log("auto-extract", `+preference [${stored.category}]: ${text}`);
      storedPrefs += 1;
      remaining -= 1;
    } else {
      log("auto-extract", `skip preference (${stored.reason}): ${text}`);
    }
  }

  log("auto-extract", `done: stored ${storedLearnings}L ${storedPrefs}P`);
  return { storedLearnings, storedPrefs };
}
