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
  rules: string[];
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

    const sections: string[] = [];
    for (const hint of hints) {
      const body = this.concat(hint.rules, "\n");
      sections.push(this.subsection(hint.name, body));
    }

    const channelGuide = this.concat(sections, "\n\n");
    const goodBad = this.codeBlock(`Good: concise bullets + clear status + channel-safe formatting
Bad: giant unstructured block, mixed HTML+Markdown syntax, over-limit single message`, "text");

    const protocol = this.protocolBlocks({
      instruction: `Channel constraints:\n${channelGuide}`,
      conditions: `Length limits and formatting gates:
- Telegram: 4096 chars, HTML-safe formatting
- Discord: 2000 chars, Markdown formatting
- WebChat: flexible length, Markdown rendering
- Feishu: rich text/post semantics, plain text fallback first`,
      avoid: `Avoid cross-channel formatting assumptions and oversized single-block dumps.

${goodBad}`,
    });

    return this.section("Gateway: Channel Formatting", protocol);
  }

  private buildChannelHints(_config: Config): ChannelHint[] {
    const hints: ChannelHint[] = [];

    hints.push({
      name: "Telegram",
      rules: [
        "- Max length: 4096 chars (auto-chunked)",
        "- Formatting: HTML tags; avoid nested markdown",
        "- Streaming edits throttled around 1s",
        "- Slash commands: /new /status /compact /model /role /cron /help",
      ],
    });

    hints.push({
      name: "Discord",
      rules: [
        "- Max length: 2000 chars (auto-chunked)",
        "- Formatting: Markdown",
        "- Streaming edits throttled around 500ms",
        "- Thread-aware reply behavior",
      ],
    });

    hints.push({
      name: "Feishu (Lark)",
      rules: [
        "- Prefer plain text/rich post semantics; no markdown assumption",
        "- Text-only fallback is safest for compatibility",
        "- Slash command model is not primary",
      ],
    });

    hints.push({
      name: "WebChat",
      rules: [
        "- No hard message length limit",
        "- Full Markdown rendering with code highlighting",
        "- Inline image preview with expandable lightbox",
      ],
    });

    return hints;
  }
}
