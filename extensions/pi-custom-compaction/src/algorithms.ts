import { complete } from "@earendil-works/pi-ai/compat";
import { compact, convertToLlm, serializeConversation, type CompactionResult, type SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { buildStructuredPrompt, getFileDetails, selectSummaryText } from "./structured.js";
import type { CustomCompactionConfig } from "./types.js";

export async function compactWithConfiguredAlgorithm(
  event: SessionBeforeCompactEvent,
  model: Parameters<typeof compact>[1],
  auth: { apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> },
  config: CustomCompactionConfig,
  memoryInstructions?: string,
): Promise<CompactionResult> {
  if (config.algorithm === "pi-default") {
    return compact(
      event.preparation,
      model,
      auth.apiKey,
      auth.headers,
      [event.customInstructions, memoryInstructions].filter(Boolean).join("\n\n") || undefined,
      event.signal,
      "off",
      undefined,
      auth.env,
    );
  }

  const messages = [...event.preparation.messagesToSummarize, ...event.preparation.turnPrefixMessages];
  const conversation = serializeConversation(convertToLlm(messages));
  const response = await complete(
    model,
    {
      systemPrompt: "You are a context checkpoint summarizer. Only output the requested Markdown checkpoint.",
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: buildStructuredPrompt(
            conversation,
            event.preparation.previousSummary,
            event.customInstructions,
            memoryInstructions,
          ),
        }],
        timestamp: Date.now(),
      }],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      env: auth.env,
      maxTokens: Math.min(config.maxSummaryTokens, model.maxTokens > 0 ? model.maxTokens : config.maxSummaryTokens),
      signal: event.signal,
    },
  );

  if (response.stopReason === "error") {
    throw new Error(`Structured compaction failed: ${response.errorMessage ?? "unknown error"}`);
  }

  const summary = selectSummaryText(response.content);
  if (!summary) {
    throw new Error("Structured compaction returned an empty summary");
  }

  const details = getFileDetails(event.preparation.fileOps);
  return {
    summary,
    firstKeptEntryId: event.preparation.firstKeptEntryId,
    tokensBefore: event.preparation.tokensBefore,
    details: {
      ...details,
      algorithm: "structured",
      model: `${model.provider}/${model.id}`,
    },
  };
}
