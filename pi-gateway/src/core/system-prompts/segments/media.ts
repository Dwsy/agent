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
    return this.section("Gateway: Media & Message Tools", [
      "**`send_message` tool** — proactively send messages to notify users.",
      "",
      "**When to use (PROACTIVE scenarios):**",
      "- ✅ Task completion notifications (\"Backup completed successfully\")",
      "- ⚠️ Important status changes or warnings (\"Disk usage exceeded 90%\")",
      "- 📊 Scheduled reports or summaries (\"Daily report ready\")",
      "- 🔔 Time-sensitive alerts (cron job results, system events)",
      "- 💡 Helpful suggestions or reminders based on context",
      "- 🔄 Multi-step progress updates for long-running tasks",
      "",
      "**Examples:**",
      this.codeBlock(`send_message({ text: "⚠️ Disk usage exceeded 90% on /data" })
send_message({ text: "✅ Backup completed successfully (2.3GB)" })
send_message({ text: "📊 Daily report ready", replyTo: "123456" })
send_message({ text: "🔔 Reminder: Meeting in 15 minutes" })`, "typescript"),
      "",
      "**Guidelines:**",
      "- Use clear status indicators (✅ ⚠️ ❌ 📊 🔔 💡 🔄)",
      "- Keep messages concise and actionable",
      "- Include context when replying to specific messages",
      "- Don't spam — only send when genuinely important",
      "",
      "**`send_media` tool** — send files to the user.",
      "The tool delivers media directly to the chat and returns a confirmation with messageId.",
      "",
      this.codeBlock(`send_media({ path: "./output.png" })
send_media({ path: "./report.pdf", caption: "Monthly report" })
send_media({ path: "./recording.mp3", type: "audio" })`, "typescript"),
      "",
      "**Type inference by extension (send_media):**",
      "- Photo: jpg, jpeg, png, gif, webp, bmp",
      "- Audio: mp3, ogg, wav, m4a, flac",
      "- Video: mp4, webm, mov, avi",
      "- Document: pdf, txt, csv, zip, and all other extensions",
      "",
      "**Rules:**",
      "- Path can be relative to workspace (./output.png) or absolute temp path (/tmp/xxx.png, /var/folders/...)",
      "- Type is auto-detected from extension; override with the `type` parameter if needed",
      "- Optional `caption` parameter adds text alongside the media",
      "- SVG files are NOT supported as images on Telegram — convert to PNG first",
      "- Telegram image formats: jpg, jpeg, png, gif, webp, bmp",
      "",
      "**Fallback: MEDIA: directive** (used when send_media tool is unavailable)",
      "Write on a separate line: MEDIA:<relative-path>",
      "Example: MEDIA:./output.png",
      "",
      "**Blocked paths (security):**",
      "- Sensitive system paths: /etc/passwd, ~/.ssh ❌",
      "- Directory traversal: ../../secret ❌",
      "- URL schemes: file://, data:, javascript: ❌",
      "- Null bytes and symlinks outside workspace ❌",
      "",
      "**`message` tool** — perform actions on existing messages.",
      "Use the messageId from previous send_message or send_media results, or from context like [msgId:123].",
      "",
      this.codeBlock(`message({ action: "react", messageId: "123", emoji: "👍" })
message({ action: "react", messageId: "123", emoji: ["👍", "❤️"] })
message({ action: "react", messageId: "123", emoji: "👍", remove: true })
message({ action: "edit", messageId: "123", text: "Updated text" })
message({ action: "delete", messageId: "123" })
message({ action: "pin", messageId: "123" })
message({ action: "unpin", messageId: "123" })`, "typescript"),
      "",
      "**Actions:**",
      "- react: Add or remove emoji reactions. Supports single emoji or array. Use for quick acknowledgment.",
      "- edit: Replace message text. Gateway handles format conversion per channel.",
      "- delete: Remove a message permanently.",
      "- pin: Pin a message to the top of the chat (Telegram groups/channels). Use for critical info.",
      "- unpin: Unpin a previously pinned message.",
      "",
      "**When to pin (PROACTIVE scenarios):**",
      "- 🚨 Critical alerts or warnings that need persistent visibility",
      "- 📌 Important announcements or status updates",
      "- 📋 Reference information for ongoing discussions",
      "- ✅ Task summaries or action items that should stay visible",
      "",
      "**Notes:**",
      "- Not all channels support all actions (unsupported returns an error)",
      "- messageId must come from a previous tool result or context — do not fabricate IDs",
      "- Pin/unpin primarily works on Telegram; other channels may not support it",
    ].join("\n"));
  }
}
