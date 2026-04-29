import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { complete, completeSimple } from "@mariozechner/pi-ai";
import { config, type ModelSpec } from "./config.ts";

import {
  addRoleLearning,
  addRolePreference,
  applyLlmTidyPlan,
  extractMemoryFacts,
  readRoleMemory,
  type LlmTidyPlan,
} from "./memory-md.ts";
import {
  filterAutoExtractedLearnings,
  filterAutoExtractedPreferences,
  getDerivableMemoryReason,
  isEphemeralTaskObservation,
} from "./memory-extraction-rules.ts";
import { log, logStart, logEnd, logWarn, logError, setCurrentRole } from "./logger.ts";

type AutoMemoryResponse = {
  learnings?: Array<{ text?: string }>;
  preferences?: Array<{ text?: string; category?: string }>;
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
function extractResponseText(result: { content: Array<{ type: string; text?: string; thinking?: string }> }): string {
  const parts: string[] = [];

  // First: thinking blocks (reasoning process)
  for (const block of result.content) {
    if (block.type === "thinking" && block.thinking) {
      parts.push(block.thinking);
    }
  }

  // Then: text blocks (actual answer)
  for (const block of result.content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }

  let text = parts.join("\n").trim();

  // Strip `` tag pairs that some thinking models emit as inline text
  // Common variants: <think>...</think>, <think>...</think>, <think>...</think>
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  return text;
}

function extractJsonObject(text: string): string | null {
  let trimmed = text.trim();

  // 剥离 <think>...</think> 标签（thinking models 的思考过程）
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 剥离 markdown 代码块（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }

  // 尝试提取 JSON 对象
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

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for a role-based coding assistant. Your task is to read a conversation and extract durable cross-session learnings and stable user preferences.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured JSON extraction.

Hard exclusion rule: if an item can be derived from the current repository state, do not store it as memory. That includes code structure, file paths, filenames, config keys, environment variables, logs, error messages, test failures, commit/PR/Issue facts, and anything that can be rediscovered from code, files, config, or git history.`;

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
Hard exclusion: do not extract anything that is directly derivable from the repo state, including file paths, filenames, config/env keys, log snippets, error codes, test failures, code structure facts, or git/PR/Issue history.
Only keep information that is cross-session, non-derivable, and still useful in future conversations.
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
  options?: { enabled?: boolean; model?: string | string[]; maxItems?: number; maxText?: number; reserveTokens?: number }
): Promise<{ storedLearnings: number; storedPrefs: number } | null> {
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

    log("auto-extract", `parsed from ${resolved.label}: ${parsed.learnings?.length || 0} learnings, ${parsed.preferences?.length || 0} preferences`);

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
    let storedLearnings = 0;
    let storedPrefs = 0;

    for (const text of filteredLearnings) {
      if (remaining <= 0) break;
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

    for (const item of filteredPreferences) {
      if (remaining <= 0) break;
      const text = item.text;
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

    logEnd(totalScope, `done`, {
      model: resolved.label,
      storedL: storedLearnings,
      storedP: storedPrefs,
      parsedL: parsed.learnings?.length || 0,
      parsedP: parsed.preferences?.length || 0,
      filteredL: filteredLearnings.length,
      filteredP: filteredPreferences.length,
    });
    return { storedLearnings, storedPrefs };
  }

  logError("auto-extract", `all models failed`, { lastError: lastError?.slice(0, 300) });
  logEnd(totalScope, "failed: all models exhausted");
  return null;
}
