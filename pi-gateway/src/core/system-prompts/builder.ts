/**
 * System Prompt Builder
 *
 * Implements Builder Pattern for constructing the final system prompt.
 * Provides fine-grained control over the build process.
 */

import type {
  Config,
  GatewayIdentityContext,
  PromptFeatureFlags,
  BuildResult,
  BuilderOptions,
  ISystemPromptSegment,
} from "./types.ts";
import { registry } from "./registry.ts";

/**
 * Default builder options
 */
const DEFAULT_OPTIONS: BuilderOptions = {
  skipEmpty: true,
  joinString: "\n\n",
  debug: false,
};

/**
 * System Prompt Builder
 */
export class SystemPromptBuilder {
  private options: BuilderOptions;
  private segments: ISystemPromptSegment[] = [];
  private included: string[] = [];
  private skipped: string[] = [];

  constructor(options: BuilderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add a segment to the builder
   */
  addSegment(segment: ISystemPromptSegment): this {
    this.segments.push(segment);
    return this;
  }

  /**
   * Add multiple segments
   */
  addSegments(segments: ISystemPromptSegment[]): this {
    this.segments.push(...segments);
    return this;
  }

  /**
   * Build from registry (default behavior)
   */
  fromRegistry(): this {
    this.segments = registry.getAll();
    return this;
  }

  /**
   * Build the final prompt
   */
  build(
    config: Config,
    context?: GatewayIdentityContext,
    flags?: PromptFeatureFlags,
  ): BuildResult {
    this.included = [];
    this.skipped = [];

    // Sort segments by priority
    const sorted = [...this.segments].sort((a, b) => a.priority - b.priority);

    // Build each segment
    const parts: string[] = [];

    for (const segment of sorted) {
      // Check if segment should be included
      const shouldInclude = segment.shouldInclude(config, flags);

      if (!shouldInclude) {
        this.skipped.push(segment.id);
        if (this.options.debug) {
          console.log(`[SystemPromptBuilder] Skipped: ${segment.name} (${segment.id})`);
        }
        continue;
      }

      // Build the segment content
      const content = segment.build(config, context);

      if (this.options.skipEmpty && (!content || content.trim().length === 0)) {
        this.skipped.push(segment.id);
        continue;
      }

      parts.push(content!);
      this.included.push(segment.id);

      if (this.options.debug) {
        console.log(`[SystemPromptBuilder] Included: ${segment.name} (${segment.id})`);
      }
    }

    // Join all parts
    const prompt = parts.length > 0 ? parts.join(this.options.joinString) : null;

    return {
      prompt,
      includedSegments: this.included,
      skippedSegments: this.skipped,
      charCount: prompt?.length ?? 0,
      estimatedTokens: this.estimateTokens(prompt),
    };
  }

  /**
   * Quick build (convenience method)
   */
  static quickBuild(
    config: Config,
    context?: GatewayIdentityContext,
    flags?: PromptFeatureFlags,
    options?: BuilderOptions,
  ): string | null {
    const builder = new SystemPromptBuilder(options);
    const result = builder.fromRegistry().build(config, context, flags);
    return result.prompt;
  }

  /**
   * Estimate token count (rough approximation)
   * Uses 4 chars per token as a rough estimate
   */
  private estimateTokens(text: string | null): number {
    if (!text) return 0;
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Convenience function for building system prompt
 */
export function buildGatewaySystemPrompt(
  config: Config,
  context?: GatewayIdentityContext,
  flags?: PromptFeatureFlags,
): string | null {
  return SystemPromptBuilder.quickBuild(config, context, flags);
}

/**
 * Build with detailed metadata
 */
export function buildGatewaySystemPromptWithMetadata(
  config: Config,
  context?: GatewayIdentityContext,
  flags?: PromptFeatureFlags,
): BuildResult {
  const builder = new SystemPromptBuilder();
  return builder.fromRegistry().build(config, context, flags);
}
