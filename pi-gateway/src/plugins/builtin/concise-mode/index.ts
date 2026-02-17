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
 */

import type { GatewayPluginApi } from "../../types.ts";
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";

const SILENT_TOKEN = "[NO_REPLY]";
const suppressRoutes = new Map<string, number>(); // "channel::target" → expiryTimestamp

/**
 * Concise Mode System Prompt Segment
 * 
 * Injected when concise-mode plugin is enabled.
 * Follows Layer 2 Capability Prompt architecture.
 */
const CONCISE_MODE_SEGMENT = `## Concise Output Mode

- Use \`send_message\` tool to share progress, thoughts, findings, and reasoning
- Output \`[NO_REPLY]\` when no user-facing message is needed
`;

export default function register(api: GatewayPluginApi): void {
  const config = api.pluginConfig as { enabled?: boolean; channels?: string[] } | undefined;
  const enabled = config?.enabled ?? false;
  const channels = new Set(config?.channels ?? ["telegram"]);

  // Register system prompt segment (Layer 2 Capability Prompt)
  // This is injected at Gateway startup, not per-message
  registerSystemPromptSegment({
    id: "concise-mode",
    segment: CONCISE_MODE_SEGMENT,
    shouldInclude: (gatewayConfig) => gatewayConfig.plugins?.config?.["concise-mode"]?.enabled ?? false,
    priority: 0,
  });

  if (!enabled) {
    api.logger.info("concise-mode disabled");
    return;
  }

  api.logger.info(`concise-mode enabled for channels: ${[...channels].join(", ")}`);

  // Track active sessions
  const activeSessions = new Map<string, { channel: string }>();

  // Hook 1: message_received - track active sessions
  // Note: System prompt is injected by buildGatewaySystemPrompt(), not here
  api.on("message_received", ({ message }) => {
    const { channel, sessionKey } = message.source;
    if (channels.has(channel)) {
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

    const routeKey = `${session.channel}::${target}`;
    const expiry = Date.now() + 5000; // 5 second TTL
    suppressRoutes.set(routeKey, expiry);
    
    api.logger.info(`[concise] Added suppress route: ${routeKey}`);
  });

  // Hook 3: message_sending - suppress automatic replies
  api.on("message_sending", ({ message }) => {
    const { channel, target } = message;
    const routeKey = `${channel}::${target}`;
    
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
