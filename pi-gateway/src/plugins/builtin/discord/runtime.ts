/**
 * Discord plugin runtime store — singleton access to the active Discord runtime.
 *
 * Reference: openclaw-discord@2026.3.13 src/runtime.ts
 *
 * The runtime is set during `client.once("ready")` in index.ts and provides
 * access to the discord.js client, channel config, and runtime state.
 */
import type { Client } from "discord.js";
import type { GatewayPluginApi } from "../../types.ts";
import type { DiscordChannelConfig } from "./types.ts";

// ── Runtime Store ──────────────────────────────────────────────────

let _runtime: DiscordRuntime | null = null;

export interface DiscordRuntime {
  api: GatewayPluginApi;
  channelCfg: DiscordChannelConfig;
  client: Client;
  clientId: string;
  /** Last time we received an event from Discord gateway */
  lastEventAt: number;
  /** Last inbound message timestamp */
  lastInboundAt: number;
  /** Last outbound message timestamp */
  lastOutboundAt: number;
  /** Whether the gateway is currently connected */
  connected: boolean;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Bot username for display */
  botUsername?: string;
  /** Application name */
  applicationName?: string;
  /** Last error message */
  lastError?: string;
}

/**
 * Get the current Discord runtime. Throws if not yet initialized.
 */
export function getDiscordRuntime(): DiscordRuntime {
  if (!_runtime) {
    throw new Error("Discord runtime not initialized");
  }
  return _runtime;
}

/**
 * Set the Discord runtime (called from index.ts during client ready).
 */
export function setDiscordRuntime(rt: DiscordRuntime): void {
  _runtime = rt;
}

/**
 * Check if Discord runtime is available.
 */
export function hasDiscordRuntime(): boolean {
  return _runtime !== null;
}

/**
 * Clear runtime on stop.
 */
export function clearDiscordRuntime(): void {
  _runtime = null;
}

/**
 * Update runtime timestamps.
 */
export function touchDiscordRuntime(): void {
  if (_runtime) {
    _runtime.lastEventAt = Date.now();
  }
}

export function touchDiscordInbound(): void {
  if (_runtime) {
    _runtime.lastInboundAt = Date.now();
    _runtime.lastEventAt = _runtime.lastInboundAt;
  }
}

export function touchDiscordOutbound(): void {
  if (_runtime) {
    _runtime.lastOutboundAt = Date.now();
    _runtime.lastEventAt = _runtime.lastOutboundAt;
  }
}
