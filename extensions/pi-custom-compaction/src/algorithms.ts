import { complete } from "@earendil-works/pi-ai/compat";
import { compact, convertToLlm, serializeConversation, type CompactionResult, type SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { appendFileDetails, buildStructuredPrompt, getFileDetails, mergeFileDetails, selectSummaryText } from "./structured.js";
import type { CustomCompactionConfig } from "./types.js";

function withCumulativeFileDetails(
  result: CompactionResult,
  event: SessionBeforeCompactEvent,
): CompactionResult {
  const details = mergeFileDetails(getFileDetails(event.preparation.fileOps), event.preparation.previousSummary);
  const extraDetails = result.details && typeof result.details === "object" ? result.details : {};
  return {
    ...result,
    summary: appendFileDetails(result.summary, details),
    details: { ...extraDetails, ...details },
  };
}

export async function compactWithConfiguredAlgorithm(
  event: SessionBeforeCompactEvent,
  model: Parameters<typeof compact>[1],
  auth: { apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> },
  config: CustomCompactionConfig,
  memoryInstructions?: string,
): Promise<CompactionResult> {
  if (config.algorithm === "pi-default") {
    const result = await compact(
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
    return withCumulativeFileDetails(result, event);
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

  const result: CompactionResult = {
    summary,
    firstKeptEntryId: event.preparation.firstKeptEntryId,
    tokensBefore: event.preparation.tokensBefore,
    details: {
      ...getFileDetails(event.preparation.fileOps),
      algorithm: "structured",
      model: `${model.provider}/${model.id}`,
    },
  };
  return withCumulativeFileDetails(result, event);
}
