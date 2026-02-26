/**
 * Concise Mode Plugin - Hook-Based Implementation
 *
 * Architecture:
 * - System prompt injection: Layer 2 Capability Prompt (via registry)
 * - Reply suppression: after_tool_call + message_sending hooks
 * - Session override: /concise command sets per-session state
 * - Hot-reload: effective state = session override > config default (dynamic)
 */

import type { GatewayPluginApi } from "../../types.ts";
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";
import { ConciseStateManager } from "./core/state-manager.ts";

interface ConciseModeConfig {
  enabled?: boolean;
  channels?: string[];
}

const DEFAULT_CHANNELS = ["telegram"];
const SILENT_TOKEN = "[NO_REPLY]";

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

// ============================================================================
// Singleton state manager — survives hot-reload, accessible from Telegram layer
// ============================================================================

let stateManager: ConciseStateManager | null = null;
let pluginApi: GatewayPluginApi | null = null;

/** Get the shared ConciseStateManager (null if plugin never registered) */
export function getConciseStateManager(): ConciseStateManager | null {
  return stateManager;
}

/** Read current config default from live gateway config */
export function getConciseConfigDefault(): boolean {
  if (!pluginApi) return false;
  const cfg = pluginApi.config as Record<string, any>;
  const raw = cfg?.plugins?.config?.["concise-mode"] as Record<string, unknown> | undefined;
  return typeof raw?.enabled === "boolean" ? raw.enabled : false;
}

/** Compute effective concise state for a session */
export function getEffectiveConciseState(sessionKey: string): boolean {
  const configDefault = getConciseConfigDefault();
  if (!stateManager) return configDefault;
  return stateManager.getEffectiveState(sessionKey, configDefault);
}

// ============================================================================
// Plugin registration
// ============================================================================

export default function register(api: GatewayPluginApi): void {
  pluginApi = api;
  const cfg = toConfig(api.pluginConfig);

  // Register system prompt segment (Layer 2 Capability Prompt)
  registerSystemPromptSegment({
    id: "concise-mode",
    segment: CONCISE_MODE_SEGMENT,
    shouldInclude: (gatewayConfig) => gatewayConfig.plugins?.config?.["concise-mode"]?.enabled ?? false,
    priority: 0,
  });

  // Initialize or update state manager (preserve overrides across reload)
  if (!stateManager) {
    stateManager = new ConciseStateManager(cfg.channels);
  } else {
    stateManager.updateChannels(cfg.channels);
  }

  if (!cfg.enabled) {
    api.logger.info("concise-mode disabled (overrides still active)");
    return;
  }

  api.logger.info(`concise-mode enabled for channels: ${cfg.channels.join(", ")}`);

  // Hook 1: message_received — track active sessions
  api.on("message_received", ({ message }) => {
    const { channel, sessionKey } = message.source;
    if (stateManager!.isChannelEnabled(channel)) {
      stateManager!.activateSession(sessionKey, channel);
      api.logger.debug(`[concise] Activated session: ${sessionKey} (${channel})`);
    }
  });

  // Hook 2: after_tool_call — add suppress route after send_message
  api.on("after_tool_call", ({ sessionKey, toolName, isError }) => {
    if (isError || toolName !== "send_message") return;

    // Dynamic: check effective state for this session
    if (!getEffectiveConciseState(sessionKey)) return;

    const sessionState = api.getSessionState(sessionKey);
    const target = sessionState?.lastChatId;
    if (!target) {
      api.logger.debug(`[concise] after_tool_call: no target for session ${sessionKey}`);
      return;
    }

    const added = stateManager!.addSuppressRoute(sessionKey, target);
    if (added) {
      api.logger.info(`[concise] Added suppress route for session ${sessionKey}`);
    }
  });

  // Hook 3: message_sending — suppress automatic replies
  api.on("message_sending", ({ message }) => {
    const { channel, target } = message;
    if (stateManager!.shouldSuppress(channel, target)) {
      message.text = SILENT_TOKEN;
      api.logger.info(`[concise] SUPPRESSED message to ${target}`);
    }
  });

  // Cleanup expired routes every 30 seconds
  setInterval(() => {
    const cleaned = stateManager!.cleanup();
    if (cleaned > 0) {
      api.logger.debug(`[concise] Cleaned up ${cleaned} expired entries`);
    }
  }, 30000);
}
