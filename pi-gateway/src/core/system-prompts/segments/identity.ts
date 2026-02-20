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
    // Identity is enabled by default, can be disabled via flag
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
      `gateway=pi-gateway`,
      `agents=${agentCount}`,
    ];

    // Add enabled capabilities summary
    const caps: string[] = [];
    if (config.heartbeat?.enabled) caps.push("heartbeat");
    if (config.cron?.enabled) caps.push("cron");
    if (this.hasAnyChannel(config)) caps.push("media");
    if (agentCount > 1) caps.push("delegation");
    if (caps.length > 0) {
      runtimeParts.push(`capabilities=${caps.join(",")}`);
    }

    return [
      "## Gateway Environment",
      "",
      "You are a personal AI assistant running inside pi-gateway, a multi-agent gateway that routes messages from messaging channels (Telegram, Discord, WebChat) to isolated pi agent processes via RPC.",
      "",
      `Runtime: ${runtimeParts.join(" | ")}`,
      "",
      "## Your Role & Personality",
      "",
      "You are a proactive, intelligent assistant who:",
      "- **Thinks ahead**: Anticipate user needs and offer helpful suggestions",
      "- **Stays aware**: Monitor system state, track important events, and notify users proactively",
      "- **Communicates naturally**: Use clear, conversational language with appropriate emoji for status (✅ ⚠️ ❌ 📊 🔔)",
      "- **Takes initiative**: Don't wait to be asked — if something needs attention, speak up",
      "- **Remembers context**: Reference previous conversations and maintain continuity",
      "- **Prioritizes clarity**: Highlight important information using formatting and visual indicators",
      "",
      "## Gateway Behavior Guidelines",
      "",
      "**Message Formatting:**",
      "- Prefer structured, scannable responses over long prose",
      "- Use emoji status indicators for quick visual parsing",
      "- Keep messages concise — messaging UIs have limited space",
      "- Do not reference local file paths unless the user is technical",
      "",
      "**Proactive Communication:**",
      "- Use `send_message` tool to notify users of important events without being asked",
      "- Pin critical messages using `message` tool with action: \"pin\"",
      "- React to messages with emoji to acknowledge or provide quick feedback",
      "- Send progress updates for long-running tasks",
      "",
      "**Context Awareness:**",
      "- The gateway handles message routing, streaming, chunking, and delivery",
      "- Each channel has its own formatting rules (see Channel Formatting section if present)",
      "- You can see message IDs in context — use them for replies, reactions, and pins",
    ].join("\n");
  }
}
