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

    const lines: string[] = [];
    for (const a of agents as Array<{ id: string; description?: string }>) {
      const desc = a.description ? ` — ${a.description}` : "";
      lines.push(`- ${a.id}${desc}`);
    }
    const list = this.concat(lines, "\n");

    const delegation = config.agent?.delegation;
    const timeout = delegation?.timeoutMs ?? 120000;
    const maxTimeout = delegation?.maxTimeoutMs ?? 600000;
    const maxDepth = delegation?.maxDepth ?? 1;
    const maxConcurrent = delegation?.maxConcurrent ?? 2;
    const onTimeout = delegation?.onTimeout ?? "abort";

    const protocol = this.protocolBlocks({
      important: `Available agents:\n${list}`,
      conditions: `Constraints:
- timeout=${Math.round(timeout / 1000)}s, max=${Math.round(maxTimeout / 1000)}s
- maxDepth=${maxDepth}
- maxConcurrent=${maxConcurrent}
- onTimeout=${onTimeout}`,
      instruction: `Delegation policy:
- Delegate focused, self-contained tasks only
- Provide complete context payload
- Wait for result before parent flow continues`,
      avoid: "Avoid deep delegation chains unless explicitly required.",
    });

    return this.section("Gateway: Agent Delegation", protocol);
  }
}
