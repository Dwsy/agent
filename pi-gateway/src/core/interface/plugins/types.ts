/**
 * Interface Layer - Plugin System Types
 *
 * Plugin interfaces exposed to external plugins.
 * Built on top of domain types, extends with interface-specific functionality.
 *
 * Dependency direction: interface/plugins/ → domain/
 */

import type {
  SessionKey,
  MessageSource,
  InboundMessage,
  Logger,
  PluginMetadata,
  PluginStatus,
  PluginApi as DomainPluginApi,
  ToolDefinition as DomainToolDefinition,
  HookHandler,
  Result,
} from "../../domain/types.ts";
import type { Config } from "../../config.ts";
import type { RpcPool } from "../../rpc-pool.ts";
import type { CronEngine } from "../../cron.ts";
import type { ModelHealthTracker } from "../../model-health.ts";
import type { CommandResponse, InteractionEvent, NativeCommandSpec } from "../../../gateway/command-types.ts";

// Re-export domain types for plugin convenience
export type {
  SessionKey,
  MessageSource,
  InboundMessage,
  Logger,
  PluginMetadata,
  PluginStatus,
  HookHandler,
  Result,
} from "../../domain/types.ts";

// ============================================================================
// Channel Plugin Types
// ============================================================================

/** DM access policy for channel security */
export type DmPolicy = "open" | "allowlist" | "pairing" | "disabled";

export type CapabilitySupportLevel = "full" | "partial" | "none";
export type StreamingSupportMode = "native" | "post-edit" | "none";

/** Fine-grained channel feature matrix (Chat SDK style) */
export interface ChannelCapabilityMatrix {
  interaction?: {
    callbacks?: boolean;
    ack?: boolean;
    messageUpdate?: "native" | "resend" | "none";
  };
  messaging?: {
    post?: boolean;
    edit?: boolean;
    delete?: boolean;
    fileUpload?: CapabilitySupportLevel;
    streaming?: StreamingSupportMode;
  };
  richContent?: {
    cards?: CapabilitySupportLevel;
    buttons?: CapabilitySupportLevel;
    modals?: boolean;
  };
  conversation?: {
    mentions?: boolean;
    reactions?: CapabilitySupportLevel;
    dms?: boolean;
    typing?: boolean;
    ephemeral?: CapabilitySupportLevel;
  };
  history?: {
    fetchMessages?: CapabilitySupportLevel;
    fetchSingleMessage?: CapabilitySupportLevel;
    fetchThreadInfo?: CapabilitySupportLevel;
    fetchChannelMessages?: CapabilitySupportLevel;
    listThreads?: CapabilitySupportLevel;
    fetchChannelInfo?: CapabilitySupportLevel;
    postChannelMessage?: CapabilitySupportLevel;
  };
}

/** Channel capabilities flags */
export interface ChannelCapabilities {
  /** Supports native commands (slash commands) */
  nativeCommands?: boolean;
  /** Supports polls */
  polls?: boolean;
  /** Supports direct messages */
  direct?: boolean;
  /** Supports group chats */
  group?: boolean;
  /** Supports threaded conversations */
  thread?: boolean;
  /** Supports media (images, files) */
  media?: boolean;
  /** Supports edit-in-place streaming */
  streaming?: boolean;
  /** Supports DM security policy */
  security?: boolean;
  /** Supports reactions */
  reactions?: boolean;
  /** Supports message editing */
  editable?: boolean;
  /** Supports message deletion */
  deletable?: boolean;
  /** Supports message pinning */
  pinnable?: boolean;
  /** Supports read history */
  history?: boolean;
  /** Fine-grained capability matrix for platform-agnostic feature negotiation */
  matrix?: ChannelCapabilityMatrix;

  /** Mention stripping patterns (regex strings) */
  mentions?: {
    stripPatterns?: () => string[];
  };
}

/** Channel plugin metadata */
export interface ChannelMeta {
  /** Human-readable label */
  label: string;
  /** Short description */
  blurb?: string;
  /** Documentation URL */
  docsUrl?: string;
}

/** Message send options */
export interface SendOptions {
  /** Session key for channel-side delivery context */
  sessionKey?: SessionKey;
  /** Reply to message ID */
  replyTo?: string;
  /** Parse mode for formatting */
  parseMode?: "Markdown" | "HTML" | "plain";
  /** Thread/topic ID */
  threadId?: string;
  /** Channel-specific streaming hint */
  streamMode?: string;
  /** Channel-specific stream identifier */
  streamId?: string | number;
  /** @deprecated legacy telegram field, use streamId/channelMeta */
  draftId?: number;
  /** Generic channel extension bag for future decoupling */
  channelMeta?: Record<string, unknown>;
}

/** Media send options */
export interface MediaSendOptions extends SendOptions {
  /** Media type hint */
  type?: "photo" | "audio" | "document" | "video" | "sticker";
  /** Caption text */
  caption?: string;
}

/** Message send result */
export interface MessageSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface NativeCommandAdapter {
  supportsNativeCommands?: boolean;
  sync(commands: NativeCommandSpec[]): Promise<void>;
}

/** Media send result */
export interface MediaSendResult extends MessageSendResult {
  /** File path if saved locally */
  filePath?: string;
}

/** Reaction options */
export interface ReactionOptions {
  /** Whether to remove reaction instead of adding */
  remove?: boolean;
}

/** Message action result (edit/delete/pin) */
export interface MessageActionResult {
  ok: boolean;
  error?: string;
}

/** Read history result */
export interface ReadHistoryResult {
  ok: boolean;
  messages?: Array<{
    id: string;
    text: string;
    senderId?: string;
    timestamp: number;
  }>;
  error?: string;
}

/** Inline keyboard button */
export interface InlineKeyboardButton {
  text: string;
  callbackData?: string;
  /** @deprecated legacy snake_case alias */
  callback_data?: string;
  url?: string;
}

/** Inline keyboard markup */
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/** Outbound messaging interface for channels */
export interface ChannelOutbound {
  /** Send text message */
  sendText(target: string, text: string, opts?: SendOptions): Promise<MessageSendResult>;

  /** Send media file */
  sendMedia?(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult>;

  /** Send reaction to message */
  sendReaction?(target: string, messageId: string, emoji: string | string[], opts?: ReactionOptions): Promise<MessageActionResult>;

  /** Edit existing message */
  editMessage?(target: string, messageId: string, text: string): Promise<MessageActionResult>;

  /** Delete message */
  deleteMessage?(target: string, messageId: string): Promise<MessageActionResult>;

  /** Pin/unpin message */
  pinMessage?(target: string, messageId: string, unpin?: boolean): Promise<MessageActionResult>;

  /** Read recent messages */
  readHistory?(target: string, limit?: number, before?: string): Promise<ReadHistoryResult>;

  /** Send poll */
  sendPoll?(target: string, question: string, options: string[], opts?: { duration?: number }): Promise<MessageSendResult>;

  /** Send inline keyboard */
  sendKeyboard?(target: string, text: string, keyboard: InlineKeyboardMarkup): Promise<MessageSendResult>;

  /** Edit message with keyboard */
  editMessageMarkup?(target: string, messageId: string, text: string, keyboard?: InlineKeyboardMarkup): Promise<MessageActionResult>;

  /** Maximum message length for this channel */
  maxLength?: number;
}

/** Stream placeholder options */
export interface StreamPlaceholderOpts {
  /** Initial placeholder text */
  text?: string;
  /** Thread/topic ID */
  threadId?: string;
  /** Reply to message ID */
  replyTo?: string;
  parseMode?: "Markdown" | "HTML" | "plain";
}

/** Stream edit options */
export interface StreamEditOpts {
  parseMode?: "Markdown" | "HTML" | "plain";
}

/** Streaming configuration */
export interface StreamingConfig {
  /** Minimum ms between edits */
  editThrottleMs?: number;
  /** Stop editing at this character count */
  editCutoffChars?: number;
  /** Minimum chars before first edit */
  streamStartChars?: number;
}

/** Channel streaming adapter for live updates */
export interface ChannelStreamingAdapter {
  /** Create placeholder message, return message ID */
  createPlaceholder(target: string, opts?: StreamPlaceholderOpts): Promise<{ messageId: string }>;

  /** Edit existing message */
  editMessage(target: string, messageId: string, text: string, opts?: StreamEditOpts): Promise<boolean>;

  /** Show typing indicator */
  setTyping?(target: string, active: boolean): Promise<void>;

  /** Channel-specific streaming config */
  config?: StreamingConfig;

  /** Block streaming: wait until minChars before sending first chunk */
  blockStreaming?: boolean;

  /** Block streaming coalescing defaults: wait until minChars or idleMs before delivery */
  blockStreamingCoalesceDefaults?: { minChars?: number; idleMs?: number };
}

/** Access check context */
export interface AccessCheckContext {
  channel: string;
  chatType: "dm" | "group" | "channel" | "thread";
  chatId?: string;
  accountId?: string;
}

/** Access check result */
export interface AccessResult {
  allowed: boolean;
  reason?: string;
  /** Generated pairing code if needed */
  pairingCode?: string;
}

/** Channel security adapter */
export interface ChannelSecurityAdapter {
  /** DM access policy */
  dmPolicy: DmPolicy;
  /** Static allowlist */
  dmAllowFrom?: Array<string | number>;
  /** Supports pairing flow */
  supportsPairing?: boolean;
  /** Account ID for scoped allowlist */
  accountId?: string;
  /** Custom access check */
  checkAccess?(senderId: string, context: AccessCheckContext): AccessResult | Promise<AccessResult>;
}

/** Channel plugin - implements a messaging channel */
export interface InteractionAdapter {
  handle(event: InteractionEvent): Promise<boolean>;
}

export interface ChannelPlugin {
  /** Unique channel identifier (e.g., "telegram", "discord") */
  readonly id: string;

  /** Channel metadata */
  readonly meta: ChannelMeta;

  /** Channel capabilities */
  readonly capabilities: ChannelCapabilities;

  /** Outbound messaging interface */
  readonly outbound: ChannelOutbound;

  /** Optional target resolver from session state to outbound target */
  resolveTarget?(params: {
    chatId: string;
    sessionKey?: SessionKey;
    session?: SessionState;
  }): string;

  /** Initialize channel with gateway context */
  init(api: GatewayPluginApi): Promise<void>;

  /** Start receiving messages */
  start(): Promise<void>;

  /** Graceful shutdown */
  stop(): Promise<void>;

  /** Optional: streaming adapter */
  streaming?: ChannelStreamingAdapter;

  /** Optional: security adapter */
  security?: ChannelSecurityAdapter;

  /** Optional: platform-native command sync adapter */
  nativeCommands?: NativeCommandAdapter;

  /** Optional: platform interaction adapter */
  interactions?: InteractionAdapter;
}

// ============================================================================
// Tool Plugin Types
// ============================================================================

/** Tool context during execution */
export interface ToolContext {
  /** Current session key */
  sessionKey: SessionKey;
  /** Logger instance */
  logger: Logger;
  /** Message source that triggered the tool */
  source?: MessageSource;
}

/** Tool execution result */
export interface ToolResult {
  /** Result content blocks */
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  /** Whether execution resulted in error */
  isError?: boolean;
}

/** Tool plugin - provides agent tools */
export interface ToolPlugin {
  /** Plugin name */
  readonly name: string;
  /** Plugin description */
  readonly description: string;
  /** Available tools */
  readonly tools: DomainToolDefinition[];

  /** Execute a tool */
  execute(toolName: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ============================================================================
// Background Service Types
// ============================================================================

/** Background service - long-running task */
export interface BackgroundService {
  /** Service name */
  readonly name: string;
  /** Service description */
  readonly description?: string;

  /** Start service */
  start(api: GatewayPluginApi): Promise<void>;

  /** Stop service */
  stop(): Promise<void>;
}

// ============================================================================
// Command Handler Types
// ============================================================================

/** Slash command context */
export interface CommandContext {
  /** Current session */
  sessionKey: SessionKey;
  /** Sender identifier */
  senderId: string;
  /** Channel name */
  channel: string;
  /** Chat identifier */
  chatId?: string;
  /** Account identifier */
  accountId?: string;
  /** Command arguments */
  args: string;
  /** Response function */
  respond: (text: string) => Promise<void>;
  /** Structured response for rich channel-native interactions */
  respondWith?: (response: CommandResponse) => Promise<void>;
}

/** Command handler function */
export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

/** CLI command handler */
export type CliCommandHandler = (args: string[], flags: Record<string, string | boolean>) => void | Promise<void>;

/** CLI program interface */
export interface CliProgram {
  /** Register a command */
  command(name: string, description: string, handler: CliCommandHandler): void;
}

// ============================================================================
// HTTP/WebSocket Types
// ============================================================================

/** HTTP request handler */
export type HttpHandler = (req: Request) => Response | Promise<Response>;

/** WebSocket method handler */
export type WsMethodHandler = (
  params: Record<string, unknown>,
  ctx: { clientId: string; sessionKey?: SessionKey },
) => unknown | Promise<unknown>;

// ============================================================================
// Gateway Plugin API - Main Interface
// ============================================================================

/** Dispatch result */
export interface DispatchResult {
  /** Message was injected into active stream */
  injected?: boolean;
  /** Message was enqueued for processing */
  enqueued?: boolean;
}

/** Outbound message for dispatch */
export interface OutboundMessage {
  id?: string;
  sessionKey?: SessionKey;
  text: string;
  channel: string;
  target: string;
  timestamp?: number;
}

/** Plugin manifest for loading */
export interface PluginManifest {
  /** Unique plugin ID */
  id: string;
  /** Plugin name */
  name: string;
  /** Semantic version */
  version?: string;
  /** Description */
  description?: string;
  /** Entry point module */
  main: string;
}

/**
 * Gateway Plugin API - Main interface provided to plugins.
 *
 * This extends the domain PluginApi with interface-layer functionality
 * like channel registration, command handling, and HTTP routes.
 */
export interface GatewayPluginApi extends DomainPluginApi {
  /** Plugin metadata */
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Plugin source (builtin/external/workspace) */
  readonly source: string;

  /** Gateway configuration (read-only) */
  readonly config: Config;

  /** Plugin-specific configuration */
  readonly pluginConfig?: Record<string, unknown>;

  /** RPC process pool (optional, available after gateway start) */
  readonly rpcPool?: RpcPool;

  /** Cron engine (optional, available when cron is enabled) */
  readonly cronEngine?: CronEngine;

  /** Model health tracker (optional, available when failover is enabled) */
  readonly modelHealth?: ModelHealthTracker | null;

  // Registration methods

  /** Register a messaging channel */
  registerChannel(channel: ChannelPlugin): void;

  /** Register a tool plugin (extended signature) */
  registerTool(name: string, tool: DomainToolDefinition): void;
  registerTool(plugin: ToolPlugin): void;

  /** Register lifecycle hooks */
  registerHook(events: PluginHookName[], handler: HookHandler): void;

  /** Register a background service */
  registerService(service: BackgroundService): void;

  /** Register an HTTP route */
  registerHttpRoute(method: string, path: string, handler: HttpHandler): void;

  /** Register a WebSocket method */
  registerGatewayMethod(method: string, handler: WsMethodHandler): void;

  /** Register a slash command */
  registerCommand(name: string, handler: CommandHandler, meta?: { description?: string; exposeInNativeUi?: boolean; group?: string; supportsArgs?: boolean }): void;

  /** Register CLI commands */
  registerCli(registrar: (program: CliProgram) => void): void;

  /** Shorthand for single hook registration */
  on<T extends PluginHookName>(hook: T, handler: TypedHookHandler<T>): void;
  on(hook: string, handler: HookHandler): void;

  // Session operations

  /** Dispatch message to agent pipeline */
  dispatch(msg: InboundMessage & Record<string, unknown>): Promise<DispatchResult>;

  /** Send message to specific channel target */
  sendToChannel(channel: string, target: string, text: string): Promise<void>;

  /** Get session state */
  getSessionState(sessionKey: SessionKey): SessionState | null;

  /** Reset session */
  resetSession(sessionKey: SessionKey): Promise<void>;

  /** Set thinking level */
  setThinkingLevel(sessionKey: SessionKey, level: string): Promise<void>;

  /** Cycle to next thinking level (returns new level) */
  cycleThinkingLevel(sessionKey: SessionKey): Promise<string | undefined>;

  /** Set model for session */
  setModel(sessionKey: SessionKey, provider: string, modelId: string): Promise<void>;

  /** Get available models */
  getAvailableModels(sessionKey: SessionKey): Promise<unknown[]>;

  /** Compact session context */
  compactSession(sessionKey: SessionKey, instructions?: string): Promise<void>;

  /** Abort current agent run */
  abortSession(sessionKey: SessionKey): Promise<void>;

  /** Forward command to RPC agent */
  forwardCommand(sessionKey: SessionKey, command: string, args: string): Promise<void>;

  /** Get available pi slash commands */
  getPiCommands(sessionKey: SessionKey): Promise<{ name: string; description?: string }[]>;
  syncNativeCommands?(channelId: string, commands: NativeCommandSpec[]): Promise<void>;

  /** Get session statistics */
  getSessionStats(sessionKey: SessionKey): Promise<SessionStats | null>;

  /** Get RPC process state */
  getRpcState(sessionKey: SessionKey): Promise<RpcState | null>;

  // Utility methods

  /** Broadcast event to all WebSocket clients */
  broadcastToWs(event: string, payload: unknown): void;

  /** Get effective session message mode */
  getSessionMessageMode(sessionKey: SessionKey): Promise<"steer" | "follow-up" | "interrupt">;

  /** Set session message mode override */
  setSessionMessageMode(sessionKey: SessionKey, mode: "steer" | "follow-up" | "interrupt"): Promise<void>;

  /** List available roles */
  listAvailableRoles(): string[];

  /** Set session role */
  setSessionRole(sessionKey: SessionKey, role: string): Promise<boolean>;

  /** Create new role */
  createRole(role: string): Promise<{ ok: boolean; error?: string }>;

  /** Delete role */
  deleteRole(role: string): Promise<{ ok: boolean; error?: string }>;

  /** Get session statistics */
  getSessionStats(sessionKey: SessionKey): Promise<SessionStats | null>;

  /** Get RPC process state */
  getRpcState(sessionKey: SessionKey): Promise<RpcState | null>;

  /** List all active sessions (sorted by last activity desc) */
  listSessions(): SessionInfo[];

  /** Release RPC session */
  releaseSession(sessionKey: SessionKey): void;

  /** Read session transcript (last N entries) */
  readTranscript(sessionKey: SessionKey, lastN?: number): TranscriptEntry[];

  /** System events queue (runtime) */
  readonly systemEvents?: unknown;

  /** Session store (runtime) */
  readonly sessionStore?: unknown;

  /** Request heartbeat check */
  requestHeartbeat?: (agentId: string, reason?: string) => void;

  /** Get registered channels */
  getChannels?: () => Map<string, ChannelPlugin>;

  /** Allow additional runtime properties */
  [key: string]: unknown;
}

/** Session statistics - aligned with pi's SessionStats */
export interface SessionStats {
  sessionFile: string | undefined;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

/** Model info from RPC state */
export interface RpcModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
}

/** RPC process state - aligned with pi's get_state response */
export interface RpcState {
  model: RpcModelInfo | undefined;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: string;
  followUpMode: string;
  sessionFile: string | undefined;
  sessionId: string;
  sessionName: string | undefined;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

/** Session info for listSessions */
export interface SessionInfo {
  sessionKey: SessionKey;
  role: string | null;
  lastActivity?: number;
  messageCount?: number;
}

/** Transcript entry */
export interface TranscriptEntry {
  /** ISO timestamp */
  ts: string;
  /** Event category */
  cat: "prompt" | "event" | "response" | "error" | "meta";
  /** Specific type within category */
  type: string;
  /** Session key */
  session: string;
  /** Payload (varies by type) */
  data?: Record<string, unknown>;
  /** Legacy compat fields */
  role?: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;
}

/** Session state subset exposed to plugins */
export interface SessionState {
  sessionKey: SessionKey;
  role: string | null;
  model?: { provider: string; modelId: string };
  thinkingLevel?: string;
  isStreaming: boolean;
  messageCount: number;
  lastChatId?: string;
  lastChannel?: string;
  lastAccountId?: string;
  lastChatType?: "dm" | "group" | "channel" | "thread";
  lastTopicId?: string;
  lastThreadId?: string;
}

// ============================================================================
// Plugin Hook Names
// ============================================================================

/** Plugin lifecycle hook names */
export type PluginHookName =
  // Agent lifecycle
  | "before_agent_start"
  | "agent_end"
  // Message lifecycle
  | "message_received"
  | "message_sending"
  | "message_sent"
  // Tool lifecycle
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  // Session lifecycle
  | "session_start"
  | "session_end"
  | "session_reset"
  // Compaction lifecycle
  | "before_compaction"
  | "after_compaction"
  // Gateway lifecycle
  | "gateway_start"
  | "gateway_stop";

/** Hook payload type mapping */
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

/** Typed hook handler */
export type TypedHookHandler<T extends PluginHookName> = (
  payload: HookPayload[T],
) => void | Promise<void>;
