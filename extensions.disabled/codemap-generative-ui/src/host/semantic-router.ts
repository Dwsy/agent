import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ExtensionPluginModule } from "../shared/module.ts";

export function registerSemanticRouter(pi: ExtensionAPI, plugins: ExtensionPluginModule[]) {
  pi.on("before_agent_start", async (event) => {
    const additions: string[] = [];
    for (const plugin of plugins) {
      const matched = plugin.matchPrompt?.(event.prompt);
      if (matched?.appendSystemPrompt) {
        additions.push(matched.appendSystemPrompt);
      }
    }
    if (additions.length === 0) {
      return;
    }
    return {
      systemPrompt: event.systemPrompt + "\n\n" + additions.join("\n\n"),
    };
  });
}
