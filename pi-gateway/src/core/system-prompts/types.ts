/**
 * System Prompts Architecture - Type Definitions
 *
 * Design Patterns:
 * - Strategy Pattern: Each segment is a strategy for generating prompt content
 * - Registry Pattern: Segments register themselves dynamically
 * - Builder Pattern: SystemPromptBuilder assembles the final prompt
 */

import type { Config } from "../config.ts";

// ============================================================================
// Core Types
// ============================================================================

/**
 * Context for building gateway identity (Layer 1)
 */
export interface GatewayIdentityContext {
  agentId?: string;
  hostname?: string;
}

/**
 * Priority levels for segment ordering
 * Higher values appear later in the prompt
 */
export enum SegmentPriority {
  IDENTITY = 0,      // Layer 1: Always first
  HEARTBEAT = 10,    // Layer 2: Core capabilities
  CRON = 20,
  MEDIA = 30,
  DELEGATION = 40,
  CHANNEL = 50,
  PLUGIN = 100,      // Plugins come last
}

/**
 * Feature flags for controlling segment inclusion
 */
export interface PromptFeatureFlags {
  identity?: boolean;
  heartbeat?: boolean;
  alwaysHeartbeat?: boolean;
  cron?: boolean;
  media?: boolean;
  delegation?: boolean;
  channel?: boolean;
}

// ============================================================================
// Segment Interface (Strategy Pattern)
// ============================================================================

/**
 * System prompt segment interface
 * Implement this to create a new segment
 */
export interface ISystemPromptSegment {
  /** Unique identifier */
  readonly id: string;

  /** Display name for debugging */
  readonly name: string;

  /** Priority for ordering */
  readonly priority: number;

  /**
   * Determine if this segment should be included
   * @param config - Gateway configuration
   * @param flags - Feature flags override
   */
  shouldInclude(config: Config, flags?: PromptFeatureFlags): boolean;

  /**
   * Build the segment content
   * @param config - Gateway configuration
   * @param context - Optional identity context
   * @returns The prompt segment string, or null if empty
   */
  build(config: Config, context?: GatewayIdentityContext): string | null;
}

/**
 * Segment constructor type
 */
export type SegmentConstructor = new () => ISystemPromptSegment;

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Plugin-provided segment (legacy support)
 */
export interface PluginSystemPromptSegment {
  id: string;
  segment: string;
  shouldInclude: (config: Config) => boolean;
  priority?: number;
}

/**
 * Registry entry for a segment
 */
export interface RegistryEntry {
  segment: ISystemPromptSegment;
  source: "builtin" | "plugin";
}

// ============================================================================
// Builder Types
// ============================================================================

/**
 * Build result containing metadata
 */
export interface BuildResult {
  /** The final prompt string */
  prompt: string | null;

  /** Segments that were included */
  includedSegments: string[];

  /** Segments that were skipped */
  skippedSegments: string[];

  /** Total character count */
  charCount: number;

  /** Estimated token count (rough approximation) */
  estimatedTokens: number;
}

/**
 * Builder options
 */
export interface BuilderOptions {
  /** Skip empty segments */
  skipEmpty?: boolean;

  /** Join string between segments */
  joinString?: string;

  /** Enable debug logging */
  debug?: boolean;
}
