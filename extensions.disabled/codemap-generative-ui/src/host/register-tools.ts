import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ExtensionPluginModule, PluginSharedContext } from "../shared/module.ts";

export function registerPluginModules(pi: ExtensionAPI, plugins: ExtensionPluginModule[], shared: PluginSharedContext) {
  for (const plugin of plugins) {
    plugin.register?.(pi, shared);
  }
}
