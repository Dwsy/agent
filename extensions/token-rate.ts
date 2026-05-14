/**
 * Token Rate Status Extension
 *
 * Shows the average output tokens per second in the footer status line.
 * Uses message_start/message_end for precise per-message timing
 * (excludes tool execution pauses).
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const statusKey = "token-rate";

  // Per-message timing (only track last message)
  let messageStartMs: number | null = null;
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
    messageStartMs = null;
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    ctx.ui.setStatus(statusKey, theme.fg("dim", "TPS: --"));
  };

  const updateStatus = (ctx: { hasUI: boolean; ui: { theme: any; setStatus: (key: string, text?: string) => void } }) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    if (lastGenerationMs <= 0 || lastOutputTokens <= 0) {
      ctx.ui.setStatus(statusKey, theme.fg("dim", "TPS: --"));
      return;
    }
    const tps = lastOutputTokens / (lastGenerationMs / 1000);
    const value = Number.isFinite(tps) ? tps.toFixed(1) : "--";
    const text = theme.fg("dim", "TPS: ") + theme.fg("accent", `${value} tok/s`);
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
    messageStartMs = Date.now();
    updateStatus(ctx);
  });

  // Accumulate stats when assistant message streaming ends
  pi.on("message_end", async (event, ctx) => {
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") {
      messageStartMs = null;
      return;
    }

    if (messageStartMs !== null) {
      const elapsedMs = Date.now() - messageStartMs;
      if (elapsedMs > 0) {
        lastGenerationMs = elapsedMs;
      }
      messageStartMs = null;
    }

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
    const tps = lastOutputTokens / (lastGenerationMs / 1000);
    const value = Number.isFinite(tps) ? tps.toFixed(1) : "--";
    const parts = [`TPS ${value} tok/s`];
    if (lastCost > 0) parts.push(`Cost: $${lastCost.toFixed(4)}`);
    parts.push(`out ${formatTokens(lastOutputTokens)}, in ${formatTokens(currentInputTokens)}, cache r/w ${formatTokens(currentCacheRead)}/${formatTokens(currentCacheWrite)}`);
    ctx.ui.notify(parts.join(" | "), "info");
  });
}
