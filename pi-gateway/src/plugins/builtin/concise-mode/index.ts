/**
 * Concise Mode Plugin - Hook-Based Implementation
 *
 * This plugin:
 * 1. Registers system prompt segment via registerSystemPromptSegment()
 * 2. Uses hooks to suppress automatic replies after send_message
 *
 * Architecture:
 * - System prompt injection: Layer 2 Capability Prompt (via registry)
 * - Reply suppression: after_tool_call + message_sending hooks
 *
 * Note: This implementation fixes the reliability issue in the original version
 * by using activeSessions Map instead of relying on sessionStore fields that
 * may be undefined.
 */

import type { GatewayPluginApi } from "../../types.ts";
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";

interface ConciseModeConfig {
  enabled?: boolean;
  channels?: string[];
}

const DEFAULT_CHANNELS = ["telegram"];
const SILENT_TOKEN = "[NO_REPLY]";

/**
 * Concise Mode System Prompt Segment
 *
 * Injected when concise-mode plugin is enabled.
 * Follows Layer 2 Capability Prompt architecture.
 */
const CONCISE_MODE_SEGMENT = `## Concise Output Mode

**Core Principle:** Keep the user informed. Do NOT let the user wait in silence.

### How to Communicate

- Use \`send_message\` tool to report: what you're doing, what you found, what you decided
- For long tasks: report progress, intermediate findings, and final results
- Keep messages concise but informative

### When to Send Updates

- At the start: tell the user what you're going to do
- During execution: share key findings and decisions
- At completion: summarize results and next steps

### When to Use [NO_REPLY]

Output \`[NO_REPLY]\` only when you've already sent the final result via send_message and have nothing more to add.
`;

function toConfig(raw: Record<string, unknown> | undefined): Required<ConciseModeConfig> {
  const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : false;
  const channelsRaw = Array.isArray(raw?.channels) ? raw.channels : DEFAULT_CHANNELS;
  const channels = channelsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return {
    enabled,
    channels: channels.length > 0 ? channels : [...DEFAULT_CHANNELS],
  };
}

function makeRouteKey(channel: string, target: string): string {
  return `${channel}::${target}`;
}

const suppressRoutes = new Map<string, number>(); // "channel::target" → expiryTimestamp

export default function register(api: GatewayPluginApi): void {
  const cfg = toConfig(api.pluginConfig);

  // Register system prompt segment (Layer 2 Capability Prompt)
  // This is injected at Gateway startup, not per-message
  registerSystemPromptSegment({
    id: "concise-mode",
    segment: CONCISE_MODE_SEGMENT,
    shouldInclude: (gatewayConfig) => gatewayConfig.plugins?.config?.["concise-mode"]?.enabled ?? false,
    priority: 0,
  });

  if (!cfg.enabled) {
    api.logger.info("concise-mode disabled");
    return;
  }

  const enabledChannels = new Set(cfg.channels);
  // Track active sessions with their channel info (fixes the undefined lastChannel issue)
  const activeSessions = new Map<string, { channel: string }>();

  api.logger.info(`concise-mode enabled for channels: ${cfg.channels.join(", ")}`);

  // Hook 1: message_received - track active sessions
  // Note: System prompt is injected by buildGatewaySystemPrompt(), not here
  api.on("message_received", ({ message }) => {
    const { channel, sessionKey } = message.source;
    if (enabledChannels.has(channel)) {
      activeSessions.set(sessionKey, { channel });
      api.logger.debug(`[concise] Activated session: ${sessionKey} (${channel})`);
    } else {
      activeSessions.delete(sessionKey);
    }
  });

  // Hook 2: after_tool_call - add suppress route after send_message
  api.on("after_tool_call", ({ sessionKey, toolName, isError }) => {
    if (isError || toolName !== "send_message") return;

    const session = activeSessions.get(sessionKey);
    if (!session) {
      api.logger.debug(`[concise] after_tool_call: session ${sessionKey} not active`);
      return;
    }

    const sessionState = api.getSessionState(sessionKey);
    const target = sessionState?.lastChatId;

    if (!target) {
      api.logger.debug(`[concise] after_tool_call: no target for session ${sessionKey}`);
      return;
    }

    const routeKey = makeRouteKey(session.channel, target);
    const expiry = Date.now() + 5000; // 5 second TTL
    suppressRoutes.set(routeKey, expiry);

    api.logger.info(`[concise] Added suppress route: ${routeKey}`);
  });

  // Hook 3: message_sending - suppress automatic replies
  api.on("message_sending", ({ message }) => {
    const { channel, target } = message;
    const routeKey = makeRouteKey(channel, target);

    const expiry = suppressRoutes.get(routeKey);
    if (!expiry) {
      api.logger.debug(`[concise] message_sending: no suppress route for ${routeKey}`);
      return;
    }

    // Check TTL
    if (Date.now() > expiry) {
      suppressRoutes.delete(routeKey);
      api.logger.debug(`[concise] message_sending: route ${routeKey} expired`);
      return;
    }

    // Suppress this message
    suppressRoutes.delete(routeKey);
    message.text = SILENT_TOKEN;

    api.logger.info(`[concise] SUPPRESSED message to ${target}`);
  });

  // Cleanup expired routes every 30 seconds
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, expiry] of suppressRoutes.entries()) {
      if (now > expiry) {
        suppressRoutes.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      api.logger.debug(`[concise] Cleaned up ${cleaned} expired routes`);
    }
  }, 30000);
}
