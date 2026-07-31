import { hostCallTool, hostToolCatalog } from "./host-client.js";
import type { GappRuntimeAdapter } from "./service.js";

/** Standalone adapter: use the shared host when Pi owns a live GAPP window. */
export function createHostGappRuntimeAdapter(): GappRuntimeAdapter {
  return {
    async listTools(bundle, cwd) {
      const remote = await hostToolCatalog(bundle.meta.id, cwd);
      if (!remote?.live) return [];
      return remote.tools.map((tool) => ({ tool, source: "host" as const }));
    },
    async invoke(bundle, tool, args, options) {
      try {
        const remote = await hostCallTool(bundle.meta.id, tool.name, args, options.cwd);
        if (remote?.ok) {
          return { via: "host" as const, result: remote.result ?? remote };
        }
        if (remote?.error?.code === "needs_live_handler") return null;
        if (remote?.error) {
          throw new Error(remote.error.message || JSON.stringify(remote.error));
        }
        return null;
      } catch (error) {
        if (error instanceof Error && /fetch|connect|ECONNREFUSED/i.test(error.message)) {
          return null;
        }
        throw error;
      }
    },
  };
}
