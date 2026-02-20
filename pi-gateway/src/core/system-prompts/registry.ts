/**
 * System Prompt Segment Registry
 *
 * Manages both built-in and plugin-provided segments.
 * Implements Registry Pattern for dynamic segment discovery.
 */

import type {
  Config,
  ISystemPromptSegment,
  PluginSystemPromptSegment,
  RegistryEntry,
} from "./types.ts";
import { getBuiltinSegments } from "./segments/index.ts";

/**
 * Segment Registry
 * Singleton pattern for global segment management
 */
export class SegmentRegistry {
  private static instance: SegmentRegistry;
  private entries = new Map<string, RegistryEntry>();
  private pluginSegments = new Map<string, PluginSystemPromptSegment>();

  private constructor() {
    this.registerBuiltins();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): SegmentRegistry {
    if (!SegmentRegistry.instance) {
      SegmentRegistry.instance = new SegmentRegistry();
    }
    return SegmentRegistry.instance;
  }

  /**
   * Reset the registry (mainly for testing)
   */
  static reset(): void {
    SegmentRegistry.instance = new SegmentRegistry();
  }

  // ========================================================================
  // Registration
  // ========================================================================

  /**
   * Register a built-in segment
   */
  register(segment: ISystemPromptSegment): void {
    this.entries.set(segment.id, {
      segment,
      source: "builtin",
    });
  }

  /**
   * Register a plugin-provided segment (legacy API)
   */
  registerPluginSegment(pluginSegment: PluginSystemPromptSegment): void {
    this.pluginSegments.set(pluginSegment.id, pluginSegment);
  }

  /**
   * Unregister a segment
   */
  unregister(id: string): boolean {
    return this.entries.delete(id) || this.pluginSegments.delete(id);
  }

  // ========================================================================
  // Queries
  // ========================================================================

  /**
   * Get a segment by ID
   */
  get(id: string): ISystemPromptSegment | undefined {
    const entry = this.entries.get(id);
    return entry?.segment;
  }

  /**
   * Check if a segment is registered
   */
  has(id: string): boolean {
    return this.entries.has(id) || this.pluginSegments.has(id);
  }

  /**
   * Get all registered segments
   */
  getAll(): ISystemPromptSegment[] {
    const builtinSegments = Array.from(this.entries.values()).map((e) => e.segment);
    const pluginSegments = Array.from(this.pluginSegments.values()).map(
      (ps) => new PluginSegmentAdapter(ps),
    );
    return [...builtinSegments, ...pluginSegments];
  }

  /**
   * Get segments that should be included for the given config
   */
  getActiveSegments(config: Config): ISystemPromptSegment[] {
    return this.getAll().filter((segment) => segment.shouldInclude(config));
  }

  /**
   * Get sorted segments (by priority)
   */
  getSortedSegments(config: Config): ISystemPromptSegment[] {
    return this.getActiveSegments(config).sort((a, b) => a.priority - b.priority);
  }

  // ========================================================================
  // Private
  // ========================================================================

  private registerBuiltins(): void {
    for (const segment of getBuiltinSegments()) {
      this.register(segment);
    }
  }
}

/**
 * Adapter to convert PluginSystemPromptSegment to ISystemPromptSegment
 */
class PluginSegmentAdapter implements ISystemPromptSegment {
  readonly id: string;
  readonly name: string;
  readonly priority: number;

  constructor(private pluginSegment: PluginSystemPromptSegment) {
    this.id = pluginSegment.id;
    this.name = pluginSegment.id;
    this.priority = pluginSegment.priority ?? 100;
  }

  shouldInclude(config: Config): boolean {
    return this.pluginSegment.shouldInclude(config);
  }

  build(): string | null {
    return this.pluginSegment.segment;
  }
}

// ========================================================================
// Convenience exports
// ========================================================================

/**
 * Get the global registry instance
 */
export const registry = SegmentRegistry.getInstance();

/**
 * Register a segment (convenience function)
 */
export function registerSegment(segment: ISystemPromptSegment): void {
  registry.register(segment);
}

/**
 * Register a plugin segment (legacy API)
 */
export function registerSystemPromptSegment(segment: PluginSystemPromptSegment): void {
  registry.registerPluginSegment(segment);
}

/**
 * Get all active segments for a config
 */
export function getActiveSegments(config: Config): ISystemPromptSegment[] {
  return registry.getActiveSegments(config);
}
