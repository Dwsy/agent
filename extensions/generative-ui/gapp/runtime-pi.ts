import type { GappRuntimeAdapter } from "./service.js";
import { openGappBundle, GappOpenError, notifyLiveState } from "./open.js";
import {
  dispatchToolCallToWindow,
  getLiveApp,
} from "./registry.js";
import { hostCallTool } from "./host-client.js";
import { isHub } from "./host-server.js";
import { detectDarkMode } from "../html-helpers.js";

export function createPiGappRuntimeAdapter(options: {
  activeWindows: any[];
}): GappRuntimeAdapter {
  return {
    async listTools(bundle) {
      const live = getLiveApp(bundle.meta.id);
      if (!live) return [];
      return live.liveTools.map((tool) => ({ tool, source: "live" as const }));
    },
    async invoke(bundle, tool, args, callOptions) {
      const appId = bundle.meta.id;
      let live = getLiveApp(appId);

      if (!live?.win && isHub() === false) {
        try {
          const remote = await hostCallTool(appId, tool.name, args, callOptions.cwd);
          if (remote?.ok) {
            return { via: "host" as const, result: remote.result ?? remote };
          }
          if (remote?.error?.code && remote.error.code !== "needs_live_handler") {
            throw new Error(remote.error.message || JSON.stringify(remote.error));
          }
        } catch (error) {
          if (error instanceof Error && !/fetch|connect|ECONNREFUSED/i.test(error.message)) {
            throw error;
          }
        }
      }

      if (!live?.win && callOptions.openIfNeeded) {
        void detectDarkMode();
        try {
          await openGappBundle(bundle, options.activeWindows ?? [], callOptions.cwd);
        } catch (error) {
          if (error instanceof GappOpenError) throw new Error(error.message);
          throw error;
        }
        live = getLiveApp(appId);
      }

      if (!live?.win) return null;
      const result = await dispatchToolCallToWindow(appId, tool.name, args);
      if (!result.ok) throw new Error(result.error.message || result.error.code);
      return { via: "live" as const, result: result.result };
    },
    onStateChanged(bundle, state) {
      notifyLiveState(bundle.meta.id, state);
    },
  };
}
