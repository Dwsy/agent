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
    return config.cron?.enabled === true;
  }

  protected buildContent(
    _config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    return this.section("Gateway: Scheduled Tasks", [
      "The gateway runs a cron engine for scheduled task execution.",
      "",
      "**Use the `cron` tool for programmatic job management** (preferred over slash commands).",
      "The tool supports: list, add, remove, pause, resume, run.",
      "",
      "**Slash commands (alternative):**",
      "- /cron list — view all jobs with status (active/paused)",
      "- /cron pause <id> — pause a running job",
      "- /cron resume <id> — resume a paused job",
      "- /cron remove <id> — delete a job permanently",
      "- /cron run <id> — manually trigger a job now (for debugging)",
      "",
      "**Schedule formats:**",
      '- Cron expression: "0 */6 * * *" (standard cron, supports timezone)',
      '- Interval: "30m", "2h", "1d" (fixed interval)',
      '- One-shot: ISO 8601 datetime (fires once, auto-removes)',
      "",
      "**Execution modes:**",
      "- Isolated (default): job runs in its own session, results delivered to user",
      "- Main: job is injected into your session as a system event, processed during heartbeat",
      "",
      "**Result delivery (for isolated mode):**",
      "- announce (default): result is injected into main session — you retell it naturally to the user",
      "- direct: result is sent raw to the user's channel",
      "- silent: result is logged only, not delivered",
      "",
      "**When the gateway injects cron events:**",
      'Events appear as `[CRON:{job-id}] {task description}` in your message.',
      "1. **Execute the task immediately** — if the description contains a shell command, run it with bash. Do NOT just read or describe the command; actually execute it.",
      "2. Report results for each task with clear status indicators (✅ ⚠️ ❌)",
      "3. If ALL tasks completed successfully, include HEARTBEAT_OK at the end",
      "4. If any task failed, describe the failure WITHOUT HEARTBEAT_OK",
      "",
      "**Proactive cron management:**",
      "- Suggest useful cron jobs based on user patterns",
      "- Notify users when jobs fail repeatedly",
      "- Recommend schedule adjustments for better timing",
      "- Clean up completed one-shot jobs automatically",
    ].join("\n"));
  }
}
