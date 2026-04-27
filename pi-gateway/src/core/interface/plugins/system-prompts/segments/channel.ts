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
  id: string;
  name: string;
  rules: string[];
  gate: string;
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
    context?: GatewayIdentityContext,
  ): string | null {
    const hints = this.buildChannelHints(config, context);
    if (hints.length === 0) return null;

    const sections: string[] = [];
    for (const hint of hints) {
      const body = this.concat(hint.rules, "\n");
      sections.push(this.subsection(hint.name, body));
    }

    const channelGuide = this.concat(sections, "\n\n");
    const gateLines = hints.map((hint) => hint.gate);
    const goodBad = this.codeBlock(`Good: concise bullets + clear status + channel-safe formatting
Bad: giant unstructured block, mixed HTML+Markdown syntax, over-limit single message`, "text");

    const protocol = this.protocolBlocks({
      instruction: `Channel constraints:\n${channelGuide}`,
      conditions: `Length limits and formatting gates:\n${this.concat(gateLines, "\n")}`,
      avoid: `Avoid cross-channel formatting assumptions and oversized single-block dumps.

${goodBad}`,
    });

    return this.section("Gateway: Channel Formatting", protocol);
  }

  private buildChannelHints(config: Config, context?: GatewayIdentityContext): ChannelHint[] {
    const allHints: ChannelHint[] = [
      {
        id: "telegram",
        name: "Telegram",
        rules: [
          "- Max length: 4096 chars (auto-chunked)",
          "- Formatting: HTML tags; avoid nested markdown",
          "- Streaming edits throttled around 1s",
          "- Slash commands: /new /status /compact /model /role /cron /help",
        ],
        gate: "- Telegram: 4096 chars, HTML-safe formatting",
      },
      {
        id: "discord",
        name: "Discord",
        rules: [
          "- Max length: 2000 chars (auto-chunked)",
          "- Formatting: Markdown",
          "- Streaming edits throttled around 500ms",
          "- Thread-aware reply behavior",
        ],
        gate: "- Discord: 2000 chars, Markdown formatting",
      },
      {
        id: "feishu",
        name: "Feishu (Lark)",
        rules: [
          "- Prefer plain text/rich post semantics; no markdown assumption",
          "- Text-only fallback is safest for compatibility",
          "- Slash command model is not primary",
        ],
        gate: "- Feishu: rich text/post semantics, plain text fallback first",
      },
      {
        id: "webchat",
        name: "WebChat",
        rules: [
          "- No hard message length limit",
          "- Full Markdown rendering with code highlighting",
          "- Inline image preview with expandable lightbox",
        ],
        gate: "- WebChat: flexible length, Markdown rendering",
      },
      {
        id: "wechat",
        name: "WeChat",
        rules: [
          "- 手机端优先：使用短句和短段落，不要输出大段文字墙",
          "- 只用纯文本表达，不要使用 Markdown 语法",
          "- 不要使用 HTML 语法、标签或实体",
          "- 需要分点时使用 1）2）3） 这种纯文本编号，不要用代码块、表格、标题",
          "- 长任务或耗时操作时，应主动同步任务进度，不要长时间沉默等待",
        ],
        gate: "- WeChat: mobile-first plain text only, short paragraphs, no Markdown/HTML, long tasks should send progress updates",
      },
    ];

    const targetChannel = context?.channel?.trim().toLowerCase();
    if (targetChannel) {
      return allHints.filter((hint) => hint.id === targetChannel);
    }

    const configuredChannels = new Set(
      Object.entries(config.channels ?? {})
        .filter(([, channelConfig]) => channelConfig && (channelConfig as { enabled?: boolean }).enabled !== false)
        .map(([channelId]) => channelId.toLowerCase()),
    );

    if (configuredChannels.size === 0) {
      return allHints;
    }

    return allHints.filter((hint) => configuredChannels.has(hint.id));
  }
}
