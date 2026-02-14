/**
 * Plugin system type definitions.
 *
 * Aligned with OpenClaw's OpenClawPluginApi interface:
 * - Same hook names (PluginHookName)
 * - Same registration methods (registerChannel, registerTool, etc.)
 * - Same plugin discovery order (config > workspace > builtin)
 */

import type {
  AgentEvent,
  InboundMessage,
  Logger,
  OutboundMessage,
  SessionKey,
  SessionState,
} from "../core/types.ts";
import type { Config } from "../core/config.ts";

// ============================================================================
// Plugin Hook Names (aligned 1:1 with OpenClaw PluginHookName)
// ============================================================================

export type PluginHookName =
  // Agent lifecycle
  | "before_agent_start"
  | "agent_end"
  // Message pipeline
  | "message_received"
  | "message_sending"
  | "message_sent"
  // Tool calls
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  // Session lifecycle
  | "session_start"
  | "session_end"
  | "session_reset"
  // Compaction
  | "before_compaction"
  | "after_compaction"
  // Gateway lifecycle
  | "gateway_start"
  | "gateway_stop";

// ============================================================================
// Hook Payloads
// ============================================================================

export interface HookPayload {
  before_agent_start: { sessionKey: SessionKey; message: string };
  agent_end: { sessionKey: SessionKey; messages: unknown[]; stopReason: string };
  message_received: { message: InboundMessage };
  message_sending: { message: OutboundMessage };
  message_sent: { message: OutboundMessage };
  before_tool_call: { sessionKey: SessionKey; toolName: string; args: Record<string, unknown> };
  after_tool_call: { sessionKey: SessionKey; toolName: string; result: unknown; isError: boolean };
  tool_result_persist: { sessionKey: SessionKey; toolName: string; result: unknown };
  session_start: { sessionKey: SessionKey };
  session_end: { sessionKey: SessionKey };
  session_reset: { sessionKey: SessionKey };
  before_compaction: { sessionKey: SessionKey };
  after_compaction: { sessionKey: SessionKey; summary?: string };
  gateway_start: {};
  gateway_stop: {};
}

export type HookHandler<T extends PluginHookName = PluginHookName> = (
  payload: HookPayload[T],
) => void | Promise<void>;

// ============================================================================
// Channel Plugin (aligned with OpenClaw ChannelPlugin)
// ============================================================================

export interface ChannelPluginMeta {
  label: string;
  blurb?: string;
  docsUrl?: string;
}

export interface ChannelPluginCapabilities {
  direct?: boolean;
  group?: boolean;
  thread?: boolean;
  media?: boolean;
  /** Channel supports edit-in-place streaming (CA-1) */
  streaming?: boolean;
  /** Channel supports DM security policy (CA-1) */
  security?: boolean;
}

export interface SendOptions {
  replyTo?: string;
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface MediaSendOptions extends SendOptions {
  /** Media type hint (auto-detected from extension if omitted) */
  type?: "photo" | "audio" | "document" | "video" | "sticker";
  /** Caption text */
  caption?: string;
}

export interface MediaSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Result from sendText when message ID tracking is needed */
export type MessageSendResult = MediaSendResult;

/** Result from message actions (react/edit/delete) */
export interface MessageActionResult {
  ok: boolean;
  error?: string;
}

/** Options for sendReaction */
export interface ReactionOptions {
  /** Remove the reaction instead of adding it */
  remove?: boolean;
}

/** A single message from channel history */
export interface ChannelHistoryMessage {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
}

/** Result from readHistory */
export interface ReadHistoryResult {
  ok: boolean;
  messages?: ChannelHistoryMessage[];
  error?: string;
}

// ============================================================================
// Channel Outbound (CA-1: extracted as named interface)
// ============================================================================

export interface ChannelOutbound {
  /** Send text to a target in this channel. Returns delivery result. */
  sendText(target: string, text: string, opts?: SendOptions): Promise<MessageSendResult>;
  /** Send a media file (optional — not all channels support media) */
  sendMedia?(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult>;
  /** React to a message with an emoji (optional — v3.6) */
  sendReaction?(target: string, messageId: string, emoji: string | string[], opts?: ReactionOptions): Promise<MessageActionResult>;
  /** Edit an existing message (optional — v3.6) */
  editMessage?(target: string, messageId: string, text: string): Promise<MessageActionResult>;
  /** Delete a message (optional — v3.6) */
  deleteMessage?(target: string, messageId: string): Promise<MessageActionResult>;
  /** Pin/unpin a message (optional — v3.8) */
  pinMessage?(target: string, messageId: string, unpin?: boolean): Promise<MessageActionResult>;
  /** Read recent messages from a chat (optional — v3.8) */
  readHistory?(target: string, limit?: number, before?: string): Promise<ReadHistoryResult>;
  /** Max message length for this channel (for chunking) */
  maxLength?: number;
}

// ============================================================================
// Channel Streaming Adapter (CA-1: evidence-based, from CA-0 §2)
// ============================================================================

export interface StreamPlaceholderOpts {
  /** Initial text for the placeholder (e.g. spinner frame) */
  text?: string;
  /** Thread/topic ID for threaded channels */
  threadId?: string;
  /** Reply to a specific message */
  replyTo?: string;
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface StreamEditOpts {
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface StreamingConfig {
  /** Minimum ms between edits (Telegram: 1000, Discord: 500). Must be >= 300ms. */
  editThrottleMs?: number;
  /** Stop editing when text exceeds this length (Discord: 1800) */
  editCutoffChars?: number;
  /** Minimum accumulated chars before first edit (Telegram: ~800) */
  streamStartChars?: number;
}

/**
 * Optional streaming adapter for channels that support edit-in-place live updates.
 * Implementors: Telegram (editMessageText), Discord (editReply).
 * Channels using WS push (WebChat) or card patch (Feishu) opt out.
 *
 * Scope: defines editMessage/createPlaceholder contract only.
 * Shared pipeline logic (contentSequence, buildLiveText, pushLiveUpdate)
 * lives in a utility module (streaming/live-text.ts), not here.
 */
export interface ChannelStreamingAdapter {
  /**
   * Send a placeholder message and return its ID for later editing.
   * @param target — channel-specific chat target (Telegram: chatId, Discord: channelId)
   */
  createPlaceholder(target: string, opts?: StreamPlaceholderOpts): Promise<{ messageId: string }>;

  /**
   * Edit an existing message with updated content (for live streaming).
   * Returns false on failure (e.g. Telegram 429) — caller should skip, not retry.
   * @param target — channel-specific chat target (same as createPlaceholder)
   *
   * Security note: text content only. If future streaming embeds MEDIA directives,
   * any file paths MUST pass validateMediaPath before delivery.
   */
  editMessage(target: string, messageId: string, text: string, opts?: StreamEditOpts): Promise<boolean>;

  /** Show typing indicator. Optional — some channels don't support it. */
  setTyping?(target: string, active: boolean): Promise<void>;

  /** Channel-specific streaming config defaults */
  config?: StreamingConfig;
}

// ============================================================================
// Channel Security Adapter (CA-1: evidence-based, from CA-0 §3)
// ============================================================================

/** DM access policy for channel security */
export type DmPolicy = "open" | "allowlist" | "pairing" | "disabled";

export interface AccessCheckContext {
  channel: string;
  chatType: "dm" | "group" | "channel" | "thread";
  chatId?: string;
  accountId?: string;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  /** If pairing is needed, the generated code */
  pairingCode?: string;
}

/**
 * Optional security adapter for DM access control.
 * Delegates to shared security/allowlist.ts by default.
 * Implementors: Telegram, Discord, Feishu. WebChat uses auth-only (no DM policy).
 */
export interface ChannelSecurityAdapter {
  /** DM access policy */
  dmPolicy: DmPolicy;
  /** Static allowlist from config */
  dmAllowFrom?: Array<string | number>;
  /**
   * Whether this channel supports pairing flow.
   * false → config-only allowFrom check
   * true  → shared allowlist.ts + pairing.ts (persisted allowlist + code approval)
   */
  supportsPairing?: boolean;
  /** Account ID for scoped allowlist persistence */
  accountId?: string;
  /**
   * Override default access check. If omitted, delegates to shared allowlist.ts.
   * Channels can override for custom logic (e.g. group-specific rules).
   * TODO: may become fully Promise<AccessResult> if channels need async I/O lookups.
   */
  checkAccess?(senderId: string, context: AccessCheckContext): AccessResult | Promise<AccessResult>;
}

// ============================================================================
// Channel Plugin (aligned with OpenClaw ChannelPlugin)
// ============================================================================

export interface ChannelPlugin {
  /** Unique channel identifier, e.g. "telegram", "discord", "webchat" */
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelPluginCapabilities;

  /** Outbound messaging (CA-1: named interface, sendText returns MessageSendResult) */
  outbound: ChannelOutbound;

  /** Initialize with gateway context */
  init(api: GatewayPluginApi): Promise<void>;
  /** Start receiving messages */
  start(): Promise<void>;
  /** Graceful shutdown */
  stop(): Promise<void>;

  /** Optional: edit-in-place streaming (Telegram, Discord) — CA-1 */
  streaming?: ChannelStreamingAdapter;
  /** Optional: DM access control (Telegram, Discord, Feishu) — CA-1 */
  security?: ChannelSecurityAdapter;
}

// ============================================================================
// Tool Plugin
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  optional?: boolean;
}

export interface ToolContext {
  sessionKey: SessionKey;
  logger: Logger;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface ToolPlugin {
  name: string;
  description: string;
  tools: ToolDefinition[];
  execute(toolName: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ============================================================================
// Background Service
// ============================================================================

export interface BackgroundService {
  name: string;
  start(api: GatewayPluginApi): Promise<void>;
  stop(): Promise<void>;
}

// ============================================================================
// Command (bypasses LLM, aligned with OpenClaw registerCommand)
// ============================================================================

export interface CommandContext {
  sessionKey: SessionKey;
  senderId: string;
  channel: string;
  args: string;
  respond: (text: string) => Promise<void>;
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

// ============================================================================
// CLI Extension (aligned with OpenClaw registerCli)
// ============================================================================

export type CliCommandHandler = (args: string[], flags: Record<string, string | boolean>) => void | Promise<void>;

export interface CliProgram {
  command(name: string, description: string, handler: CliCommandHandler): void;
}

// ============================================================================
// HTTP Handler
// ============================================================================

export type HttpHandler = (req: Request) => Response | Promise<Response>;

// ============================================================================
// WS Method Handler
// ============================================================================

export type WsMethodHandler = (
  params: Record<string, unknown>,
  ctx: { clientId: string; sessionKey?: SessionKey },
) => unknown | Promise<unknown>;

// ============================================================================
// Plugin Manifest (plugin.json)
// ============================================================================

export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  main: string;             // entry point relative to plugin dir
}

// ============================================================================
// Gateway Plugin API (aligned with OpenClaw OpenClawPluginApi)
// ============================================================================

export interface GatewayPluginApi {
  // --- Metadata ---
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly source: string;

  // --- Configuration ---
  readonly config: Config;
  readonly pluginConfig?: Record<string, unknown>;

  // --- Logger ---
  readonly logger: Logger;

  // --- Registration (aligned 1:1 with OpenClaw) ---

  /** Register a messaging channel (Telegram, Discord, etc.) */
  registerChannel(channel: ChannelPlugin): void;

  /** Register a tool available to the agent */
  registerTool(tool: ToolPlugin): void;

  /** Register hook handler for specific lifecycle events */
  registerHook(events: PluginHookName[], handler: HookHandler): void;

  /** Register an HTTP route on the gateway */
  registerHttpRoute(method: string, path: string, handler: HttpHandler): void;

  /** Register a WebSocket RPC method on the gateway */
  registerGatewayMethod(method: string, handler: WsMethodHandler): void;

  /** Register a slash command that bypasses the LLM agent */
  registerCommand(name: string, handler: CommandHandler): void;

  /** Register a background service */
  registerService(service: BackgroundService): void;

  /** Register CLI commands */
  registerCli(registrar: (program: unknown) => void): void;

  /** Shorthand for registerHook([hook], handler) */
  on<T extends PluginHookName>(hook: T, handler: HookHandler<T>): void;

  // --- Runtime ---

  /** Dispatch an inbound message to the agent pipeline */
  dispatch(msg: InboundMessage): Promise<{ injected?: boolean; enqueued?: boolean }>;

  /** Send a message to a specific channel target */
  sendToChannel(channel: string, target: string, text: string): Promise<void>;

  /** Get current session state */
  getSessionState(sessionKey: SessionKey): SessionState | null;

  /** Reset a session (calls RPC new_session on the bound process) */
  resetSession(sessionKey: SessionKey): Promise<void>;

  /** Set thinking level for a session (calls RPC set_thinking_level) */
  setThinkingLevel(sessionKey: SessionKey, level: string): Promise<void>;

  /** Set model for a session (calls RPC set_model) */
  setModel(sessionKey: SessionKey, provider: string, modelId: string): Promise<void>;

  /** Get available models from the bound RPC session */
  getAvailableModels(sessionKey: SessionKey): Promise<unknown[]>;

  /** Get resolved Telegram message concurrency mode for a session. */
  getSessionMessageMode(sessionKey: SessionKey): Promise<"steer" | "follow-up" | "interrupt">;

  /** Override Telegram message concurrency mode for a session (process-local). */
  setSessionMessageMode(sessionKey: SessionKey, mode: "steer" | "follow-up" | "interrupt"): Promise<void>;

  /** Compact session context (calls RPC compact) */
  compactSession(sessionKey: SessionKey, instructions?: string): Promise<void>;

  /** Abort current agent run (calls RPC abort) */
  abortSession(sessionKey: SessionKey): Promise<void>;

  /** Forward a slash command to the RPC agent */
  forwardCommand(sessionKey: SessionKey, command: string, args: string): Promise<void>;

  /** Get available pi slash commands from RPC */
  getPiCommands(sessionKey: SessionKey): Promise<{ name: string; description?: string }[]>;

  /** Get session statistics (tokens, cost, message counts) from RPC */
  getSessionStats(sessionKey: SessionKey): Promise<unknown>;

  /** Get RPC process state (model, thinkingLevel, etc.) */
  getRpcState(sessionKey: SessionKey): Promise<unknown>;

  /** Access the cron engine for job management */
  readonly cronEngine?: import("../core/cron.ts").CronEngine;

  /** Access the system events queue (for cron/heartbeat plugins) */
  readonly systemEvents?: import("../core/system-events.ts").SystemEventsQueue;

  /** Access the session store */
  readonly sessionStore?: import("../core/session-store.ts").SessionStore;

  /** Request immediate heartbeat for an agent */
  requestHeartbeat?: (agentId: string, reason?: string) => void;

  /** Get registered channel plugins (for cron announcer delivery) */
  getChannels?: () => Map<string, ChannelPlugin>;

  /** Access the RPC pool (for heartbeat plugin) */
  readonly rpcPool?: import("../core/rpc-pool.ts").RpcPool;

  /** List all tracked sessions (sorted by lastActivity desc) */
  listSessions(): import("../core/types.ts").SessionState[];

  /** Release an RPC process bound to a session (returns it to pool) */
  releaseSession(sessionKey: SessionKey): void;
}

// ============================================================================
// Plugin Factory
// ============================================================================

/**
 * A plugin exports either:
 * - A function: (api: GatewayPluginApi) => void | Promise<void>
 * - An object with a register method
 */
export type PluginFactory =
  | ((api: GatewayPluginApi) => void | Promise<void>)
  | {
      id: string;
      name: string;
      register(api: GatewayPluginApi): void | Promise<void>;
    };
