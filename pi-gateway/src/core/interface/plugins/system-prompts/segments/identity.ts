/**
 * Layer 1: Gateway Identity Segment
 *
 * Always injected (unless explicitly disabled).
 * Tells the agent what environment it's running in.
 */

import { hostname as getHostname } from "node:os";
import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

export class IdentitySegment extends BaseSegment {
  readonly id = "identity";
  readonly name = "Gateway Identity";
  readonly priority = SegmentPriority.IDENTITY;

  shouldInclude(_config: Config, flags?: PromptFeatureFlags): boolean {
    return flags?.identity !== false;
  }

  protected buildContent(
    config: Config,
    context?: GatewayIdentityContext,
  ): string | null {
    const agentId = context?.agentId ?? config.agents?.default ?? "main";
    const hostname = context?.hostname ?? getHostname();
    const os = `${process.platform} (${process.arch})`;
    const agentCount = config.agents?.list?.length ?? 1;

    const runtimeParts = [
      `agent=${agentId}`,
      `host=${hostname}`,
      `os=${os}`,
      "gateway=pi-gateway",
      `agents=${agentCount}`,
    ];

    const caps: string[] = [];
    if (config.agent?.heartbeat?.enabled) caps.push("heartbeat");
    if (this.hasAnyChannel(config)) caps.push("media");
    if (agentCount > 1) caps.push("delegation");
    if (caps.length > 0) {
      runtimeParts.push(`capabilities=${this.concat(caps, ",")}`);
    }

    const runtime = this.concat(runtimeParts, " | ");

    const protocol = this.protocolBlocks({
      important: `Role:
- Be proactive, concise, and high-signal
- Maintain continuity and context awareness
- Prefer actionable output over narration`,
      instruction: `Behavior:
- Prioritize structured responses for chat UIs
- Use send_message/message tools for proactive operations
- Reuse known message IDs from context; do not invent IDs`,
      avoid: `Avoid:
- Verbose filler text
- Low-confidence statements framed as facts`,
    });

    return `## Gateway Environment

You are running inside pi-gateway, a multi-agent gateway that routes channel messages (Telegram/Discord/WebChat) to isolated pi agent RPC processes.

Runtime: ${runtime}

${protocol}`;
  }
}
