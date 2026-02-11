import type { Config } from "./config.ts";

const HEARTBEAT_SEGMENT = `## Gateway: Heartbeat Protocol

You are connected to pi-gateway which periodically wakes you via heartbeat.

When woken by heartbeat:
1. Read HEARTBEAT.md if it exists — follow its instructions strictly
2. Do NOT infer or repeat tasks from prior conversations
3. If nothing needs attention, reply with exactly: HEARTBEAT_OK
4. If you completed tasks but want to confirm success, include HEARTBEAT_OK at the end of your response
5. If there are alerts or issues requiring human attention, describe them WITHOUT including HEARTBEAT_OK

The gateway suppresses HEARTBEAT_OK responses (they won't reach the user). Only non-OK responses are delivered as alerts.`;

const CRON_SEGMENT = `## Gateway: Scheduled Task Events

The gateway may inject scheduled task events in the format:
- [CRON:{job-id}] {task description}

When you see these events:
1. Process each task according to its description
2. Report results for each task
3. If ALL tasks completed successfully, include HEARTBEAT_OK at the end
4. If any task failed, describe the failure WITHOUT HEARTBEAT_OK`;

const MEDIA_SEGMENT = `## Gateway: Media Replies

To send a file (image, audio, document) back to the user, use this syntax on a separate line:
MEDIA:<relative-path>

Examples:
- MEDIA:./output.png
- MEDIA:./report.pdf

Rules:
- Path must be relative (no absolute paths, no ~ paths)
- One MEDIA directive per line
- Text before/after MEDIA lines is sent as normal message
- Supported: images, audio, video, documents`;

/**
 * Build gateway-injected system prompt based on enabled features.
 * Returns null when no features need injection (saves tokens).
 */
export function buildGatewaySystemPrompt(config: Config): string | null {
  const overrides = config.agent.gatewayPrompts;
  const segments: string[] = [];

  const heartbeatEnabled = overrides?.heartbeat ?? config.heartbeat?.enabled ?? false;
  if (heartbeatEnabled) segments.push(HEARTBEAT_SEGMENT);

  const cronEnabled = overrides?.cron ?? config.cron?.enabled ?? false;
  if (cronEnabled) segments.push(CRON_SEGMENT);

  const mediaEnabled = overrides?.media ?? hasAnyChannel(config);
  if (mediaEnabled) segments.push(MEDIA_SEGMENT);

  return segments.length > 0 ? segments.join("\n\n") : null;
}

function hasAnyChannel(config: Config): boolean {
  const channels = config.channels;
  if (!channels) return false;
  if ((channels as any).telegram?.enabled !== false && (channels as any).telegram) return true;
  if ((channels as any).discord?.enabled !== false && (channels as any).discord) return true;
  return false;
}
