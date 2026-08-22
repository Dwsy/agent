import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
// Import from the compat entrypoint explicitly: pi's extension loader currently
// aliases the pi-ai root to compat, but that alias is documented as temporary.
import { complete, completeSimple } from "@earendil-works/pi-ai/compat";
import { config, type ModelSpec } from "./config.ts";

import {
  addRoleLearning,
  addRolePreference,
  applyLlmTidyPlan,
  updateRoleLearning,
  updateRolePreference,
  extractMemoryFacts,
  readRoleMemory,
  readDailyMemoryRaw,
  writeDailySummary,
  listDailySummariesToGenerate,
  type LlmTidyPlan,
} from "./memory-md.ts";
import {
  filterAutoExtractedLearnings,
  filterAutoExtractedPreferences,
  getDerivableMemoryReason,
  isEphemeralTaskObservation,
} from "./memory-extraction-rules.ts";
import { log, logStart, logEnd, logWarn, logError, setCurrentRole } from "./logger.ts";

type AutoMemoryEdit = {
  type?: "learning" | "preference";
  id?: string;
  text?: string;
  category?: string;
};

type AutoMemoryOperation = {
  op: "learning" | "preference" | "update_learning" | "update_preference";
  content: string;
  previous?: string;
  id?: string;
  oldId?: string;
  category?: string;
  stored: boolean;
  detail?: string;
};

type AutoMemoryResponse = {
  learnings?: Array<{ text?: string }>;
  preferences?: Array<{ text?: string; category?: string }>;
  edits?: AutoMemoryEdit[];
};

function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Extract full text from model response, combining both text and thinking blocks.
 * Thinking models (Qwen thinking, stepfun, etc.) put reasoning in thinking blocks;
 * some also emit it as text. We merge them to ensure we don't miss content.
 * Also strips `` tag pairs that some thinking models emit inline.
 */
function stripThinkingMarkup(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, "")
    .trim();
}

/**
 * Prefer final text blocks. Only fall back to thinking when text is empty —
 * thinking models often dump long analysis without ever emitting the JSON.
 */
function extractResponseText(result: { content: Array<{ type: string; text?: string; thinking?: string }> }): string {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of result.content) {
    if (block.type === "text" && block.text) textParts.push(block.text);
    if (block.type === "thinking" && block.thinking) thinkingParts.push(block.thinking);
  }

  const textJoined = stripThinkingMarkup(textParts.join("\n"));
  const thinkingJoined = stripThinkingMarkup(thinkingParts.join("\n"));

  // Prefer the channel that actually contains a JSON object.
  if (textJoined.includes("{")) return textJoined;
  if (thinkingJoined.includes("{")) return thinkingJoined;
  return textJoined || thinkingJoined;
}

function extractJsonObject(text: string): string | null {
  let trimmed = stripThinkingMarkup(text.trim());

  // Prefer fenced json if present
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }

  // Drop common prose prefixes before the first object
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace > 0) trimmed = trimmed.slice(firstBrace);

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // Balanced-ish greedy object match (last resort)
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseAutoMemoryResponse(text: string): AutoMemoryResponse | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as AutoMemoryResponse;
    parsed.edits = Array.isArray(parsed.edits)
      ? parsed.edits.filter((edit) =>
          edit &&
          (edit.type === "learning" || edit.type === "preference") &&
          typeof edit.id === "string" &&
          typeof edit.text === "string"
        )
      : [];
    return parsed;
  } catch {
    return null;
  }
}

/** 解析单个模型字符串（格式：provider/model-id，只分割第一个 /） */
function parseModelString(spec: string): { provider: string; modelId: string } | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    // 没有 /，可能是纯 modelId
    return { provider: "", modelId: trimmed };
  }
  
  return {
    provider: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
  };
}

async function resolveRequestedModel(
  ctx: ExtensionContext,
  requested?: string | ModelSpec
): Promise<{ model: any; apiKey: string; label: string } | null> {
  // Defensive: check modelRegistry API
  const registry = ctx.modelRegistry as any;
  if (!registry || typeof registry.getApiKeyAndHeaders !== "function") {
    logWarn("model-resolve", "modelRegistry.getApiKeyAndHeaders not available");
    return null;
  }

  // 未指定时使用当前会话模型
  if (!requested) {
    if (!ctx.model) return null;
    const auth = await registry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) return null;
    return { model: ctx.model, apiKey: auth.apiKey, label: `${ctx.model.provider}/${ctx.model.id}` };
  }

  // 对象格式 { provider, model }
  if (typeof requested === "object") {
    const { provider, model: modelId } = requested;
    const all = (ctx.modelRegistry as any)?.getAll ? (ctx.modelRegistry as any).getAll() : [];
    const picked = all.find((m: any) => 
      m.provider?.toLowerCase() === provider.toLowerCase() &&
      m.id?.toLowerCase() === modelId.toLowerCase()
    );
    if (!picked) {
      log("model-resolve", `model not found: provider=${provider}, model=${modelId}`);
      return null;
    }
    const auth = await (ctx.modelRegistry as any).getApiKeyAndHeaders(picked);
    if (!auth.ok || !auth.apiKey) {
      log("model-resolve", `no API key for: ${provider}/${modelId}`);
      return null;
    }
    return { model: picked, apiKey: auth.apiKey, label: `${picked.provider}/${picked.id}` };
  }

  // 字符串格式 "provider/model-id"
  const parsed = parseModelString(requested);
  if (!parsed) return null;

  const { provider, modelId } = parsed;
  const all = (ctx.modelRegistry as any)?.getAll ? (ctx.modelRegistry as any).getAll() : [];
  
  // 匹配逻辑：provider/modelId 或纯 modelId
  const picked = all.find((m: any) => {
    if (provider) {
      // 有 provider，精确匹配 provider + modelId
      return m.provider?.toLowerCase() === provider.toLowerCase() &&
             m.id?.toLowerCase() === modelId.toLowerCase();
    } else {
      // 没有 provider，只匹配 modelId（支持 name 匹配）
      return m.id?.toLowerCase() === modelId.toLowerCase() ||
             m.name?.toLowerCase() === modelId.toLowerCase();
    }
  });

  if (!picked) return null;
  const auth = await (ctx.modelRegistry as any).getApiKeyAndHeaders(picked);
  if (!auth.ok || !auth.apiKey) return null;
  return { model: picked, apiKey: auth.apiKey, label: `${picked.provider}/${picked.id}` };
}

/** 将各种格式的模型配置标准化为 ModelSpec 数组 */
function normalizeModelSpecs(spec: string | string[] | ModelSpec[] | undefined): ModelSpec[] {
  if (!spec) return [];
  
  // 已经是对象数组
  if (Array.isArray(spec) && spec.length > 0 && typeof spec[0] === "object") {
    return spec as ModelSpec[];
  }
  
  // 字符串数组
  if (Array.isArray(spec)) {
    return (spec as string[])
      .map((s) => {
        const parsed = parseModelString(s);
        return parsed ? { provider: parsed.provider, model: parsed.modelId } : null;
      })
      .filter((s): s is ModelSpec => s !== null);
  }
  
  // 单个字符串
  const parsed = parseModelString(spec as string);
  return parsed ? [{ provider: parsed.provider, model: parsed.modelId }] : [];
}

/**
 * 解析模型配置，返回可用的模型列表（用于 fallback）
 * 按顺序尝试每个模型，跳过不可用的
 */
async function resolveModelsWithFallback(
  ctx: ExtensionContext,
  modelSpec?: string | string[] | ModelSpec[]
): Promise<Array<{ model: any; apiKey: string; label: string }>> {
  const registry = ctx.modelRegistry as any;
  if (!registry || typeof registry.getApiKeyAndHeaders !== "function") {
    logWarn("model-resolve", "modelRegistry.getApiKeyAndHeaders not available in resolveModelsWithFallback");
    return [];
  }

  // 如果未指定，使用当前会话模型
  if (!modelSpec) {
    if (!ctx.model) return [];
    const auth = await registry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) return [];
    return [{ model: ctx.model, apiKey: auth.apiKey, label: `${ctx.model.provider}/${ctx.model.id}` }];
  }

  const specs = normalizeModelSpecs(modelSpec);
  const results: Array<{ model: any; apiKey: string; label: string }> = [];

  for (const spec of specs) {
    const resolved = await resolveRequestedModel(ctx, spec);
    if (resolved) {
      results.push(resolved);
    } else {
      log("model-resolve", `model not available, skipping: ${spec.provider}/${spec.model}`);
    }
  }

  return results;
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
  requestedModel?: string | string[]
): Promise<
  | {
      model: string;
      plan: LlmTidyPlan;
      apply: ReturnType<typeof applyLlmTidyPlan>;
    }
  | { error: string }
> {
  setCurrentRole(roleName);
  const totalScope = logStart("llm-tidy", `start`, {
    role: roleName,
    models: Array.isArray(requestedModel) ? requestedModel.join("|") : requestedModel || "(session)",
  });

  // 获取可用模型列表（支持 fallback）
  const resolveStart = Date.now();
  const resolvedModels = await resolveModelsWithFallback(ctx, requestedModel);
  log("llm-tidy", `resolve models took ${Date.now() - resolveStart}ms`, { resolved: resolvedModels.length });
  if (resolvedModels.length === 0) {
    const err = requestedModel
      ? `No models available from: ${Array.isArray(requestedModel) ? requestedModel.join(", ") : requestedModel}`
      : "No active model/api key available";
    log("llm-tidy", `abort: ${err}`);
    return { error: err };
  }

  log("llm-tidy", `resolved ${resolvedModels.length} model(s): ${resolvedModels.map(m => m.label).join(", ")}`);
  const prompt = buildLlmTidyPrompt(rolePath, roleName);
  log("llm-tidy", `prompt length: ${prompt.length} chars (~${estimateTokensRough(prompt)} tokens)`);

  // 按顺序尝试模型，直到成功
  let lastError: string | null = null;
  for (let i = 0; i < resolvedModels.length; i++) {
    const resolved = resolvedModels[i];
    const isLastModel = i === resolvedModels.length - 1;

    log("llm-tidy", `trying model ${i + 1}/${resolvedModels.length}: ${resolved.label}`);

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
      lastError = error instanceof Error ? error.message : String(error);
      log("llm-tidy", `model ${resolved.label} call error: ${lastError}`);
      if (!isLastModel) {
        log("llm-tidy", `falling back to next model...`);
        continue;
      }
      return { error: lastError };
    }

    if (!result || result.stopReason === "error") {
      lastError = result?.errorMessage || "unknown error";
      log("llm-tidy", `model ${resolved.label} returned error: ${lastError}`);
      if (!isLastModel) {
        log("llm-tidy", `falling back to next model...`);
        continue;
      }
      return { error: lastError };
    }

    const text = extractResponseText(result);

    log("llm-tidy", `model ${resolved.label} response length: ${text.length} chars`);

    if (!text) {
      lastError = `Model ${resolved.label} returned empty response`;
      log("llm-tidy", lastError);
      if (!isLastModel) {
        log("llm-tidy", `falling back to next model...`);
        continue;
      }
      return { error: lastError };
    }

    const plan = parseLlmTidyPlan(text);
    if (!plan) {
      lastError = `Model ${resolved.label} output is not valid tidy JSON`;
      log("llm-tidy", `parse failed, raw response: ${text.slice(0, 500)}`);
      if (!isLastModel) {
        log("llm-tidy", `falling back to next model...`);
        continue;
      }
      return { error: lastError };
    }

    log("llm-tidy", `plan parsed from ${resolved.label}`, {
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

  log("llm-tidy", `all models failed, last error: ${lastError}`);
  return { error: lastError || "All models failed" };
}

// ============================================================================
// AUTO MEMORY EXTRACTION (aligned with pi branch-summarization algorithm)
// ============================================================================

const AUTO_MEMORY_RESPONSE_SCHEMA = '{"learnings":[{"text":"..."}],"preferences":[{"category":"Communication|Code|Tools|Workflow|General","text":"..."}],"edits":[{"type":"learning","id":"existing-learning-id","text":"replacement text"},{"type":"preference","id":"existing-preference-id","text":"replacement text","category":"Communication|Code|Tools|Workflow|General"}]}';

const AUTO_MEMORY_EMPTY_RESPONSE = '{"learnings":[],"preferences":[],"edits":[]}';

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are a JSON-only memory extractor for a role-based coding assistant.

You are NOT a chat assistant. You do NOT continue the conversation. You do NOT answer questions inside the conversation. You do NOT apologize or explain.

## OUTPUT CONTRACT (absolute — violation is failure)
1. Your entire reply is exactly ONE JSON object. Nothing else.
2. First non-whitespace character MUST be open brace { and last MUST be close brace }.
3. Forbidden anywhere in the reply: markdown fences, prose, headings, labels, XML/HTML, <think> tags, tool calls, or commentary before/after JSON.
4. All three keys are required every time. Arrays may be empty.
5. Schema:
${AUTO_MEMORY_RESPONSE_SCHEMA}
6. If nothing qualifies, output exactly this and stop:
${AUTO_MEMORY_EMPTY_RESPONSE}
7. "I found nothing" in natural language is INVALID. Empty arrays are the only valid empty result.
8. category MUST be one of: Communication | Code | Tools | Workflow | General.
9. Each text under 120 characters; one atomic fact per item; no duplicates within the same array.
10. For edits, type and id MUST refer to an item listed in <already-stored>; text is the complete replacement.

## INCLUDE only if ALL are true
- Useful in future sessions (durable), not only this turn
- Stable user preference OR non-obvious reusable learning
- Not already listed in <already-stored>, unless an existing item must be corrected or made more precise
- Cannot be rediscovered from the current repo/files/config/git
- Use edits only when the conversation clearly supersedes or corrects an existing preference/learning

## EXCLUDE always (hard)
- Anything derivable from repository state: code structure, file paths, filenames, config keys, env vars, logs, error messages, test failures, commit/PR/Issue/branch facts
- One-off task status ("fixed X", "merged PR", "tests passed")
- Generic advice, speculation, model self-talk, restating the conversation
- Restating items from <already-stored>

## Valid full-response examples
${AUTO_MEMORY_EMPTY_RESPONSE}
{"learnings":[{"text":"Prefer soft-delete for audit-critical records"}],"preferences":[{"category":"Workflow","text":"验证通过前不宣称已修好"}],"edits":[]}

Return JSON now. No other text.`;

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

function buildAutoMemoryPrompt(
  conversationText: string,
  existing: {
    learnings: Array<{ id: string; text: string }>;
    preferences: Array<{ id: string; category: string; text: string }>;
  }
): string {
  const existingBlock = [
    ...existing.learnings.map((item) => `- [learning:${item.id}] ${item.text}`),
    ...existing.preferences.map((item) => `- [preference:${item.id}] [${item.category}] ${item.text}`),
  ].join("\n") || "(none)";

  return `<conversation>
${conversationText}
</conversation>

<already-stored>
${existingBlock}
</already-stored>

Extract only NEW durable learnings and stable user preferences.
Skip transient tasks, one-off requests, generic facts, and anything already in <already-stored>.
If the conversation clearly corrects or supersedes an existing item, put a replacement in edits using its exact id; do not add a duplicate.
Only edit learning/preference items shown in <already-stored>. Do not edit based on task status.
Hard exclusion: do not extract repo-derivable facts (paths, filenames, config/env keys, logs, errors, test failures, code structure, git/PR/Issue history).

Respond with exactly one JSON object matching the schema. All three arrays required.
If nothing new qualifies, respond with exactly:
${AUTO_MEMORY_EMPTY_RESPONSE}

JSON only. Start with { and end with }. No markdown. No prose.`;
}

export async function runAutoMemoryExtraction(
  roleName: string,
  rolePath: string,
  ctx: ExtensionContext,
  messages: unknown[],
  options?: { enabled?: boolean; model?: string | string[] | ModelSpec[]; maxItems?: number; maxText?: number; reserveTokens?: number }
): Promise<{
  storedLearnings: number;
  storedPrefs: number;
  updatedLearnings: number;
  updatedPrefs: number;
  updatedItems: Array<{ type: "learning" | "preference"; id: string; oldId: string; text: string; category?: string }>;
  items: AutoMemoryOperation[];
} | null> {
  if (options?.enabled === false) return null;

  setCurrentRole(roleName);
  const totalScope = logStart("auto-extract", `start`, {
    role: roleName,
    msgCount: messages.length,
    models: Array.isArray(options?.model) ? options.model.join("|") : options?.model || config.autoMemory.model,
  });

  const modelSpec = options?.model ?? config.autoMemory.model;

  // 获取可用模型列表（支持 fallback）
  const resolveStart = Date.now();
  const resolvedModels = await resolveModelsWithFallback(ctx, modelSpec);
  log("auto-extract", `resolve models took ${Date.now() - resolveStart}ms`, {
    resolved: resolvedModels.length,
    labels: resolvedModels.map(m => m.label).join("|"),
  });
  if (resolvedModels.length === 0) {
    log("auto-extract", "abort: no models resolved");
    logEnd(totalScope, "abort: no models");
    return null;
  }

  // 使用第一个可用模型准备 prompt（contextWindow 可能不同，取最大）
  const maxContextWindow = Math.max(...resolvedModels.map(m => m.model.contextWindow || 128000));
  const reserveTokens = options?.reserveTokens ?? config.autoMemory.reserveTokens;
  const conversationText = prepareConversationWithBudget(messages, reserveTokens, maxContextWindow);

  if (!conversationText.trim()) {
    log("auto-extract", "abort: empty conversation after budget preparation");
    logEnd(totalScope, "abort: empty conversation");
    return null;
  }

  const convTokens = estimateTokensRough(conversationText);
  const existing = extractMemoryFacts(rolePath, roleName);
  const prompt = buildAutoMemoryPrompt(conversationText, existing);
  const promptTokens = estimateTokensRough(prompt);

  log("auto-extract", `prepared`, {
    convChars: conversationText.length,
    convTokens,
    promptChars: prompt.length,
    promptTokens,
    existingL: existing.learnings.length,
    existingP: existing.preferences.length,
  });

  // 按顺序尝试模型，直到成功
  let lastError: string | null = null;
  for (let i = 0; i < resolvedModels.length; i++) {
    const resolved = resolvedModels[i];
    const isLastModel = i === resolvedModels.length - 1;

    const modelScope = logStart("auto-extract", `model ${i + 1}/${resolvedModels.length}: ${resolved.label}`);

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
      lastError = error instanceof Error ? error.message : String(error);
      logEnd(modelScope, `call error`, { model: resolved.label, error: lastError?.slice(0, 200) });
      if (!isLastModel) {
        log("auto-extract", `falling back to next model...`);
        continue;
      }
      return null;
    }

    if (!result || result.stopReason === "error") {
      lastError = (result as any)?.errorMessage || "unknown error";
      logEnd(modelScope, `returned error`, { model: resolved.label, error: lastError?.slice(0, 200) });
      if (!isLastModel) {
        log("auto-extract", `falling back to next model...`);
        continue;
      }
      return null;
    }

    const responseText = extractResponseText(result);

    const responseTokens = estimateTokensRough(responseText);
    logEnd(modelScope, `response ok`, {
      model: resolved.label,
      respChars: responseText.length,
      respTokens: responseTokens,
    });

    const parsed = parseAutoMemoryResponse(responseText);
    if (!parsed) {
      logWarn("auto-extract", `parse failed`, {
        model: resolved.label,
        rawLen: responseText.length,
        raw: responseText.slice(0, 400),
      });
      if (!isLastModel) {
        log("auto-extract", `falling back to next model...`);
        continue;
      }
      return null;
    }

    log("auto-extract", `parsed from ${resolved.label}: ${parsed.learnings?.length || 0} learnings, ${parsed.preferences?.length || 0} preferences, ${parsed.edits?.length || 0} edits`);

    const rawLearnings = (parsed.learnings || []).map((item) => normalizeMemoryText(item.text || "")).filter(Boolean);
    const rawPreferences = (parsed.preferences || [])
      .map((item) => ({
        category: item.category || "General",
        text: normalizeMemoryText(item.text || ""),
      }))
      .filter((item) => item.text);

    // Phase 1: Filter derivable (file paths, git artifacts, env vars)
    const derivFilteredLearnings = filterAutoExtractedLearnings(rawLearnings);
    const derivFilteredPreferences = filterAutoExtractedPreferences(rawPreferences);

    // Phase 2: Filter ephemeral task observations (should go to daily, not consolidated)
    const filteredLearnings = derivFilteredLearnings.filter((text) => {
      if (isEphemeralTaskObservation(text)) {
        log("auto-extract", `drop ephemeral (task observation): ${text}`);
        return false;
      }
      return true;
    });
    const filteredPreferences = derivFilteredPreferences.filter((item) => {
      if (isEphemeralTaskObservation(item.text)) {
        log("auto-extract", `drop ephemeral preference (task observation): ${item.text}`);
        return false;
      }
      return true;
    });

    // Log drops for observability
    for (const item of parsed.learnings || []) {
      const text = normalizeMemoryText(item.text || "");
      const reason = getDerivableMemoryReason(text);
      if (text && reason) {
        log("auto-extract", `drop learning (${reason}): ${text}`);
      }
    }
    for (const item of parsed.preferences || []) {
      const text = normalizeMemoryText(item.text || "");
      const reason = getDerivableMemoryReason(text);
      if (text && reason) {
        log("auto-extract", `drop preference (${reason}): ${text}`);
      }
    }

    log("auto-extract", `filtered from ${resolved.label}: ${filteredLearnings.length} learnings, ${filteredPreferences.length} preferences`);

    const maxItems = options?.maxItems ?? config.autoMemory.maxItems;
    const maxText = options?.maxText ?? config.autoMemory.maxText;

    let remaining = maxItems;
    const editableLearningIds = new Set(existing.learnings.map((item) => item.id));
    const editablePreferenceIds = new Set(existing.preferences.map((item) => item.id));
    let updatedLearnings = 0;
    let updatedPrefs = 0;
    const updatedItems: Array<{ type: "learning" | "preference"; id: string; oldId: string; text: string; category?: string }> = [];
    const items: AutoMemoryOperation[] = [];
    let storedLearnings = 0;
    let storedPrefs = 0;

    for (const edit of parsed.edits || []) {
      if (remaining <= 0) break;
      const text = normalizeMemoryText(edit.text || "");
      if (!edit.id || !text || text.length > maxText) {
        items.push({
          op: edit.type === "preference" ? "update_preference" : "update_learning",
          content: text || edit.text || "",
          id: edit.id,
          stored: false,
          detail: "invalid or over maxText",
        });
        continue;
      }

      if (edit.type === "learning") {
        if (!editableLearningIds.has(edit.id)) {
          items.push({ op: "update_learning", content: text, id: edit.id, stored: false, detail: "unknown id" });
          log("auto-extract", `skip learning edit (unknown id): ${edit.id}`);
          continue;
        }
        if (filterAutoExtractedLearnings([text]).length === 0 || isEphemeralTaskObservation(text)) {
          items.push({ op: "update_learning", content: text, id: edit.id, stored: false, detail: "filtered" });
          log("auto-extract", `drop learning edit: ${text}`);
          continue;
        }
        const updated = updateRoleLearning(rolePath, roleName, edit.id, text);
        if (updated.updated) {
          updatedLearnings += 1;
          editableLearningIds.delete(edit.id);
          updatedItems.push({ type: "learning", id: updated.id!, oldId: updated.oldId!, text: updated.newText! });
          items.push({ op: "update_learning", content: updated.newText!, previous: updated.oldText, id: updated.id, oldId: updated.oldId, stored: true, detail: updated.reason });
          remaining -= 1;
          log("auto-extract", `~learning [${edit.id}]: ${text}`);
        } else {
          items.push({ op: "update_learning", content: text, id: edit.id, stored: false, detail: updated.reason || "not found" });
          log("auto-extract", `skip learning edit (${updated.reason || "not found"}): ${edit.id}`);
        }
        continue;
      }

      if (!editablePreferenceIds.has(edit.id)) {
        items.push({ op: "update_preference", content: text, id: edit.id, stored: false, detail: "unknown id" });
        log("auto-extract", `skip preference edit (unknown id): ${edit.id}`);
        continue;
      }
      const pref = filterAutoExtractedPreferences([{ category: edit.category || "General", text }])[0];
      if (!pref || isEphemeralTaskObservation(pref.text)) {
        items.push({ op: "update_preference", content: text, id: edit.id, stored: false, detail: "filtered" });
        log("auto-extract", `drop preference edit: ${text}`);
        continue;
      }
      const updated = updateRolePreference(
        rolePath,
        roleName,
        edit.id,
        pref.text,
        edit.category === undefined ? undefined : pref.category,
      );
      if (updated.updated) {
        updatedPrefs += 1;
        editablePreferenceIds.delete(edit.id);
        updatedItems.push({ type: "preference", id: updated.id!, oldId: updated.oldId!, text: updated.newText!, category: updated.category });
        items.push({ op: "update_preference", content: updated.newText!, previous: updated.oldText, id: updated.id, oldId: updated.oldId, category: updated.category, stored: true, detail: updated.reason });
        remaining -= 1;
        log("auto-extract", `~preference [${edit.id}]: ${pref.text}`);
      } else {
        items.push({ op: "update_preference", content: pref.text, id: edit.id, stored: false, detail: updated.reason || "not found" });
        log("auto-extract", `skip preference edit (${updated.reason || "not found"}): ${edit.id}`);
      }
    }

    for (const text of filteredLearnings) {
      if (remaining <= 0) break;
      if (!text || text.length > maxText) {
        items.push({ op: "learning", content: text, stored: false, detail: "empty or over maxText" });
        continue;
      }
      const stored = addRoleLearning(rolePath, roleName, text, { source: "auto", appendDaily: true });
      items.push({ op: "learning", content: text, id: stored.id, stored: stored.stored, detail: stored.reason });
      if (stored.stored) {
        log("auto-extract", `+learning: ${text}`);
        storedLearnings += 1;
        remaining -= 1;
      } else {
        log("auto-extract", `skip learning (${stored.reason}): ${text}`);
      }
    }

    for (const item of filteredPreferences) {
      if (remaining <= 0) break;
      const text = item.text;
      if (!text || text.length > maxText) {
        items.push({ op: "preference", content: text, category: item.category, stored: false, detail: "empty or over maxText" });
        continue;
      }
      const stored = addRolePreference(rolePath, roleName, item.category || "General", text, { appendDaily: true });
      items.push({ op: "preference", content: text, id: stored.id, category: stored.category, stored: stored.stored, detail: stored.reason });
      if (stored.stored) {
        log("auto-extract", `+preference [${stored.category}]: ${text}`);
        storedPrefs += 1;
        remaining -= 1;
      } else {
        log("auto-extract", `skip preference (${stored.reason}): ${text}`);
      }
    }

    logEnd(totalScope, `done`, {
      model: resolved.label,
      storedL: storedLearnings,
      storedP: storedPrefs,
      updatedL: updatedLearnings,
      updatedP: updatedPrefs,
      parsedL: parsed.learnings?.length || 0,
      parsedP: parsed.preferences?.length || 0,
      filteredL: filteredLearnings.length,
      filteredP: filteredPreferences.length,
    });
    return { storedLearnings, storedPrefs, updatedLearnings, updatedPrefs, updatedItems, items };
  }

  logError("auto-extract", `all models failed`, { lastError: lastError?.slice(0, 300) });
  logEnd(totalScope, "failed: all models exhausted");
  return null;
}

// ============================================================================
// Daily Memory Summary Generation
// ============================================================================

const DAILY_SUMMARY_SYSTEM_PROMPT = [
  "You compress a single day's role memory log into a structured, dense markdown summary.",
  "Goal: preserve durable signal (decisions, learnings, preferences, key events) while dropping noise.",
  "",
  "Rules:",
  "1) Output markdown only. No prose preamble, no JSON, no code fences.",
  "2) Use the exact section headings below. Omit a section entirely if empty.",
  "3) Each bullet must be a single concise line (<140 chars). Merge near-duplicates.",
  "4) Drop ephemeral task chatter, transient errors, and timestamps.",
  "5) Keep concrete facts: file paths, commands, decisions, user preferences, broken assumptions.",
  "6) Preserve the user's voice for preferences/constraints.",
  "7) Target total length: 10-40 bullets across all sections.",
  "",
  "Output format:",
  "# Summary: {DATE}",
  "",
  "## Learnings",
  "- ...",
  "",
  "## Preferences",
  "- [Category] ...",
  "",
  "## Events",
  "- ...",
  "",
  "## Decisions",
  "- ...",
].join("\n");

function buildDailySummaryPrompt(date: string, dailyContent: string): string {
  return [
    `Date: ${date}`,
    "",
    "Raw daily memory log:",
    "<<<",
    dailyContent.trim(),
    ">>>",
    "",
    `Produce the structured summary now. Replace {DATE} in the heading with ${date}.`,
  ].join("\n");
}

function cleanSummaryOutput(text: string, date: string): string {
  let out = text.trim();
  const fenced = out.match(/^```(?:markdown|md)?\s*([\s\S]*?)```\s*$/i);
  if (fenced) out = fenced[1].trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!/^#\s+Summary:/i.test(out)) {
    out = `# Summary: ${date}\n\n${out}`;
  }
  return out;
}

/**
 * Generate summary for a single day's daily memory via LLM.
 * Returns true if summary was written, false otherwise.
 */
export async function generateDailySummaryForDate(
  ctx: ExtensionContext,
  rolePath: string,
  date: string,
): Promise<boolean> {
  const raw = readDailyMemoryRaw(rolePath, date);
  if (!raw || !raw.trim()) {
    log("daily-summary", `skip ${date}: empty daily file`);
    return false;
  }

  const resolvedModels = await resolveModelsWithFallback(ctx, config.autoMemory.model);
  if (resolvedModels.length === 0) {
    logWarn("daily-summary", `no available model for ${date}`);
    return false;
  }

  const prompt = buildDailySummaryPrompt(date, raw);

  let lastError: string | null = null;
  for (let i = 0; i < resolvedModels.length; i++) {
    const resolved = resolvedModels[i];
    const isLast = i === resolvedModels.length - 1;
    const scope = logStart("daily-summary", `${date} via ${resolved.label}`);

    let result;
    try {
      result = await completeSimple(
        resolved.model,
        {
          systemPrompt: DAILY_SUMMARY_SYSTEM_PROMPT,
          messages: [
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        { apiKey: resolved.apiKey, maxTokens: Math.min(1024, resolved.model.maxTokens || 1024) },
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logEnd(scope, `call error`, { error: lastError?.slice(0, 200) });
      if (!isLast) continue;
      return false;
    }

    if (!result || result.stopReason === "error") {
      lastError = (result as any)?.errorMessage || "unknown error";
      logEnd(scope, `returned error`, { error: lastError?.slice(0, 200) });
      if (!isLast) continue;
      return false;
    }

    const responseText = extractResponseText(result);
    const cleaned = cleanSummaryOutput(responseText, date);
    if (!cleaned || cleaned.length < 20) {
      logEnd(scope, `summary too short`, { len: cleaned.length });
      if (!isLast) continue;
      return false;
    }

    try {
      writeDailySummary(rolePath, date, cleaned);
      logEnd(scope, `wrote summary`, { chars: cleaned.length });
      return true;
    } catch (err) {
      logError("daily-summary", `write failed for ${date}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  logError("daily-summary", `all models failed for ${date}`, { lastError: lastError?.slice(0, 300) });
  return false;
}

/**
 * Generate any missing daily summaries within the configured injection window.
 * Awaits each generation sequentially so the caller can block startup if desired.
 */
export async function ensureDailySummaries(
  ctx: ExtensionContext,
  rolePath: string,
): Promise<{ generated: number; failed: number; skipped: boolean }> {
  const cfg = config.memory.dailySummary;
  if (!cfg.enabled || !cfg.autoGenerate) {
    return { generated: 0, failed: 0, skipped: true };
  }

  const dates = listDailySummariesToGenerate(rolePath, cfg.recentDays);
  if (dates.length === 0) {
    return { generated: 0, failed: 0, skipped: false };
  }

  log("daily-summary", `generating ${dates.length} missing summaries`, { dates });

  let generated = 0;
  let failed = 0;
  for (const date of dates) {
    const ok = await generateDailySummaryForDate(ctx, rolePath, date);
    if (ok) generated += 1;
    else failed += 1;
  }

  log("daily-summary", `done`, { generated, failed });
  return { generated, failed, skipped: false };
}
