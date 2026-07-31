/**
 * Token Rate Status Extension
 *
 * Shows output tokens per second for the latest complete agent run.
 *
 * Timing model:
 *   - elapsed window = first agent_start -> agent_settled
 *   - output tokens = every assistant message's usage.output in that window
 *   - repeated agent_start events do not reset the window, so automatic retries,
 *     compaction retries, tool loops, and queued continuations are included
 *   - input and cache tokens are never included in the rate
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MIN_MEASURABLE_GENERATION_MS = 100;

export function calculateTokenRate(outputTokens: number, elapsedMs: number): number | undefined {
  if (outputTokens <= 0 || elapsedMs < MIN_MEASURABLE_GENERATION_MS) return undefined;
  const tokensPerSecond = outputTokens / (elapsedMs / 1000);
  return Number.isFinite(tokensPerSecond) ? tokensPerSecond : undefined;
}

type StatusContext = {
  hasUI: boolean;
  ui: { theme: any; setStatus: (key: string, text?: string) => void };
};

export default function (pi: ExtensionAPI) {
  const statusKey = "token-rate";

  let runStartMs: number | null = null;
  let runOutputTokens = 0;
  let runCost = 0;

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const reset = (ctx: StatusContext) => {
    runStartMs = null;
    runOutputTokens = 0;
    runCost = 0;
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("dim", "-- tok/s"));
  };

  pi.on("session_start", async (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    reset(ctx);
  });

  // Start one measurement window for the whole logical run. Automatic retries
  // emit another agent_start before agent_settled, so do not reset an active run.
  pi.on("agent_start", async (_event, ctx) => {
    if (runStartMs !== null) return;
    runStartMs = performance.now();
    runOutputTokens = 0;
    runCost = 0;
    if (ctx.hasUI) ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("dim", "-- tok/s"));
  });

  // usage.output already represents completion/output tokens only. Accumulating
  // finalized assistant messages captures reasoning, text, and tool-call output
  // across every LLM response in the run without counting any input tokens.
  pi.on("message_end", async (event) => {
    if (runStartMs === null) return;
    const message = event.message as AssistantMessage | undefined;
    if (!message || message.role !== "assistant") return;

    const outputTokens = message.usage?.output ?? 0;
    if (outputTokens > 0) runOutputTokens += outputTokens;

    const cost = message.usage?.cost?.total ?? 0;
    if (cost > 0) runCost += cost;
  });

  // agent_settled is the first point where Pi guarantees that no retry,
  // compaction retry, or queued continuation will extend this logical run.
  pi.on("agent_settled", async (_event, ctx) => {
    const elapsedMs = runStartMs === null ? 0 : Math.max(0, performance.now() - runStartMs);
    const outputTokens = runOutputTokens;
    const cost = runCost;
    runStartMs = null;
    runOutputTokens = 0;
    runCost = 0;

    if (!ctx.hasUI) return;
    const tps = calculateTokenRate(outputTokens, elapsedMs);
    if (tps === undefined) {
      ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("dim", "-- tok/s"));
      return;
    }

    ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("accent", `${tps.toFixed(1)} tok/s`));
    const parts = [`${tps.toFixed(1)} tok/s`];
    if (cost > 0) parts.push(`Cost: $${cost.toFixed(4)}`);
    parts.push(`out ${formatTokens(outputTokens)}`);
    ctx.ui.notify(parts.join(" | "), "info");
  });
}
