/** session_status tool — query current session's runtime status. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError } from "./helpers.ts";

export function createSessionStatusTool(gatewayUrl: string, internalToken: string) {
  return {
    name: "session_status",
    label: "Session Status",
    description:
      "Query the current session's runtime status: token usage, cost, model, context window utilization, and message count. " +
      "Useful for monitoring context budget, checking which model is active, or deciding when to compact.",
    parameters: Type.Object({
      sessionKey: Type.Optional(
        Type.String({ description: "Session key to query. Defaults to current session (PI_GATEWAY_SESSION_KEY)." }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { sessionKey } = params as { sessionKey?: string };
      const key = sessionKey || process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const qs = key ? `?sessionKey=${encodeURIComponent(key)}` : "";
        const res = await fetch(`${gatewayUrl}/api/session/status${qs}`, {
          headers: { Authorization: `Bearer ${internalToken}` },
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return toolError(String(data.error || res.statusText));
        }

        const stats = data.stats as Record<string, unknown> | undefined;
        const state = data.state as Record<string, unknown> | undefined;
        const model = state?.model as Record<string, unknown> | undefined;
        const tokens = stats?.tokens as Record<string, number> | undefined;
        const cost = stats?.cost as Record<string, number> | undefined;

        const fmt = (n: number) =>
          n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" :
          n >= 1_000 ? Math.round(n / 1_000) + "k" : String(n);

        const inputTokens = tokens?.input ?? 0;
        const outputTokens = tokens?.output ?? 0;
        const contextWindow = (model?.contextWindow as number) ?? 0;
        const pct = contextWindow > 0 ? ((inputTokens / contextWindow) * 100).toFixed(1) : "?";

        const lines = [
          `Model: ${model?.id ?? "unknown"}`,
          `Context: ${pct}% (${fmt(inputTokens)}/${fmt(contextWindow)})`,
          `Tokens: ${fmt(inputTokens)} in / ${fmt(outputTokens)} out`,
          `Cost: $${(cost?.total ?? 0).toFixed(4)}`,
          `Messages: ${data.messageCount ?? "?"}`,
          `Streaming: ${data.isStreaming ?? false}`,
        ];

        return toolOk(lines.join("\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(`session_status: ${message}`);
      }
    },
  };
}
