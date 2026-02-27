/**
 * Plugin hot reload system.
 *
 * MVP scope (T1-T3):
 * - Tool plugins: remove old, register new
 * - Commands: Map.delete then register
 * - HTTP routes: filter out old, add new
 * - WS methods: Map.delete then register
 * - Hooks: removeByPlugin then re-register
 *
 * TODO (T4-T5): Not yet implemented
 * - T4: Background services hot reload (graceful stop + state migration + restart)
 * - T5: Channel plugins hot reload (pause + disconnect + reconnect + resume)
 *
 * Limitations:
 * - No state preservation across reloads
 * - Background services must be stoppable
 * - Channels are stopped and recreated
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createLogger, type Logger } from "../core/types.ts";
import type {
  PluginManifest,
  PluginFactory,
  GatewayPluginApi,
  ReloadResult,
} from "./types.ts";
import type { PluginLoader, LoadedPluginInfo, PluginRegistryState } from "./loader.ts";

export class PluginReloader {
  private log: Logger;

  constructor(
    private loader: PluginLoader,
    private registry: PluginRegistryState,
    private apiFactory: (pluginId: string, manifest: PluginManifest) => GatewayPluginApi,
  ) {
    this.log = createLogger("plugin-reloader");
  }

  /**
   * Reload a plugin by ID.
   * 1. Teardown existing plugin
   * 2. Reimport module with cache busting
   * 3. Register new module
   */
  async reload(pluginId: string): Promise<ReloadResult> {
    const timestamp = Date.now();
    this.log.info(`Starting reload: ${pluginId}`);

    const info = this.loader.getPluginInfo(pluginId);
    if (!info) {
      return {
        success: false,
        pluginId,
        error: `Plugin ${pluginId} is not loaded`,
        timestamp,
      };
    }

    // Skip builtin plugins (they don't have a real path we can reimport)
    if (info.source === "builtin") {
      return {
        success: false,
        pluginId,
        error: "Cannot reload builtin plugins (requires gateway restart)",
        timestamp,
      };
    }

    const entryPath = resolve(info.path!, info.manifest.main);
    if (!existsSync(entryPath)) {
      return {
        success: false,
        pluginId,
        error: `Entry point not found: ${entryPath}`,
        timestamp,
      };
    }

    try {
      // Step 1: Teardown existing plugin
      await this.teardown(pluginId);

      // Step 2: Reimport module with cache busting
      const module = await this.reimport(entryPath);

      // Step 3: Register new module
      await this.register(pluginId, module, info);

      this.log.info(`Reload complete: ${pluginId}`);
      return {
        success: true,
        pluginId,
        timestamp: Date.now(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.error(`Reload failed for ${pluginId}:`, error);
      return {
        success: false,
        pluginId,
        error,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Teardown a plugin: remove all its registrations.
   * Delegates to PluginLoader.teardownPlugin.
   */
  private async teardown(pluginId: string): Promise<void> {
    this.log.debug(`Tearing down: ${pluginId}`);
    await this.loader.teardownPlugin(pluginId);
  }

  /**
   * Reimport a module with cache busting.
   * Uses timestamp query parameter to bypass ESM cache.
   */
  private async reimport(path: string): Promise<unknown> {
    const url = pathToFileURL(path).href;
    const bustedUrl = `${url}?t=${Date.now()}`;
    this.log.debug(`Reimporting: ${bustedUrl}`);
    return import(bustedUrl);
  }

  /**
   * Register a reloaded module.
   * Reconstructs the plugin manifest and API context.
   */
  private async register(
    pluginId: string,
    module: unknown,
    info: LoadedPluginInfo,
  ): Promise<void> {
    const factory = (module as Record<string, unknown>)?.default ?? module;
    const api = this.apiFactory(pluginId, info.manifest);

    if (typeof factory === "function") {
      await factory(api);
    } else if (factory && "register" in (factory as Record<string, unknown>)) {
      await (factory as { register(api: GatewayPluginApi): Promise<void> }).register(api);
    } else {
      throw new Error(`Plugin ${pluginId} does not export a valid factory`);
    }

    // Restore loaded plugin info
    (this.loader as unknown as { loaded: Map<string, LoadedPluginInfo> }).loaded.set(
      pluginId,
      info,
    );

    this.log.info(`Registered: ${pluginId}`);
  }

  /**
   * List all reloadable plugins (non-builtin).
   */
  listReloadable(): string[] {
    const reloadable: string[] = [];
    for (const [id, info] of this.loader.getLoadedPlugins()) {
      if (info.source !== "builtin") {
        reloadable.push(id);
      }
    }
    return reloadable;
  }
}
