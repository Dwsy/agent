import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";

import {
  addRoleLearning,
  addRolePreference,
  applyLlmTidyPlan,
  extractMemoryFacts,
  readRoleMemory,
  type LlmTidyPlan,
} from "./memory-md.ts";

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
  const resolved = await resolveRequestedModel(ctx, requestedModel);
  if (!resolved) {
    return {
      error: requestedModel ? `Model not found or unauthorized: ${requestedModel}` : "No active model/api key available",
    };
  }

  const prompt = buildLlmTidyPrompt(rolePath, roleName);

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
    return { error: error instanceof Error ? error.message : String(error) };
  }

  if (!result || result.stopReason === "error") {
    return { error: result?.errorMessage || "LLM tidy failed" };
  }

  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  const plan = parseLlmTidyPlan(text);
  if (!plan) {
    return { error: "LLM output is not valid tidy JSON" };
  }

  const apply = applyLlmTidyPlan(rolePath, roleName, plan);
  return { model: resolved.label, plan, apply };
}

function buildAutoMemoryPrompt(conversationText: string, existing: { learnings: string[]; preferences: string[] }): string {
  const existingMemories = [...existing.learnings, ...existing.preferences].map((x) => `- ${x}`).join("\n");

  return [
    "You are a memory extraction system for a role-based coding assistant.",
    "Extract durable learnings and stable user preferences that remain useful across sessions.",
    "Skip transient tasks, one-off requests, and generic facts.",
    "Keep each item concise (under 120 chars).",
    "",
    "ALREADY STORED MEMORY (do not duplicate or restate):",
    existingMemories || "(none)",
    "",
    "Return strict JSON only:",
    '{"learnings":[{"text":"..."}],"preferences":[{"category":"Communication|Code|Tools|Workflow|General","text":"..."}]}',
    'If nothing new, return {"learnings":[],"preferences":[]}.',
    "",
    "Conversation:",
    conversationText,
  ].join("\n");
}

export async function runAutoMemoryExtraction(
  roleName: string,
  rolePath: string,
  ctx: ExtensionContext,
  messages: unknown[],
  options?: { enabled?: boolean; maxItems?: number; maxText?: number }
): Promise<{ storedLearnings: number; storedPrefs: number } | null> {
  if (options?.enabled === false) return null;
  if (!ctx.model) return null;

  const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
  if (!apiKey) return null;

  const conversationText = serializeConversation(convertToLlm(messages as any));
  if (!conversationText.trim()) return null;

  const existing = extractMemoryFacts(rolePath, roleName);
  const prompt = buildAutoMemoryPrompt(conversationText, existing);

  let result;
  try {
    result = await complete(
      ctx.model,
      {
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey, maxTokens: Math.min(512, ctx.model.maxTokens || 512) }
    );
  } catch {
    return null;
  }

  if (!result || result.stopReason === "error") return null;

  const responseText = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  const parsed = parseAutoMemoryResponse(responseText);
  if (!parsed) return null;

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
      storedLearnings += 1;
      remaining -= 1;
    }
  }

  for (const item of parsed.preferences || []) {
    if (remaining <= 0) break;
    const text = normalizeMemoryText(item.text || "");
    if (!text || text.length > maxText) continue;
    const stored = addRolePreference(rolePath, roleName, item.category || "General", text, { appendDaily: true });
    if (stored.stored) {
      storedPrefs += 1;
      remaining -= 1;
    }
  }

  return { storedLearnings, storedPrefs };
}
