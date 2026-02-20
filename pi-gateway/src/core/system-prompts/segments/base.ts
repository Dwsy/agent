/**
 * Base Segment - Abstract class for all system prompt segments
 *
 * Provides common functionality and enforces consistent structure.
 * Subclasses only need to implement: shouldInclude() and buildContent()
 */

import type {
  Config,
  ISystemPromptSegment,
  GatewayIdentityContext,
  PromptFeatureFlags,
} from "../types.ts";

/**
 * Abstract base class for system prompt segments
 * Implements Template Method pattern for consistent segment building
 */
export abstract class BaseSegment implements ISystemPromptSegment {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly priority: number;

  /**
   * Check if this segment should be included in the prompt
   * Subclasses must implement this
   */
  abstract shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean;

  /**
   * Build the actual content of this segment
   * Subclasses must implement this
   */
  protected abstract buildContent(
    config: Config,
    context?: GatewayIdentityContext,
  ): string | null;

  /**
   * Template method - builds the segment with optional wrapper
   * Subclasses can override wrap() to add custom formatting
   */
  build(config: Config, context?: GatewayIdentityContext): string | null {
    const content = this.buildContent(config, context);
    if (!content || content.trim().length === 0) {
      return null;
    }
    return this.wrap(content);
  }

  /**
   * Wrap the content with optional formatting
   * Override to add headers, footers, etc.
   */
  protected wrap(content: string): string {
    return content;
  }

  /**
   * Utility: Check if any channel is enabled
   */
  protected hasAnyChannel(config: Config): boolean {
    const channels = config.channels as Record<string, { enabled?: boolean }> | undefined;
    if (!channels) return false;

    return Object.values(channels).some(
      (ch) => ch && ch.enabled !== false,
    );
  }

  /**
   * Utility: Get list of enabled channels
   */
  protected getEnabledChannels(config: Config): string[] {
    const channels = config.channels as Record<string, { enabled?: boolean }> | undefined;
    if (!channels) return [];

    return Object.entries(channels)
      .filter(([, ch]) => ch && ch.enabled !== false)
      .map(([name]) => name);
  }

  /**
   * Utility: Format a list as markdown
   */
  protected formatList(items: string[], bullet = "-"): string {
    return items.map((item) => `${bullet} ${item}`).join("\n");
  }

  /**
   * Utility: Create a markdown section
   */
  protected section(title: string, content: string): string {
    return `## ${title}\n\n${content}`;
  }

  /**
   * Utility: Create a markdown subsection
   */
  protected subsection(title: string, content: string): string {
    return `### ${title}\n\n${content}`;
  }

  /**
   * Utility: Create a code block
   */
  protected codeBlock(code: string, lang = ""): string {
    return "```" + lang + "\n" + code + "\n```";
  }
}

/**
 * Static segment - content doesn't change based on config
 */
export abstract class StaticSegment extends BaseSegment {
  protected abstract readonly content: string;

  shouldInclude(): boolean {
    return true;
  }

  protected buildContent(): string | null {
    return this.content;
  }
}

/**
 * Conditional segment - inclusion depends on a feature flag
 */
export abstract class ConditionalSegment extends BaseSegment {
  protected abstract readonly featureFlag: keyof PromptFeatureFlags;
  protected abstract readonly configPath: string;

  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean {
    // Check explicit flag first
    const flagValue = flags?.[this.featureFlag];
    if (flagValue !== undefined) {
      return flagValue;
    }

    // Fall back to config check
    return this.checkConfig(config);
  }

  protected checkConfig(config: Config): boolean {
    const parts = this.configPath.split(".");
    let current: unknown = config;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current === true;
  }
}
