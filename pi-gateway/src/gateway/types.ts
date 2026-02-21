/**
 * Shared context object for all gateway sub-modules.
 * Injected by Gateway class after construction — avoids circular imports.
 *
 * Sub-modules import this type only, never server.ts directly.
 */

import type { ServerWebSocket } from "bun";
import type { Config, CronJob } from "../core/config.ts";
import type { RpcPool } from "../core/rpc-pool.ts";
import type { RpcClient } from "../core/rpc-client.ts";
import type { MessageQueueManager, PrioritizedWork } from "../core/message-queue.ts";
import type { PluginRegistryState } from "../plugins/loader.ts";
import type { SessionStore } from "../core/session-store.ts";
import type { TranscriptLogger } from "../core/transcript-logger.ts";
import type { MetricsCollector } from "../core/metrics.ts";
import type { ExtensionUIForwarder } from "../core/extension-ui-forwarder.ts";
import type { SystemEventsQueue } from "../core/system-events.ts";
import type { CronEngine } from "../core/cron.ts";
import type { HeartbeatExecutor } from "../core/heartbeat-executor.ts";
import type { DelegateExecutor } from "../core/delegate-executor.ts";
import type { DeduplicationCache } from "../core/dedup-cache.ts";
import type { ExecGuard } from "../core/exec-guard.ts";
import type { ModelHealthTracker } from "../core/model-health.ts";
import type { Logger, SessionKey, InboundMessage } from "../core/types.ts";
import type { buildCapabilityProfile } from "../core/capability-profile.ts";
import type { GatewayPluginApi } from "../plugins/types.ts";
import type { GatewayObservability } from "../core/gateway-observability.ts";

export type TelegramMessageMode = "steer" | "follow-up" | "interrupt";

/** Result of dispatching an inbound message through the gateway pipeline. */
export interface DispatchResult {
  /** True when the message was injected into an active streaming turn (steer/follow-up). */
  injected?: boolean;
  /** True when the message was enqueued for normal processing. */
  enqueued?: boolean;
}

export interface WsClientData {
  clientId: string;
}

export interface GatewayContext {
  // Core config
  config: Config;

  // RPC process management
  pool: RpcPool;

  // Message queue
  queue: MessageQueueManager;

  // Plugin registry
  registry: PluginRegistryState;

  // Session persistence
  sessions: SessionStore;

  // Transcript logging
  transcripts: TranscriptLogger;

  // Metrics collection
  metrics: MetricsCollector;

  // Extension UI forwarding (pi TUI → WebSocket)
  extensionUI: ExtensionUIForwarder;

  // System events queue (cron → heartbeat)
  systemEvents: SystemEventsQueue;

  // Deduplication cache
  dedup: DeduplicationCache;

  // Optional subsystems
  cron: CronEngine | null;
  heartbeat: HeartbeatExecutor | null;
  delegateExecutor: DelegateExecutor | null;
  execGuard: ExecGuard | null;
  modelHealth: ModelHealthTracker | null;

  // Logging
  log: Logger;

  // WebSocket client tracking
  wsClients: Map<string, ServerWebSocket<WsClientData>>;

  // State
  noGui: boolean;
  sessionMessageModeOverrides: Map<SessionKey, TelegramMessageMode>;
  activeInboundMessages: Map<SessionKey, InboundMessage>;

  // R2: plugin-api-factory dependencies (DarkUnion)
  /** Cached plugin API instances per channel — populated during channel init */
  channelApis: Map<string, GatewayPluginApi>;
  /** Resolve Telegram message mode for a session (steer/follow-up/interrupt) */
  resolveTelegramMessageMode: (sessionKey: SessionKey, sourceAccountId?: string) => TelegramMessageMode;

  // Gateway observability
  observability: GatewayObservability;

  // Methods (bound from Gateway)
  broadcastToWs: (event: string, payload: unknown) => void;
  buildSessionProfile: (sessionKey: SessionKey, role: string) => ReturnType<typeof buildCapabilityProfile>;
  dispatch: (msg: InboundMessage) => Promise<DispatchResult>;
  compactSessionWithHooks: (sessionKey: SessionKey, instructions?: string) => Promise<void>;
  listAvailableRoles: () => string[];
  setSessionRole: (sessionKey: SessionKey, newRole: string) => Promise<boolean>;
  createRole: (role: string) => Promise<{ ok: boolean; error?: string }>;
  deleteRole: (role: string) => Promise<{ ok: boolean; error?: string }>;
  reloadConfig?: () => void;
  /** Track cron sessions that self-delivered messages (skip announce). */
  onCronDelivered?: (sessionKey: string) => void;
}
