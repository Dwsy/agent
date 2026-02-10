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

export interface PluginRegistryState {
  channels: Map<string, ChannelPlugin>;
  tools: Map<string, ToolPlugin>;
  commands: Map<string, { pluginId: string; handler: CommandHandler }>;
  httpRoutes: Array<{ method: string; path: string; handler: HttpHandler; pluginId: string }>;
  gatewayMethods: Map<string, { handler: WsMethodHandler; pluginId: string }>;
  services: BackgroundService[];
  hooks: HookRegistry;
  cliRegistrars: Array<{ pluginId: string; registrar: CliRegistrar }>;
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
  };
}

// ============================================================================
// Plugin Loader
// ============================================================================

export class PluginLoader {
  private log: Logger;
  private loaded = new Map<string, { manifest: PluginManifest; source: string }>();

  constructor(
    private config: Config,
    private registry: PluginRegistryState,
    private apiFactory: (pluginId: string, manifest: PluginManifest) => GatewayPluginApi,
  ) {
    this.log = createLogger("plugins");
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
        this.loaded.set(manifest.id, { manifest, source });
      } catch (err: any) {
        const errMsg = err?.message ?? String(err);
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

    const builtins = ["telegram", "discord", "webchat"];
    for (const name of builtins) {
      const path = join(builtinDir, `${name}.ts`);
      if (!existsSync(path)) continue;
      if (this.loaded.has(name)) continue;
      if (this.config.plugins.disabled?.includes(name)) continue;

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

        this.loaded.set(name, { manifest, source: "builtin" });
        this.log.info(`Loaded builtin plugin: ${name}`);
      } catch (err: any) {
        this.log.error(`Failed to load builtin ${name}: ${err?.message}`);
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
