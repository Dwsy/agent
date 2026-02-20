/**
 * System Prompts Architecture - Main Entry Point
 *
 * A modular, extensible system for building gateway system prompts.
 *
 * Design Patterns:
 * - Strategy Pattern: Each segment is a strategy
 * - Registry Pattern: Dynamic segment registration
 * - Builder Pattern: Fluent API for prompt construction
 * - Singleton Pattern: Global registry instance
 *
 * Architecture: Three-Layer System
 * - Layer 1: Gateway Identity (static, always injected)
 * - Layer 2: Capability Prompts (conditional, per-feature)
 * - Layer 3: Per-Message Context (handled by channel plugins)
 *
 * Usage:
 * ```typescript
 * import { buildGatewaySystemPrompt } from "./system-prompts/index.ts";
 *
 * const prompt = buildGatewaySystemPrompt(config, context);
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  GatewayIdentityContext,
  PromptFeatureFlags,
  ISystemPromptSegment,
  SegmentConstructor,
  PluginSystemPromptSegment,
  RegistryEntry,
  BuildResult,
  BuilderOptions,
} from "./types.ts";

export { SegmentPriority } from "./types.ts";

// ============================================================================
// Base Classes
// ============================================================================

export {
  BaseSegment,
  StaticSegment,
  ConditionalSegment,
} from "./segments/base.ts";

// ============================================================================
// Built-in Segments
// ============================================================================

export {
  IdentitySegment,
  HeartbeatSegment,
  CronSegment,
  MediaSegment,
  DelegationSegment,
  ChannelSegment,
  getBuiltinSegments,
} from "./segments/index.ts";

// ============================================================================
// Registry
// ============================================================================

export {
  SegmentRegistry,
  registry,
  registerSegment,
  registerSystemPromptSegment,
  getActiveSegments,
} from "./registry.ts";

// ============================================================================
// Builder
// ============================================================================

export {
  SystemPromptBuilder,
  buildGatewaySystemPrompt,
  buildGatewaySystemPromptWithMetadata,
} from "./builder.ts";

// ============================================================================
// Legacy Backward Compatibility
// ============================================================================

/**
 * Legacy exports for backward compatibility
 * These are deprecated and will be removed in a future version
 */

/** @deprecated Use SegmentPriority.HEARTBEAT instead */
export const HEARTBEAT_PROMPT = "## Gateway: Heartbeat Protocol\n\nYou are connected to pi-gateway which periodically wakes you via heartbeat.";

/** @deprecated Use SegmentPriority.CRON instead */
export const CRON_PROMPT = "## Gateway: Scheduled Tasks\n\nThe gateway runs a cron engine for scheduled task execution.";

/** @deprecated Use SegmentPriority.MEDIA instead */
export const MEDIA_PROMPT = "## Gateway: Media & Message Tools\n\nUse `send_message` tool to proactively send messages.";
