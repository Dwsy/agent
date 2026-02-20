/**
 * System Prompts - Legacy Entry Point
 *
 * @deprecated This file is kept for backward compatibility.
 * Please import from "./system-prompts/index.ts" instead.
 *
 * Migration Guide:
 * - `buildGatewaySystemPrompt` → unchanged, still exported
 * - `buildGatewayIdentityPrompt` → use `new IdentitySegment().build()`
 * - `buildDelegationSegment` → use `new DelegationSegment().build()`
 * - `buildChannelSegment` → use `new ChannelSegment().build()`
 * - `registerSystemPromptSegment` → unchanged, still exported
 * - `SystemPromptSegment` → use `PluginSystemPromptSegment`
 */

// Re-export everything from the new modular architecture
export * from "./system-prompts/index.ts";

// Additional legacy exports for compatibility
export type { Config } from "./config.ts";
