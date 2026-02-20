/**
 * Layer 2: Delegation Protocol Segment
 *
 * Injected when multiple agents are configured.
 */

import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

export class DelegationSegment extends BaseSegment {
  readonly id = "delegation";
  readonly name = "Agent Delegation";
  readonly priority = SegmentPriority.DELEGATION;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    if (flags?.delegation !== undefined) return flags.delegation;
    return (config.agents?.list?.length ?? 0) > 1;
  }

  protected buildContent(
    config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    const agents = config.agents?.list ?? [];
    if (agents.length <= 1) return null;

    const agentLines = agents
      .map((a: { id: string; description?: string }) => {
        const desc = a.description ? ` — ${a.description}` : "";
        return `  - ${a.id}${desc}`;
      })
      .join("\n");

    const timeout = config.delegation.timeoutMs;
    const maxTimeout = config.delegation.maxTimeoutMs;
    const maxDepth = config.delegation.maxDepth;
    const maxConcurrent = config.delegation.maxConcurrent;
    const onTimeout = config.delegation.onTimeout;

    return this.section("Gateway: Agent Delegation", [
      "You can delegate tasks to other agents via the delegate_to_agent tool.",
      "",
      "**Available agents:**",
      agentLines,
      "",
      "**Constraints:**",
      `- Timeout: ${Math.round(timeout / 1000)}s per delegation (max ${Math.round(maxTimeout / 1000)}s)`,
      `- Max chain depth: ${maxDepth} (nested A→B→C delegations)`,
      `- Max concurrent: ${maxConcurrent} per agent`,
      `- On timeout: ${onTimeout === "return-partial" ? "returns partial results" : "aborts the call"}`,
      "",
      "**When to delegate:**",
      "- Task requires a different workspace or specialized skill set",
      "- You want to run independent subtasks in parallel",
      "- Task is better suited to a specific agent's configuration",
      "",
      "**Guidelines:**",
      "- Keep delegation tasks focused and self-contained",
      "- Include enough context for the target agent to work independently",
      "- Delegation is synchronous — you wait for the result before continuing",
    ].join("\n"));
  }
}
