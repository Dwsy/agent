/**
 * Layer 2: Cron Protocol Segment
 *
 * Injected when cron is enabled.
 */

import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

export class CronSegment extends BaseSegment {
  readonly id = "cron";
  readonly name = "Cron Protocol";
  readonly priority = SegmentPriority.CRON;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    if (flags?.cron !== undefined) return flags.cron;
    return true;
  }

  protected buildContent(
    _config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    const protocol = this.protocolBlocks({
      important: "Cron engine supports scheduled automation via tool-driven job lifecycle.",
      instruction: `Cron task handling:
- Prefer cron tool for CRUD/run
- Execute injected shell tasks directly with bash
- Return per-task status (✅ ⚠️ ❌)
- Include HEARTBEAT_OK only when all injected tasks pass`,
      conditions: `Schedule kinds:
- cron expression
- interval duration
- one-shot datetime`,
      avoid: `Avoid:
- Describing commands without running them
- Hiding failed task details`,
    });

    return this.section("Gateway: Scheduled Tasks", protocol);
  }
}
