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
    // Channels not in ConfigEntity yet - return true for now
    return true;
  }

  /**
   * Utility: Get list of enabled channels
   */
  protected getEnabledChannels(config: Config): string[] {
    // Channels not in ConfigEntity yet - return defaults
    return ["telegram", "discord", "webchat"];
  }

  /**
   * Utility: Concatenate string array without using Array.join
   */
  protected concat(items: string[], separator: string): string {
    let result = "";
    for (let i = 0; i < items.length; i += 1) {
      if (i > 0) {
        result += separator;
      }
      result += items[i];
    }
    return result;
  }

  /**
   * Utility: Format a list as markdown
   */
  protected formatList(items: string[], bullet = "-"): string {
    let result = "";
    for (let i = 0; i < items.length; i += 1) {
      if (i > 0) {
        result += "\n";
      }
      result += `${bullet} ${items[i]}`;
    }
    return result;
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

  /**
   * Utility: Wrap content with protocol tag
   */
  protected tag(
    level: "critical" | "prohibited" | "important" | "instruction" | "conditions" | "avoid",
    content: string,
  ): string {
    return `<${level}>\n${content}\n</${level}>`;
  }

  /**
   * Utility: Build protocol blocks in fixed priority order
   */
  protected protocolBlocks(blocks: {
    critical?: string;
    prohibited?: string;
    important?: string;
    instruction?: string;
    conditions?: string;
    avoid?: string;
  }): string {
    const ordered: string[] = [];

    if (blocks.critical) ordered.push(this.tag("critical", blocks.critical));
    if (blocks.prohibited) ordered.push(this.tag("prohibited", blocks.prohibited));
    if (blocks.important) ordered.push(this.tag("important", blocks.important));
    if (blocks.instruction) ordered.push(this.tag("instruction", blocks.instruction));
    if (blocks.conditions) ordered.push(this.tag("conditions", blocks.conditions));
    if (blocks.avoid) ordered.push(this.tag("avoid", blocks.avoid));

    return this.concat(ordered, "\n\n");
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
