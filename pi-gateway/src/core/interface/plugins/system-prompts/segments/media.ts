/**
 * Layer 2: Media & Message Tools Segment
 *
 * Injected when any channel is enabled.
 */

import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

export class MediaSegment extends BaseSegment {
  readonly id = "media";
  readonly name = "Media & Message Tools";
  readonly priority = SegmentPriority.MEDIA;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    if (flags?.media !== undefined) return flags.media;
    return this.hasAnyChannel(config);
  }

  protected buildContent(
    _config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    const sendMessageExamples = this.codeBlock(`send_message({ text: "⚠️ Disk usage exceeded 90% on /data" })
send_message({ text: "✅ Backup completed successfully (2.3GB)" })`, "typescript");

    const sendMediaExamples = this.codeBlock(`send_media({ path: "./output.png" })
send_media({ path: "./report.pdf", caption: "Monthly report" })`, "typescript");

    const messageExamples = this.codeBlock(`message({ action: "react", messageId: "123", emoji: "👍" })
message({ action: "pin", messageId: "123" })`, "typescript");

    const protocol = this.protocolBlocks({
      critical: `Tool contract:
- send_message: proactive text notifications
- send_media: file delivery
- message: react/edit/delete/pin/unpin on known IDs
- Never fabricate message IDs`,
      prohibited: `Blocked paths:
- Sensitive system paths
- Traversal paths
- URL schemes (file://, data:, javascript:)
- Null-byte/symlink escapes`,
      instruction: `Examples:\n${sendMessageExamples}\n\n${sendMediaExamples}\n\n${messageExamples}`,
      conditions: "Fallback MEDIA:<path> directive is only for environments without send_media tool.",
      avoid: "Avoid noisy notifications and unsupported media formats without conversion.",
    });

    return this.section("Gateway: Media & Message Tools", protocol);
  }
}
