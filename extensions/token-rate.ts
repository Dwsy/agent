/**
 * Token Rate Status Extension
 *
 * Shows the average output tokens per second in the footer status line.
 *
 * Timing model (robust against buffering proxies):
 *   - decode window = first streaming delta -> message_end
 *   - message_end is agent-core's canonical "response complete" signal, so the
 *     window end is reliable even when a gateway coalesces the SSE stream.
 *   - a message whose window is below MIN_MEASURABLE_GENERATION_MS is skipped
 *     (an un-measurable/buffered stream contributes nothing instead of a bogus
 *     spike), and the footer reports the cumulative session average.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MIN_MEASURABLE_GENERATION_MS = 100;

export function calculateTokenRate(outputTokens: number, generationMs: number): number | undefined {
  if (outputTokens <= 0 || generationMs < MIN_MEASURABLE_GENERATION_MS) return undefined;
  const tokensPerSecond = outputTokens / (generationMs / 1000);
  return Number.isFinite(tokensPerSecond) ? tokensPerSecond : undefined;
}

type StatusContext = {
  hasUI: boolean;
  ui: { theme: any; setStatus: (key: string, text?: string) => void };
};

export default function (pi: ExtensionAPI) {
  const statusKey = "token-rate";

  // Cumulative session totals (drive the footer average and the summary).
  let sessionOutputTokens = 0;
  let sessionGenerationMs = 0;
  let sessionCost = 0;

  // Last measured turn's context size, for the agent_end breakdown.
  let lastInputTokens = 0;
  let lastCacheRead = 0;
  let lastCacheWrite = 0;

  // Per-message decode timing.
  let messageStartMs: number | null = null;
  let firstDeltaMs: number | null = null;

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const reset = (ctx: StatusContext) => {
    sessionOutputTokens = 0;
    sessionGenerationMs = 0;
    sessionCost = 0;
    lastInputTokens = 0;
    lastCacheRead = 0;
    lastCacheWrite = 0;
    messageStartMs = null;
    firstDeltaMs = null;
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("dim", "-- tok/s"));
  };

  const updateStatus = (ctx: StatusContext) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;
    const tps = calculateTokenRate(sessionOutputTokens, sessionGenerationMs);
    if (tps === undefined) {
      ctx.ui.setStatus(statusKey, theme.fg("dim", "-- tok/s"));
      return;
    }
    ctx.ui.setStatus(statusKey, theme.fg("accent", `${tps.toFixed(1)} tok/s`));
  };

  pi.on("session_start", async (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    reset(ctx);
  });

  // Mark the response start; the first delta below refines this to the decode start.
  pi.on("message_start", async (event, ctx) => {
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") return;
    messageStartMs = performance.now();
    firstDeltaMs = null;
    updateStatus(ctx);
  });

  // Decode starts at the first streamed delta (excludes prefill / time-to-first-token).
  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;
    const eventType = event.assistantMessageEvent.type;
    if (!["text_delta", "thinking_delta", "toolcall_delta"].includes(eventType)) return;
    firstDeltaMs ??= performance.now();
  });

  // Fold the finished message into the session average when it is measurable.
  pi.on("message_end", async (event, ctx) => {
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") {
      messageStartMs = null;
      firstDeltaMs = null;
      return;
    }

    const decodeStartMs = firstDeltaMs ?? messageStartMs;
    const generationMs = decodeStartMs !== null ? Math.max(0, performance.now() - decodeStartMs) : 0;
    messageStartMs = null;
    firstDeltaMs = null;

    const outputTokens = message.usage?.output ?? 0;
    if (outputTokens > 0 && generationMs >= MIN_MEASURABLE_GENERATION_MS) {
      sessionOutputTokens += outputTokens;
      sessionGenerationMs += generationMs;
    }
    if (outputTokens > 0) {
      lastInputTokens = message.usage?.input ?? 0;
      lastCacheRead = message.usage?.cacheRead ?? 0;
      lastCacheWrite = message.usage?.cacheWrite ?? 0;
    }

    const cost = message.usage?.cost?.total ?? 0;
    if (cost > 0) sessionCost += cost;

    updateStatus(ctx);
  });

  // Summary notification at agent end.
  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const tps = calculateTokenRate(sessionOutputTokens, sessionGenerationMs);
    if (tps === undefined) return;
    const parts = [`${tps.toFixed(1)} tok/s`];
    if (sessionCost > 0) parts.push(`Cost: $${sessionCost.toFixed(4)}`);
    parts.push(
      `out ${formatTokens(sessionOutputTokens)}, in ${formatTokens(lastInputTokens)}, cache r/w ${formatTokens(lastCacheRead)}/${formatTokens(lastCacheWrite)}`,
    );
    ctx.ui.notify(parts.join(" | "), "info");
  });
}
