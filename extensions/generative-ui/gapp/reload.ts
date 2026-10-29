import { join } from "node:path";
import { loadGappBundle, type GappBundle } from "./storage.js";
import { openGappBundle } from "./open.js";
import { invalidateAppModule } from "./app-module.js";
import { GAPP_TOOL_MODULE_ENTRY } from "./tool-module.js";
import { hostReloadApp } from "./host-client.js";

export interface ReloadGappResult {
  id: string;
  /** True when this process (window owner) dropped its cached module. */
  sessionInvalidated: boolean;
  /** True when the daemon dropped its cached module for tool calls. */
  daemonInvalidated: boolean;
  window: "reloaded" | "closed" | "none";
  warning?: string;
}

/**
 * Hot-update a GAPP's code without restarting any process.
 *
 * tools.mjs lives in two module caches — this Pi session (window owner, serves
 * `window.__GAPP_TOOLS_MODULE_URL__`) and the daemon (serves gapp_call over
 * HTTP) — so both are invalidated. `window: true` also rebuilds the live window,
 * which is what picks up index.html/meta/state changes; only the session that
 * owns the window can do that, hence the close→reopen instead of a reload push.
 */
export async function reloadGappCode(
  bundle: GappBundle,
  activeWindows: any[] | undefined,
  options: { cwd?: string; window?: boolean; liveWindow?: any } = {},
): Promise<ReloadGappResult> {
  const cwd = options.cwd || bundle.meta.cwd || process.cwd();
  const id = bundle.meta.id;
  const result: ReloadGappResult = {
    id,
    sessionInvalidated: false,
    daemonInvalidated: false,
    window: "none",
  };

  if (options.liveWindow) {
    invalidateAppModule(join(bundle.dir, GAPP_TOOL_MODULE_ENTRY));
    result.sessionInvalidated = true;
  }
  const daemon = await hostReloadApp(id, { cwd, window: false }).catch(() => ({ ok: false }) as const);
  result.daemonInvalidated = daemon.ok === true;

  if (!options.window) return result;

  if (options.liveWindow) {
    // Re-read from disk so the rebuilt window sees the edited html/state.
    const fresh = await loadGappBundle(bundle.meta.scope, id, cwd);
    if (!fresh) {
      result.warning = "bundle disappeared during reload";
      return result;
    }
    await openGappBundle(fresh, activeWindows, {
      cwd: fresh.meta.cwd || cwd,
      skipLease: true,
    });
    result.window = "reloaded";
    return result;
  }

  // No window in this process: let the daemon-side owner rebuild it, if any.
  const remote = await hostReloadApp(id, { cwd, window: true }).catch((error) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (remote.ok !== true) {
    result.warning = "error" in remote ? remote.error : "window rebuild unavailable";
    return result;
  }
  result.daemonInvalidated = true;
  result.window = remote.window === "reloaded" ? "reloaded" : "closed";
  if (remote.warning) result.warning = remote.warning;
  return result;
}
