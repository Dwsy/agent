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
}

export interface SendOptions {
  replyTo?: string;
  parseMode?: "Markdown" | "HTML" | "plain";
}

export interface MediaSendOptions extends SendOptions {
  /** Media type hint (auto-detected from extension if omitted) */
  type?: "photo" | "audio" | "document" | "video";
  /** Caption text */
  caption?: string;
}

export interface MediaSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelPlugin {
  /** Unique channel identifier, e.g. "telegram", "discord", "webchat" */
  id: string;
  meta: ChannelPluginMeta;
  capabilities: ChannelPluginCapabilities;

  outbound: {
    /** Send text to a target in this channel */
    sendText(target: string, text: string, opts?: SendOptions): Promise<void>;
    /** Send a media file to a target in this channel (optional — not all channels support media) */
    sendMedia?(target: string, filePath: string, opts?: MediaSendOptions): Promise<MediaSendResult>;
    /** Max message length for this channel (for chunking) */
    maxLength?: number;
  };

  /** Initialize with gateway context */
  init(api: GatewayPluginApi): Promise<void>;
  /** Start receiving messages */
  start(): Promise<void>;
  /** Graceful shutdown */
  stop(): Promise<void>;
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
  dispatch(msg: InboundMessage): Promise<void>;

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

  /** Access the cron engine for job management */
  readonly cronEngine?: import("../core/cron.ts").CronEngine;
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
