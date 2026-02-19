/**
 * Plugin hot reload tests.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginReloader } from "./reloader.ts";
import { PluginLoader, createPluginRegistry, type PluginRegistryState } from "./loader.ts";
import { DEFAULT_CONFIG, type Config } from "../core/config.ts";
import { createLogger, type Logger } from "../core/types.ts";
import type {
  GatewayPluginApi,
  PluginManifest,
  ToolPlugin,
  PluginHookName,
  HookHandler,
  HttpHandler,
  WsMethodHandler,
  CommandHandler,
  BackgroundService,
  ChannelPlugin,
} from "./types.ts";

const tempDirs: string[] = [];

function cleanup() {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mkConfig(pluginDir: string): Config {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
  config.plugins.dirs = [pluginDir];
  return config;
}

function createMockApiFactory(
  config: Config,
  registry: PluginRegistryState,
): (pluginId: string, manifest: PluginManifest) => GatewayPluginApi {
  return (pluginId: string, manifest: PluginManifest): GatewayPluginApi => ({
    id: pluginId,
    name: manifest.name,
    source: "gateway",
    config,
    pluginConfig: config.plugins.config?.[pluginId],
    logger: createLogger(`test:${pluginId}`),
    registerChannel(channel: ChannelPlugin) {
      (channel as any).__pluginId = pluginId;
      registry.channels.set(channel.id, channel);
    },
    registerTool(tool: ToolPlugin) {
      (tool as any).__pluginId = pluginId;
      registry.tools.set(tool.name, tool);
    },
    registerHook(events: PluginHookName[], handler: HookHandler): void {
      registry.hooks.register(pluginId, events, handler);
    },
    registerHttpRoute(method: string, path: string, handler: HttpHandler): void {
      registry.httpRoutes.push({ method, path, handler, pluginId });
    },
    registerGatewayMethod(method: string, handler: WsMethodHandler): void {
      registry.gatewayMethods.set(method, { handler, pluginId });
    },
    registerCommand(name: string, handler: CommandHandler): void {
      registry.commands.set(name, { pluginId, handler });
    },
    registerService(service: BackgroundService): void {
      (service as any).__pluginId = pluginId;
      registry.services.push(service);
    },
    registerCli(registrar: (program: unknown) => void): void {
      registry.cliRegistrars.push({ pluginId, registrar: registrar as any });
    },
    on<T extends PluginHookName>(hook: T, handler: HookHandler<T>): void {
      registry.hooks.register(pluginId, [hook], handler);
    },
    async dispatch() { return {}; },
    async sendToChannel(): Promise<void> {},
    getSessionState() { return null; },
    async resetSession(): Promise<void> {},
    async setThinkingLevel(): Promise<void> {},
    async setModel(): Promise<void> {},
    async getAvailableModels(): Promise<unknown[]> { return []; },
    async getSessionMessageMode(): Promise<"steer" | "follow-up" | "interrupt"> { return "steer"; },
    async setSessionMessageMode(): Promise<void> {},
    async compactSession(): Promise<void> {},
    async abortSession(): Promise<void> {},
    async forwardCommand(): Promise<void> {},
    async getPiCommands(): Promise<{ name: string; description?: string }[]> { return []; },
    async getSessionStats(): Promise<unknown> { return null; },
    async getRpcState(): Promise<unknown> { return null; },
    listSessions() { return []; },
    releaseSession(): void {},
    readTranscript() { return []; },
  });
}

describe("PluginReloader", () => {
  let root: string;
  let config: Config;
  let registry: PluginRegistryState;
  let loader: PluginLoader;
  let reloader: PluginReloader;
  let apiFactory: (pluginId: string, manifest: PluginManifest) => GatewayPluginApi;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pi-gw-reload-"));
    tempDirs.push(root);
    config = mkConfig(root);
    registry = createPluginRegistry();
    apiFactory = createMockApiFactory(config, registry);
    loader = new PluginLoader(config, registry, apiFactory);
    reloader = new PluginReloader(loader, registry, apiFactory);
  });

  afterEach(() => {
    cleanup();
  });

  test("reload fails for non-existent plugin", async () => {
    const result = await reloader.reload("non-existent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not loaded");
  });

  test("reload fails for builtin plugins", async () => {
    // Manually inject a builtin plugin entry (simulating loaded builtin)
    (loader as unknown as { loaded: Map<string, { source: string }> }).loaded.set("telegram", {
      source: "builtin",
      manifest: { id: "telegram", name: "Telegram", main: "telegram.ts" },
    } as any);

    // Try to reload a builtin
    const result = await reloader.reload("telegram");
    expect(result.success).toBe(false);
    expect(result.error).toContain("builtin");
  });

  test("reload succeeds for external plugins", async () => {
    const pluginDir = join(root, "test-plugin");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({
      id: "test-plugin",
      name: "Test Plugin",
      main: "index.ts",
    }, null, 2));

    writeFileSync(join(pluginDir, "index.ts"), `
export default function register(api) {
  api.registerTool({
    name: "test-tool",
    description: "A test tool",
    tools: [],
    async execute() {
      return { content: [{ type: "text", text: "test" }] };
    },
  });
}
`);

    // Load the plugin
    await loader.loadAll();

    // Verify plugin is loaded
    expect(loader.getPluginInfo("test-plugin")).toBeDefined();
    expect(registry.tools.has("test-tool")).toBe(true);

    // Reload the plugin
    const result = await reloader.reload("test-plugin");
    expect(result.success).toBe(true);

    // Verify plugin is still registered after reload
    expect(loader.getPluginInfo("test-plugin")).toBeDefined();
    expect(registry.tools.has("test-tool")).toBe(true);
  });

  test("listReloadable returns only external plugins", async () => {
    // Create external plugin
    const pluginDir = join(root, "external-plugin");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({
      id: "external-plugin",
      name: "External Plugin",
      main: "index.ts",
    }, null, 2));

    writeFileSync(join(pluginDir, "index.ts"), `export default function() {}`);

    // Load all
    await loader.loadAll();
    await loader.loadBuiltins();

    const reloadable = reloader.listReloadable();
    expect(reloadable).toContain("external-plugin");
    expect(reloadable).not.toContain("telegram");
    expect(reloadable).not.toContain("webchat");
  });

  test("teardown removes all plugin registrations", async () => {
    const pluginDir = join(root, "full-plugin");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({
      id: "full-plugin",
      name: "Full Plugin",
      main: "index.ts",
    }, null, 2));

    writeFileSync(join(pluginDir, "index.ts"), `
export default function register(api) {
  api.registerTool({
    name: "full-tool",
    description: "Test tool",
    tools: [],
    async execute() { return { content: [] }; },
  });
  api.registerCommand("testcmd", async () => {});
  api.registerHttpRoute("GET", "/test", () => new Response("ok"));
  api.registerGatewayMethod("testMethod", () => ({}));
  api.registerHook(["gateway_stop"], () => {});
}
`);

    await loader.loadAll();

    // Get initial count of hooks for gateway_stop
    const initialHookCount = registry.hooks.getRegistered().filter(h => h.event === "gateway_stop").length;

    // Verify all registrations
    expect(registry.tools.has("full-tool")).toBe(true);
    expect(registry.commands.has("testcmd")).toBe(true);
    expect(registry.httpRoutes.some(r => r.path === "/test")).toBe(true);
    expect(registry.gatewayMethods.has("testMethod")).toBe(true);
    expect(registry.hooks.getRegistered().some(h => h.pluginId === "full-plugin")).toBe(true);

    // Teardown
    await loader.teardownPlugin("full-plugin");

    // Verify all removed
    expect(registry.tools.has("full-tool")).toBe(false);
    expect(registry.commands.has("testcmd")).toBe(false);
    expect(registry.httpRoutes.some(r => r.path === "/test")).toBe(false);
    expect(registry.gatewayMethods.has("testMethod")).toBe(false);
    expect(registry.hooks.getRegistered().some(h => h.pluginId === "full-plugin")).toBe(false);
  });
});
