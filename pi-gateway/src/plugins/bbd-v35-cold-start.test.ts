import { describe, test, expect } from "bun:test";
import { PluginLoader, createPluginRegistry } from "./loader.ts";
import { DEFAULT_CONFIG } from "../core/config.ts";
import type { Config } from "../core/config.ts";

describe("BG-004: Plugin cold-start optimization", () => {
  function makeConfig(channels: Record<string, any> = {}): Config {
    return {
      ...structuredClone(DEFAULT_CONFIG),
      channels: channels as any,
    };
  }

  function makeLoader(config: Config) {
    const registry = createPluginRegistry();
    const apiFactory = (pluginId: string) => ({
      registerChannel: (plugin: any) => { registry.channels.set(plugin.id ?? pluginId, plugin); },
      registerTool: () => {},
      registerCommand: () => {},
      registerHttpRoute: () => {},
      registerGatewayMethod: () => {},
      registerService: () => {},
      registerHook: () => {},
      log: { debug() {}, info() {}, warn() {}, error() {} },
    } as any);
    return {
      loader: new PluginLoader(config, registry, apiFactory),
      registry,
    };
  }

  test("skips unconfigured builtins (discord/feishu not in channels)", async () => {
    const config = makeConfig({ telegram: { enabled: true, botToken: "fake", allowFrom: [] } });
    const { loader } = makeLoader(config);

    // loadBuiltins should skip discord + feishu (not configured)
    await loader.loadBuiltins();
    const loaded = loader.getLoadedPluginIds();

    expect(loaded).toContain("telegram");
    expect(loaded).toContain("webchat"); // always loaded
    expect(loaded).not.toContain("discord");
    expect(loaded).not.toContain("feishu");
  });

  test("skips explicitly disabled builtins", async () => {
    const config = makeConfig({ telegram: { enabled: true, botToken: "fake", allowFrom: [] } });
    config.plugins.disabled = ["telegram"];
    const { loader } = makeLoader(config);

    await loader.loadBuiltins();
    const loaded = loader.getLoadedPluginIds();

    expect(loaded).not.toContain("telegram");
    expect(loaded).toContain("webchat");
  });

  test("skips channels with enabled=false", async () => {
    const config = makeConfig({
      telegram: { enabled: true, botToken: "fake", allowFrom: [] },
      discord: { enabled: false, token: "fake" },
    });
    const { loader } = makeLoader(config);

    await loader.loadBuiltins();
    const loaded = loader.getLoadedPluginIds();

    expect(loaded).toContain("telegram");
    expect(loaded).not.toContain("discord");
  });

  test("webchat always loads even without config", async () => {
    const config = makeConfig({}); // no channels at all
    const { loader } = makeLoader(config);

    await loader.loadBuiltins();
    const loaded = loader.getLoadedPluginIds();

    expect(loaded).toContain("webchat");
  });
});
