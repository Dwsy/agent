import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG, type Config } from "../core/config.ts";
import { createLogger } from "../core/types.ts";
import { createPluginRegistry, PluginLoader, type PluginRegistryState } from "./loader.ts";
import type {
  BackgroundService,
  ChannelPlugin,
  CommandHandler,
  GatewayPluginApi,
  HookHandler,
  HttpHandler,
  PluginHookName,
  PluginManifest,
  ToolPlugin,
  WsMethodHandler,
} from "./types.ts";

const tempDirs: string[] = [];

function mkConfig(pluginDir: string): Config {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
  config.plugins.dirs = [pluginDir];
  return config;
}

function createApiFactory(config: Config, registry: PluginRegistryState) {
  return (pluginId: string, manifest: PluginManifest): GatewayPluginApi => ({
    id: pluginId,
    name: manifest.name,
    source: "gateway",
    config,
    pluginConfig: config.plugins.config?.[pluginId],
    logger: createLogger(`test:${pluginId}`),
    registerChannel(channel: ChannelPlugin) {
      if (!registry.channels.has(channel.id)) {
        registry.channels.set(channel.id, channel);
      }
    },
    registerTool(tool: ToolPlugin) {
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
      registry.services.push(service);
    },
    registerCli(registrar: (program: unknown) => void): void {
      registry.cliRegistrars.push({ pluginId, registrar: registrar as any });
    },
    on<T extends PluginHookName>(hook: T, handler: HookHandler<T>): void {
      registry.hooks.register(pluginId, [hook], handler);
    },
    async dispatch(): Promise<void> {},
    async sendToChannel(): Promise<void> {},
    getSessionState() {
      return null;
    },
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
  });
}

describe("plugin loader precedence", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("external plugin with same id is loaded before builtin", async () => {
    const root = mkdtempSync(join(tmpdir(), "pi-gw-loader-"));
    tempDirs.push(root);
    const pluginDir = join(root, "telegram");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({
      id: "telegram",
      name: "External Telegram",
      main: "index.ts",
    }, null, 2));

    writeFileSync(join(pluginDir, "index.ts"), `
export default function register(api) {
  api.registerChannel({
    id: "telegram",
    meta: { label: "External Telegram" },
    capabilities: { direct: true },
    outbound: { async sendText() {} },
    async init() {},
    async start() {},
    async stop() {},
  });
}
`);

    const config = mkConfig(root);
    const registry = createPluginRegistry();
    const loader = new PluginLoader(config, registry, createApiFactory(config, registry));

    await loader.loadAll();
    await loader.loadBuiltins();

    expect(registry.channels.get("telegram")?.meta.label).toBe("External Telegram");
  });
});
