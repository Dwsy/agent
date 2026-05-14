import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ExtensionPluginModule, PluginSharedContext } from "../shared/module.ts";

export function registerPluginModules(pi: ExtensionAPI, plugins: ExtensionPluginModule[], shared: PluginSharedContext) {
  for (const plugin of plugins) {
    plugin.register?.(pi, shared);
  }
}
