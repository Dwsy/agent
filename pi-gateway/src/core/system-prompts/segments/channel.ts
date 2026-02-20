/**
 * Layer 2: Channel-Specific Formatting Segment
 *
 * Injected when any channel is enabled.
 * Provides formatting hints for each enabled channel.
 */

import { BaseSegment } from "./base.ts";
import type { Config, GatewayIdentityContext, PromptFeatureFlags } from "../types.ts";
import { SegmentPriority } from "../types.ts";

interface ChannelHint {
  name: string;
  content: string[];
}

export class ChannelSegment extends BaseSegment {
  readonly id = "channel";
  readonly name = "Channel Formatting";
  readonly priority = SegmentPriority.CHANNEL;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    if (flags?.channel !== undefined) return flags.channel;
    return this.hasAnyChannel(config);
  }

  protected buildContent(
    config: Config,
    _context?: GatewayIdentityContext,
  ): string | null {
    const hints = this.buildChannelHints(config);
    if (hints.length === 0) return null;

    const hintSections = hints
      .map((h) => this.subsection(h.name, h.content.join("\n")))
      .join("\n\n");

    return this.section("Gateway: Channel Formatting", [
      "Your replies are delivered to messaging channels. Each has different formatting rules and limits.",
      "",
      hintSections,
      "",
      "General guidelines:",
      "- Keep replies concise — messaging UIs have limited space",
      "- Prefer structured output (lists, code blocks) over long paragraphs",
      "- Do not reference local file paths unless the user is technical",
    ].join("\n"));
  }

  private buildChannelHints(config: Config): ChannelHint[] {
    const hints: ChannelHint[] = [];
    const channels = config.channels as
      | Record<string, { enabled?: boolean }>
      | undefined;

    if (!channels) return hints;

    // Telegram
    if (channels.telegram?.enabled !== false) {
      hints.push({
        name: "Telegram",
        content: [
          "- Max message length: 4096 characters (auto-chunked if exceeded)",
          "- Formatting: HTML tags (bold, italic, code, pre, blockquote) — avoid nested markdown",
          "- Streaming: replies are edited in-place with ~1s throttle",
          "- Media: images/documents sent via MEDIA: directive; voice messages are transcribed before delivery",
          "- Slash commands: /new, /status, /compact, /model, /role, /cron, /help",
        ],
      });
    }

    // Discord
    if (channels.discord?.enabled !== false) {
      hints.push({
        name: "Discord",
        content: [
          "- Max message length: 2000 characters (auto-chunked if exceeded)",
          "- Formatting: standard Markdown (bold, italic, code blocks, blockquotes)",
          "- Streaming: replies edited with 500ms throttle, truncated at ~1800 chars during streaming",
          "- Threads: supported — replies stay in the originating thread",
          "- Slash commands: /new, /status, /compact, /model, /think, /stop, /help",
        ],
      });
    }

    // Feishu
    if (channels.feishu?.enabled !== false) {
      hints.push({
        name: "Feishu (Lark)",
        content: [
          "- Formatting: rich text (post) format — use plain text for now, no Markdown",
          "- Max message length: ~30000 characters per message (post type)",
          "- Media: not yet supported via channel — use send_media tool for file delivery",
          "- Interactive cards: future scope — currently text-only replies",
          "- Slash commands: not supported — use natural language commands",
          "- Note: Feishu WebSocket mode handles message dedup automatically",
        ],
      });
    }

    // WebChat is always available
    hints.push({
      name: "WebChat",
      content: [
        "- No hard message length limit",
        "- Formatting: full Markdown with syntax-highlighted code blocks",
        "- Media: images rendered inline with click-to-expand lightbox; non-images shown as download links",
        "- Sessions: users can create, switch, and delete sessions via sidebar",
      ],
    });

    return hints;
  }
}
