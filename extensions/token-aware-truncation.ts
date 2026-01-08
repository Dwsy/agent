/**
 * Token-Aware Truncation Extension
 *
 * Truncates large tool outputs to prevent context overflow.
 * Simplified version - uses static limits (no session token tracking).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Tools that benefit from truncation
const TRUNCATABLE_TOOLS = ["grep", "find", "ls"];

// Token estimation (conservative: 4 chars = 1 token)
const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_OUTPUT_TOKENS = 50_000;
const PRESERVE_HEADER_LINES = 3;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function truncateToTokenLimit(
  output: string,
  maxTokens: number,
  preserveLines: number = PRESERVE_HEADER_LINES
): string {
  const currentTokens = estimateTokens(output);

  if (currentTokens <= maxTokens) {
    return output;
  }

  const lines = output.split("\n");

  // Preserve header lines
  const headerLines = lines.slice(0, preserveLines);
  const remainingLines = lines.slice(preserveLines);

  // Calculate available tokens for content
  const headerTokens = estimateTokens(headerLines.join("\n"));
  const truncationMsgTokens = 50;
  const availableTokens = maxTokens - headerTokens - truncationMsgTokens;

  if (availableTokens <= 0) {
    return `${headerLines.join("\n")}\n\n[Output truncated - limit reached]`;
  }

  // Accumulate lines until we hit the limit
  const resultLines: string[] = [];
  let usedTokens = 0;
  let truncatedCount = 0;

  for (const line of remainingLines) {
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens > availableTokens) {
      truncatedCount = remainingLines.length - resultLines.length;
      break;
    }
    resultLines.push(line);
    usedTokens += lineTokens;
  }

  if (truncatedCount === 0) {
    return output;
  }

  return [
    ...headerLines,
    ...resultLines,
    "",
    `[${truncatedCount} more lines truncated]`,
  ].join("\n");
}

export default function(api: ExtensionAPI) {
  api.on("tool_result", async (event) => {
    if (!TRUNCATABLE_TOOLS.includes(event.toolName)) {
      return undefined;
    }

    const textContent = event.content.find((c) => c.type === "text");
    if (!textContent || !("text" in textContent)) {
      return undefined;
    }

    const output = textContent.text;
    const currentTokens = estimateTokens(output);

    if (currentTokens > DEFAULT_MAX_OUTPUT_TOKENS) {
      const truncated = truncateToTokenLimit(output, DEFAULT_MAX_OUTPUT_TOKENS);
      return {
        content: [
          ...event.content.filter((c) => c !== textContent),
          { type: "text" as const, text: truncated },
        ],
      };
    }

    return undefined;
  });
}