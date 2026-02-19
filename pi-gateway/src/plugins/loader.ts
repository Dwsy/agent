/**
 * Plugin discovery and loading.
 *
 * Discovery order (aligned with OpenClaw):
 *   1. config.plugins.dirs[]     — user-specified directories
 *   2. ~/.pi/gateway/plugins/    — global plugin directory
 *   3. builtin/                  — bundled plugins (telegram, discord, webchat)
 *
 * Each plugin directory must contain a `plugin.json` manifest.
 * First plugin with a given ID wins (higher precedence = earlier in scan order).
 */

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger, type Logger } from "../core/types.ts";
import type { Config } from "../core/config.ts";
import type {
  PluginManifest,
  PluginFactory,
  GatewayPluginApi,
  ChannelPlugin,
  CliProgram,
  ToolPlugin,
  BackgroundService,
  CommandHandler,
  HttpHandler,
  WsMethodHandler,
  PluginHookName,
  HookHandler,
} from "./types.ts";
import { HookRegistry } from "./hooks.ts";

// ============================================================================
// Plugin Registry (holds all registered components)
// ============================================================================

export type CliRegistrar = (program: CliProgram) => void;

export interface RegistrationConflict {
  type: "channel" | "tool" | "command" | "httpRoute" | "wsMethod";
  name: string;
  existingPlugin: string;
  newPlugin: string;
  resolution: "skipped" | "overwritten" | "duplicate";
}

export interface PluginRegistryState {
  channels: Map<string, ChannelPlugin>;
  tools: Map<string, ToolPlugin>;
  commands: Map<string, { pluginId: string; handler: CommandHandler }>;
  httpRoutes: Array<{ method: string; path: string; handler: HttpHandler; pluginId: string }>;
  gatewayMethods: Map<string, { handler: WsMethodHandler; pluginId: string }>;
  services: BackgroundService[];
  hooks: HookRegistry;
  cliRegistrars: Array<{ pluginId: string; registrar: CliRegistrar }>;
  conflicts: RegistrationConflict[];
}

export function createPluginRegistry(): PluginRegistryState {
  return {
    channels: new Map(),
    tools: new Map(),
    commands: new Map(),
    httpRoutes: [],
    gatewayMethods: new Map(),
    services: [],
    hooks: new HookRegistry(),
    cliRegistrars: [],
    conflicts: [],
  };
}

// ============================================================================
// Plugin Loader
// ============================================================================

export interface LoadedPluginInfo {
  manifest: PluginManifest;
  source: string;
  path?: string;
}

export class PluginLoader {
  private log: Logger;
  private loaded = new Map<string, LoadedPluginInfo>();

  constructor(
    private config: Config,
    private registry: PluginRegistryState,
    private apiFactory: (pluginId: string, manifest: PluginManifest) => GatewayPluginApi,
  ) {
    this.log = createLogger("plugins");
  }

  /**
   * Get loaded plugin info for hot reload.
   */
  getLoadedPlugins(): Map<string, LoadedPluginInfo> {
    return this.loaded;
  }

  /**
   * Get info for a specific loaded plugin.
   */
  getPluginInfo(pluginId: string): LoadedPluginInfo | undefined {
    return this.loaded.get(pluginId);
  }

  /**
   * Teardown a plugin: remove its registrations from all registries.
   * Used during hot reload.
   */
  async teardownPlugin(pluginId: string): Promise<void> {
    const info = this.loaded.get(pluginId);
    if (!info) {
      this.log.warn(`Cannot teardown: plugin ${pluginId} not loaded`);
      return;
    }

    // Stop background services registered by this plugin
    for (let i = this.registry.services.length - 1; i >= 0; i--) {
      const service = this.registry.services[i];
      if ((service as any).__pluginId === pluginId) {
        try {
          await service.stop();
          this.log.debug(`Stopped service: ${service.name}`);
        } catch (err) {
          this.log.error(`Error stopping service ${service.name}:`, err);
        }
        this.registry.services.splice(i, 1);
      }
    }

    // Remove channels
    for (const [id, channel] of this.registry.channels) {
      if ((channel as any).__pluginId === pluginId) {
        try {
          await channel.stop();
          this.log.debug(`Stopped channel: ${id}`);
        } catch (err) {
          this.log.error(`Error stopping channel ${id}:`, err);
        }
        this.registry.channels.delete(id);
      }
    }

    // Remove tools
    for (const [name, tool] of this.registry.tools) {
      if ((tool as any).__pluginId === pluginId) {
        this.registry.tools.delete(name);
        this.log.debug(`Removed tool: ${name}`);
      }
    }

    // Remove commands
    for (const [name, cmd] of this.registry.commands) {
      if (cmd.pluginId === pluginId) {
        this.registry.commands.delete(name);
        this.log.debug(`Removed command: ${name}`);
      }
    }

    // Remove HTTP routes
    const beforeRoutes = this.registry.httpRoutes.length;
    this.registry.httpRoutes = this.registry.httpRoutes.filter((r) => r.pluginId !== pluginId);
    const removedRoutes = beforeRoutes - this.registry.httpRoutes.length;
    if (removedRoutes > 0) {
      this.log.debug(`Removed ${removedRoutes} HTTP route(s)`);
    }

    // Remove WebSocket methods
    for (const [method, entry] of this.registry.gatewayMethods) {
      if (entry.pluginId === pluginId) {
        this.registry.gatewayMethods.delete(method);
        this.log.debug(`Removed WS method: ${method}`);
      }
    }

    // Remove hooks
    this.registry.hooks.removeByPlugin(pluginId);

    // Remove CLI registrars
    this.registry.cliRegistrars = this.registry.cliRegistrars.filter((r) => r.pluginId !== pluginId);

    // Remove from loaded map
    this.loaded.delete(pluginId);
    this.log.info(`Teardown complete: ${pluginId}`);
  }

  /**
   * Discover and load all plugins.
   */
  async loadAll(): Promise<{ loaded: string[]; errors: Array<{ id: string; error: string }> }> {
    const errors: Array<{ id: string; error: string }> = [];
    const candidates = this.discover();

    this.log.info(`Discovered ${candidates.length} plugin candidate(s)`);

    for (const { manifest, dir, source } of candidates) {
      // Skip disabled plugins
      if (this.config.plugins.disabled?.includes(manifest.id)) {
        this.log.debug(`Skipping disabled plugin: ${manifest.id}`);
        continue;
      }

      // Skip duplicates (first wins)
      if (this.loaded.has(manifest.id)) {
        this.log.debug(`Skipping duplicate plugin: ${manifest.id} (already loaded from ${this.loaded.get(manifest.id)!.source})`);
        continue;
      }

      try {
        await this.loadPlugin(manifest, dir, source);
        this.loaded.set(manifest.id, { manifest, source, path: dir });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.log.error(`Failed to load plugin ${manifest.id}: ${errMsg}`);
        errors.push({ id: manifest.id, error: errMsg });
      }
    }

    return { loaded: Array.from(this.loaded.keys()), errors };
  }

  /**
   * Load builtin plugins (telegram, discord, webchat).
   */
  async loadBuiltins(): Promise<void> {
    const builtinDir = join(import.meta.dir, "builtin");
    if (!existsSync(builtinDir)) return;

    const builtins = ["telegram", "discord", "webchat", "feishu", "cron", "heartbeat"];
    for (const name of builtins) {
      // Support both single-file (name.ts) and modular (name/index.ts) layouts
      let path = join(builtinDir, `${name}.ts`);
      const dirIndex = join(builtinDir, name, "index.ts");
      if (!existsSync(path) && existsSync(dirIndex)) {
        path = dirIndex;
      }
      if (!existsSync(path)) continue;
      if (this.loaded.has(name)) continue;
      if (this.config.plugins.disabled?.includes(name)) continue;

      // BG-004: Skip unconfigured channels to avoid cold-start SDK import cost.
      // Non-channel builtins (cron, heartbeat) use their own enabled checks.
      const isServicePlugin = name === "cron" || name === "heartbeat";
      if (!isServicePlugin && name !== "webchat") {
        const channelConfig = (this.config.channels as Record<string, any>)?.[name];
        if (!channelConfig || channelConfig.enabled === false) {
          this.log.debug(`Skipping unconfigured builtin: ${name}`);
          continue;
        }
      }

      try {
        const module = await import(path);
        const factory: PluginFactory = module.default ?? module;
        const manifest: PluginManifest = { id: name, name, main: `${name}.ts` };
        const api = this.apiFactory(name, manifest);

        if (typeof factory === "function") {
          await factory(api);
        } else if (factory && "register" in factory) {
          await factory.register(api);
        }

        this.loaded.set(name, { manifest, source: "builtin", path });
        this.log.info(`Loaded builtin plugin: ${name}`);
      } catch (err: unknown) {
        this.log.error(`Failed to load builtin ${name}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }
  }

  /**
   * Snapshot loaded plugin IDs in precedence order.
   */
  getLoadedPluginIds(): string[] {
    return Array.from(this.loaded.keys());
  }

  // ==========================================================================
  // Discovery
  // ==========================================================================

  private discover(): Array<{ manifest: PluginManifest; dir: string; source: string }> {
    const candidates: Array<{ manifest: PluginManifest; dir: string; source: string }> = [];

    // 1. Config-specified dirs
    for (const dir of this.config.plugins.dirs ?? []) {
      const resolved = dir.replace(/^~/, homedir());
      candidates.push(...this.scanDir(resolved, "config"));
    }

    // 2. Global plugin directory
    const globalDir = join(homedir(), ".pi", "gateway", "plugins");
    candidates.push(...this.scanDir(globalDir, "global"));

    return candidates;
  }

  private scanDir(dir: string, source: string): Array<{ manifest: PluginManifest; dir: string; source: string }> {
    const results: Array<{ manifest: PluginManifest; dir: string; source: string }> = [];

    if (!existsSync(dir)) return results;

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        const manifestPath = join(entryPath, "plugin.json");
        if (!existsSync(manifestPath)) continue;

        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
          if (manifest.id && manifest.main) {
            results.push({ manifest, dir: entryPath, source });
          }
        } catch {
          this.log.warn(`Invalid plugin.json in ${entryPath}`);
        }
      }
    } catch {
      // Directory not readable
    }

    return results;
  }

  // ==========================================================================
  // Loading
  // ==========================================================================

  private async loadPlugin(manifest: PluginManifest, dir: string, source: string): Promise<void> {
    const entryPath = resolve(dir, manifest.main);

    if (!existsSync(entryPath)) {
      throw new Error(`Entry point not found: ${entryPath}`);
    }

    const module = await import(entryPath);
    const factory: PluginFactory = module.default ?? module;
    const api = this.apiFactory(manifest.id, manifest);

    if (typeof factory === "function") {
      await factory(api);
    } else if (factory && "register" in factory) {
      await factory.register(api);
    } else {
      throw new Error(`Plugin ${manifest.id} does not export a valid factory`);
    }

    this.log.info(`Loaded plugin: ${manifest.id} (${source}: ${dir})`);
  }
}
