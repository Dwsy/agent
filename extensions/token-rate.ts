/**
 * Token Rate Status Extension
 *
 * Shows the average output tokens per second in the footer status line.
 * Uses the interval between streamed token updates; buffered responses show no rate.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MIN_MEASURABLE_GENERATION_MS = 100;

export function calculateTokenRate(outputTokens: number, generationMs: number): number | undefined {
  if (outputTokens <= 0 || generationMs < MIN_MEASURABLE_GENERATION_MS) return undefined;
  const tokensPerSecond = outputTokens / (generationMs / 1000);
  return Number.isFinite(tokensPerSecond) ? tokensPerSecond : undefined;
}

export default function (pi: ExtensionAPI) {
  const statusKey = "token-rate";

  // Per-message timing (only track last message)
  let firstTokenMs: number | null = null;
  let lastTokenMs: number | null = null;
  let lastOutputTokens = 0;
  let lastGenerationMs = 0;
  let lastCost = 0;

  // Current message accumulators
  let currentOutputTokens = 0;
  let currentInputTokens = 0;
  let currentCacheRead = 0;
  let currentCacheWrite = 0;
  let currentCost = 0;

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const reset = (ctx: { hasUI: boolean; ui: { theme: any; setStatus: (key: string, text?: string) => void } }) => {
    lastOutputTokens = 0;
    lastGenerationMs = 0;
    lastCost = 0;
    currentOutputTokens = 0;
    currentInputTokens = 0;
    currentCacheRead = 0;
    currentCacheWrite = 0;
    currentCost = 0;
    firstTokenMs = null;
    lastTokenMs = null;
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    ctx.ui.setStatus(statusKey, theme.fg("dim", "-- tok/s"));
  };

  const updateStatus = (ctx: { hasUI: boolean; ui: { theme: any; setStatus: (key: string, text?: string) => void } }) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    const tps = calculateTokenRate(lastOutputTokens, lastGenerationMs);
    if (tps === undefined) {
      ctx.ui.setStatus(statusKey, theme.fg("dim", "-- tok/s"));
      return;
    }
    const text = theme.fg("accent", `${tps.toFixed(1)} tok/s`);
    ctx.ui.setStatus(statusKey, text);
  };

  pi.on("session_start", async (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    reset(ctx);
  });

  // Mark when assistant message streaming starts
  pi.on("message_start", async (event, ctx) => {
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") return;
    firstTokenMs = null;
    lastTokenMs = null;
    updateStatus(ctx);
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;
    const eventType = event.assistantMessageEvent.type;
    if (!["text_delta", "thinking_delta", "toolcall_delta"].includes(eventType)) return;
    const now = performance.now();
    firstTokenMs ??= now;
    lastTokenMs = now;
  });

  // Accumulate stats when assistant message streaming ends
  pi.on("message_end", async (event, ctx) => {
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") {
      firstTokenMs = null;
      lastTokenMs = null;
      return;
    }

    lastGenerationMs = firstTokenMs !== null && lastTokenMs !== null
      ? Math.max(0, lastTokenMs - firstTokenMs)
      : 0;
    firstTokenMs = null;
    lastTokenMs = null;

    const outputTokens = message.usage?.output ?? 0;
    const inputTokens = message.usage?.input ?? 0;
    const cacheRead = message.usage?.cacheRead ?? 0;
    const cacheWrite = message.usage?.cacheWrite ?? 0;

    if (outputTokens > 0) {
      lastOutputTokens = outputTokens;
      currentOutputTokens = outputTokens;
      currentInputTokens = inputTokens;
      currentCacheRead = cacheRead;
      currentCacheWrite = cacheWrite;
    }

    // Extract cost from usage
    const cost = message.usage?.cost?.total ?? 0;
    if (cost > 0) {
      lastCost = cost;
      currentCost = cost;
    }

    updateStatus(ctx);
  });

  // Summary notification at agent end
  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (lastGenerationMs <= 0 || lastOutputTokens <= 0) return;
    const tps = calculateTokenRate(lastOutputTokens, lastGenerationMs);
    if (tps === undefined) return;
    const parts = [`${tps.toFixed(1)} tok/s`];
    if (lastCost > 0) parts.push(`Cost: $${lastCost.toFixed(4)}`);
    parts.push(`out ${formatTokens(lastOutputTokens)}, in ${formatTokens(currentInputTokens)}, cache r/w ${formatTokens(currentCacheRead)}/${formatTokens(currentCacheWrite)}`);
    ctx.ui.notify(parts.join(" | "), "info");
  });
}
