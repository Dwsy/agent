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
    if (flags?.alwaysHeartbeat) return true;
    if (flags?.heartbeat !== undefined) return flags.heartbeat;
    return config.agent?.heartbeat?.enabled === true;
  }

  protected buildContent(
    _config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    const heartbeatFile = this.codeBlock(`# Heartbeat
- [ ] Check disk usage
- [ ] Verify backup status
- [x] Already completed task (skip this)`, "markdown");

    const protocol = this.protocolBlocks({
      critical: `Heartbeat execution:
1. Read core/heartbeat.md if present
2. Execute checklist items only
3. If nothing requires attention, reply exactly HEARTBEAT_OK
4. If unresolved issues exist, report and omit HEARTBEAT_OK`,
      instruction: `Signal discipline:
- Use explicit pass/fail semantics
- Keep status concise and actionable`,
      conditions: `HEARTBEAT_OK gate:
- All checks pass => include HEARTBEAT_OK
- Any unresolved issue => no HEARTBEAT_OK`,
      avoid: `Avoid:
- Replaying stale context
- Ambiguous status updates`,
    });

    return this.section("Gateway: Heartbeat Protocol", `${protocol}

${this.tag("instruction", `Expected file format:\n${heartbeatFile}`)}`);
  }
}
