/**
 * Domain Layer - Plugin System
 *
 * Plugin interfaces and types for the gateway extension system.
 * No distinction between builtin and external plugins - all plugins are equal.
 */

import type { Logger, Result } from "../types.ts";

// ============================================================================
// Plugin Metadata
// ============================================================================

export interface PluginMetadata {
  /** Unique plugin identifier (e.g., 'telegram-channel', 'cron-tools') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Description of plugin functionality */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Plugin dependencies - list of plugin IDs this plugin depends on */
  dependencies?: string[];
  /** Plugin tags for categorization */
  tags?: string[];
}

// ============================================================================
// Plugin Status
// ============================================================================

export type PluginStatus =
  | "inactive"      // Plugin loaded but not initialized
  | "initializing"  // Init in progress
  | "active"        // Fully operational
  | "error"         // Error state
  | "stopping"      // Stop in progress
  | "unloaded";     // Cleaned up

// ============================================================================
// Plugin API (provided to plugins during initialization)
// ============================================================================

/**
 * Hook context passed to hook handlers.
 */
export interface HookContext {
  /** Hook type/name */
  readonly hook: string;
  /** Hook payload data */
  readonly data: unknown;
  /** Abort further processing */
  abort(): void;
  /** Check if aborted */
  readonly isAborted: boolean;
}

/**
 * Hook handler function type.
 */
export type HookHandler = (context: HookContext) => Promise<void> | void;

/**
 * Tool parameter definition.
 */
export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

/**
 * Tool definition for registration.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

/**
 * Tool handler function.
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Plugin configuration accessor.
 */
export interface PluginConfigApi {
  /** Get full plugin configuration */
  get<T = unknown>(): T;
  /** Get specific key from configuration */
  get<T = unknown>(key: string): T | undefined;
  /** Get with default fallback */
  get<T = unknown>(key: string, defaultValue: T): T;
}

/**
 * API provided to plugins during initialization.
 * This is the contract between gateway and plugins.
 */
export interface PluginApi {
  /** Plugin-scoped logger */
  readonly logger: Logger;

  /** Plugin configuration */
  readonly config: PluginConfigApi;

  /** Register a hook handler */
  onHook(name: string, handler: HookHandler): void;

  /** Register multiple hooks at once */
  onHooks(hooks: Record<string, HookHandler>): void;

  /** Register a custom tool */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;

  /** Emit an event to the gateway */
  emitEvent(type: string, payload: unknown): void;

  /** Get another plugin's public API (if exposed) */
  getPlugin<T = unknown>(pluginId: string): T | undefined;
}

// ============================================================================
// Plugin Interface (implemented by all plugins)
// ============================================================================

/**
 * Base plugin interface - all plugins must implement this.
 * No privilege distinction between builtin and external plugins.
 */
export interface Plugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /** Current plugin status */
  readonly status: PluginStatus;

  /**
   * Initialize the plugin.
   * Called once when plugin is loaded.
   * @param api - Plugin API for interacting with gateway
   * @returns Promise that resolves when initialization is complete
   */
  init?(api: PluginApi): Promise<void>;

  /**
   * Start the plugin.
   * Called after all plugins are initialized.
   * Plugin should begin active operation.
   */
  start?(): Promise<void>;

  /**
   * Stop the plugin.
   * Called during graceful shutdown or plugin reload.
   * Plugin should cease active operation but preserve state.
   */
  stop?(): Promise<void>;

  /**
   * Unload the plugin.
   * Called before plugin is removed.
   * Plugin should clean up all resources.
   */
  unload?(): Promise<void>;
}

/**
 * Plugin constructor type.
 */
export type PluginConstructor = new () => Plugin;

/**
 * Plugin factory function type.
 */
export type PluginFactory = () => Plugin | Promise<Plugin>;

// ============================================================================
// Plugin Events
// ============================================================================

export type PluginEventType =
  | "plugin_loaded"
  | "plugin_initialized"
  | "plugin_started"
  | "plugin_stopped"
  | "plugin_error"
  | "plugin_unloaded";

export interface PluginEvent {
  type: PluginEventType;
  pluginId: string;
  timestamp: number;
  error?: Error;
}

// ============================================================================
// Plugin Load Result
// ============================================================================

export type PluginLoadResult = Result<Plugin, PluginLoadError>;

export interface PluginLoadError {
  code: string;
  message: string;
  cause?: Error;
}

// ============================================================================
// Re-exports
// ============================================================================

export type {
  Logger,
  Result,
} from "../types.ts";
