/**
 * Plugin Watcher - File system watcher for development mode.
 *
 * Automatically reloads plugins when their files change.
 * Uses fs.watch for efficient file system monitoring.
 */

import { watch, type FSWatcher } from "node:fs";
import { resolve, dirname } from "node:path";
import { createLogger } from "../core/types.ts";
import type { PluginReloader } from "./reloader.ts";

export interface WatcherOptions {
  /** Debounce time in ms (default: 500) */
  debounceMs?: number;
  /** File patterns to watch (default: [".ts", ".js"]) */
  extensions?: string[];
  /** Ignore patterns (default: ["node_modules", ".git"]) */
  ignore?: string[];
}

export class PluginReloaderWatcher {
  private log = createLogger("plugin-watcher");
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private options: Required<WatcherOptions>;

  constructor(
    private reloader: PluginReloader,
    options: WatcherOptions = {}
  ) {
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      extensions: options.extensions ?? [".ts", ".js"],
      ignore: options.ignore ?? ["node_modules", ".git", "dist", "build"],
    };
  }

  /**
   * Start watching a plugin directory.
   */
  watch(pluginId: string, pluginPath: string): void {
    if (this.watchers.has(pluginId)) {
      this.log.warn(`Already watching: ${pluginId}`);
      return;
    }

    const resolvedPath = resolve(pluginPath);
    this.log.info(`Starting watcher: ${pluginId} at ${resolvedPath}`);

    const watcher = watch(
      resolvedPath,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        // Check extension
        const ext = filename.slice(filename.lastIndexOf("."));
        if (!this.options.extensions.includes(ext)) {
          return;
        }

        // Check ignore patterns
        if (this.options.ignore.some((pattern) => filename.includes(pattern))) {
          return;
        }

        this.log.debug(`File changed: ${filename} (${eventType})`);
        this.handleChange(pluginId);
      }
    );

    this.watchers.set(pluginId, watcher);
  }

  /**
   * Stop watching a plugin.
   */
  unwatch(pluginId: string): void {
    const watcher = this.watchers.get(pluginId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(pluginId);

      // Clear any pending debounce
      const timer = this.debounceTimers.get(pluginId);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(pluginId);
      }

      this.log.info(`Stopped watcher: ${pluginId}`);
    }
  }

  /**
   * Stop all watchers.
   */
  stopAll(): void {
    for (const [pluginId, watcher] of this.watchers) {
      watcher.close();

      const timer = this.debounceTimers.get(pluginId);
      if (timer) {
        clearTimeout(timer);
      }
    }

    this.watchers.clear();
    this.debounceTimers.clear();
    this.log.info("All watchers stopped");
  }

  /**
   * Handle file change with debouncing.
   */
  private handleChange(pluginId: string): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(pluginId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(pluginId);

      this.log.info(`Auto-reloading: ${pluginId}`);
      const result = await this.reloader.reload(pluginId);

      if (result.success) {
        this.log.info(`Auto-reload successful: ${pluginId}`);
      } else {
        this.log.error(`Auto-reload failed: ${pluginId} - ${result.error}`);
      }
    }, this.options.debounceMs);

    this.debounceTimers.set(pluginId, timer);
  }

  /**
   * Get list of watched plugins.
   */
  getWatchedPlugins(): string[] {
    return Array.from(this.watchers.keys());
  }
}
