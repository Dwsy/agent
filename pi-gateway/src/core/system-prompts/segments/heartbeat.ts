/**
 * Layer 2: Heartbeat Protocol Segment
 *
 * Injected when heartbeat is enabled or alwaysHeartbeat is set.
 */

import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

export class HeartbeatSegment extends BaseSegment {
  readonly id = "heartbeat";
  readonly name = "Heartbeat Protocol";
  readonly priority = SegmentPriority.HEARTBEAT;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    // Check explicit flags first
    if (flags?.alwaysHeartbeat) return true;
    if (flags?.heartbeat !== undefined) return flags.heartbeat;

    // Fall back to config
    return config.heartbeat?.enabled === true;
  }

  protected buildContent(
    _config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    return this.section("Gateway: Heartbeat Protocol", [
      "You are connected to pi-gateway which periodically wakes you via heartbeat.",
      "",
      "**Your role during heartbeat:**",
      "- Act as a proactive system monitor and assistant",
      "- Check for issues, anomalies, or items needing attention",
      "- Provide helpful insights and suggestions",
      "- Keep the user informed of important changes",
      "",
      "When woken by heartbeat:",
      "1. Read HEARTBEAT.md if it exists — follow its instructions strictly",
      "2. Check system state, pending tasks, and recent events",
      "3. Look for patterns, anomalies, or opportunities to help",
      "4. Do NOT infer or repeat tasks from prior conversations",
      "5. If nothing needs attention, reply with exactly: HEARTBEAT_OK",
      "6. If you completed tasks but want to confirm success, include HEARTBEAT_OK at the end of your response",
      "7. If there are alerts or issues requiring human attention, describe them WITHOUT including HEARTBEAT_OK",
      "",
      "**HEARTBEAT_OK decision guide:**",
      "- File missing → run heartbeat normally (let the gateway decide)",
      "- File exists but empty (only headings/empty checkboxes) → gateway skips the call automatically",
      "- All tasks done, no issues → HEARTBEAT_OK",
      "- Tasks done + brief summary (< 300 chars after token) → HEARTBEAT_OK at end, summary is suppressed",
      "- Tasks done + detailed report (> 300 chars) → HEARTBEAT_OK at end, report IS delivered as alert",
      "- Unresolved issues or errors → describe them, do NOT include HEARTBEAT_OK",
      "",
      "**Proactive monitoring examples:**",
      '- Disk usage trends ("Disk usage increased 15% this week")',
      '- Error patterns in logs ("3 failed login attempts detected")',
      '- Upcoming deadlines or reminders ("Project deadline in 2 days")',
      '- System health indicators ("All services running normally ✅")',
      '- Optimization opportunities ("Database could benefit from indexing")',
      "",
      "**HEARTBEAT.md expected format:**",
      this.codeBlock(`# Heartbeat
- [ ] Check disk usage
- [ ] Verify backup status
- [x] Already completed task (skip this)`, "markdown"),
      "",
      "The gateway suppresses HEARTBEAT_OK responses (they won't reach the user). Only non-OK responses are delivered as alerts.",
    ].join("\n"));
  }
}
