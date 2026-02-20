/**
 * System Prompt Segments - Barrel Export
 *
 * All built-in segments are registered here.
 */

export { BaseSegment, StaticSegment, ConditionalSegment } from "./base.ts";
export { IdentitySegment } from "./identity.ts";
export { HeartbeatSegment } from "./heartbeat.ts";
export { CronSegment } from "./cron.ts";
export { MediaSegment } from "./media.ts";
export { DelegationSegment } from "./delegation.ts";
export { ChannelSegment } from "./channel.ts";

// Registry of all built-in segments
import type { ISystemPromptSegment } from "../types.ts";
import { IdentitySegment } from "./identity.ts";
import { HeartbeatSegment } from "./heartbeat.ts";
import { CronSegment } from "./cron.ts";
import { MediaSegment } from "./media.ts";
import { DelegationSegment } from "./delegation.ts";
import { ChannelSegment } from "./channel.ts";

/**
 * Get all built-in segments
 */
export function getBuiltinSegments(): ISystemPromptSegment[] {
  return [
    new IdentitySegment(),
    new HeartbeatSegment(),
    new CronSegment(),
    new MediaSegment(),
    new DelegationSegment(),
    new ChannelSegment(),
  ];
}
