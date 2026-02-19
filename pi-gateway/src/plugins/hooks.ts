/**
 * Hook registry and dispatch system.
 *
 * Aligned with OpenClaw's dual hook system:
 * - PluginHookName typed hooks via api.on()
 * - Generic hooks via api.registerHook()
 *
 * Hooks run in registration order. Errors in one handler don't block others.
 */

import { createLogger, type Logger } from "../core/types.ts";
import type { HookHandler, HookPayload, PluginHookName } from "./types.ts";

// ============================================================================
// Hook Registry
// ============================================================================

interface RegisteredHook {
  pluginId: string;
  event: PluginHookName;
  handler: HookHandler<any>;
}

export class HookRegistry {
  private hooks: RegisteredHook[] = [];
  private log: Logger;

  constructor() {
    this.log = createLogger("hooks");
  }

  /**
   * Register a hook handler for one or more events.
   */
  register(pluginId: string, events: PluginHookName[], handler: HookHandler<any>): void {
    for (const event of events) {
      this.hooks.push({ pluginId, event, handler });
      this.log.debug(`Registered hook: ${pluginId} → ${event}`);
    }
  }

  /**
   * Dispatch an event to all registered handlers.
   * Handlers run sequentially in registration order.
   * Errors are logged but don't stop other handlers.
   */
  async dispatch<T extends PluginHookName>(event: T, payload: HookPayload[T]): Promise<void> {
    const handlers = this.hooks.filter((h) => h.event === event);
    if (handlers.length === 0) return;

    this.log.debug(`Dispatching ${event} to ${handlers.length} handler(s)`);

    for (const { pluginId, handler } of handlers) {
      try {
        await handler(payload);
      } catch (err) {
        this.log.error(`Hook error in ${pluginId}/${event}:`, err);
      }
    }
  }

  /**
   * Check if any handlers are registered for an event.
   */
  hasHandlers(event: PluginHookName): boolean {
    return this.hooks.some((h) => h.event === event);
  }

  /**
   * Get all registered hooks for diagnostics.
   */
  getRegistered(): Array<{ pluginId: string; event: PluginHookName }> {
    return this.hooks.map(({ pluginId, event }) => ({ pluginId, event }));
  }

  /**
   * Remove all hooks registered by a specific plugin.
   * Used during hot reload teardown.
   */
  removeByPlugin(pluginId: string): void {
    const beforeCount = this.hooks.length;
    this.hooks = this.hooks.filter((h) => h.pluginId !== pluginId);
    const removed = beforeCount - this.hooks.length;
    if (removed > 0) {
      this.log.debug(`Removed ${removed} hook(s) for plugin: ${pluginId}`);
    }
  }
}
