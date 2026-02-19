/**
 * Hot Reload Plugin - Exposes API endpoints for plugin hot reloading.
 *
 * Provides:
 * - HTTP POST /api/plugins/reload - Manual reload
 * - HTTP POST /api/plugins/watch - Start watching
 * - HTTP DELETE /api/plugins/watch - Stop watching
 * - HTTP GET /api/plugins/watch - List watched plugins
 * - WS method: plugins.reload
 * - Command /reload-plugin
 */

import type { GatewayPluginApi } from "../../types.ts";
import { createLogger } from "../../../core/types.ts";
import { PluginReloader } from "../../reloader.ts";
import { PluginReloaderWatcher } from "../../reloader-watcher.ts";

export default function hotReloadPlugin(api: GatewayPluginApi) {
  const logger = createLogger("plugin:hot-reload");

  // Store reloader instance (will be set by loader integration)
  let reloader: PluginReloader | null = null;
  let watcher: PluginReloaderWatcher | null = null;

  // Helper to check auth
  const checkAuth = (req: Request): boolean => {
    const authHeader = req.headers.get("authorization");
    const expectedToken = api.config.gateway.auth.token;
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return false;
    }
    return true;
  };

  // Register HTTP endpoint for manual reload
  api.registerHttpRoute("POST", "/api/plugins/reload", async (req) => {
    if (!checkAuth(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { pluginId?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { pluginId } = body;
    if (!pluginId) {
      return Response.json({ error: "pluginId required" }, { status: 400 });
    }

    if (!reloader) {
      return Response.json(
        { error: "Hot reload not initialized" },
        { status: 503 }
      );
    }

    logger.info(`HTTP reload request: ${pluginId}`);
    const result = await reloader.reload(pluginId);

    return Response.json(
      {
        success: result.success,
        pluginId: result.pluginId,
        message: result.error || "Reload successful",
        durationMs: Date.now() - result.timestamp,
      },
      { status: result.success ? 200 : 500 }
    );
  });

  // Register HTTP endpoints for watching
  api.registerHttpRoute("POST", "/api/plugins/watch", async (req) => {
    if (!checkAuth(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { pluginId?: string; path?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { pluginId, path } = body;
    if (!pluginId || !path) {
      return Response.json(
        { error: "pluginId and path required" },
        { status: 400 }
      );
    }

    if (!watcher) {
      return Response.json(
        { error: "Watcher not initialized" },
        { status: 503 }
      );
    }

    watcher.watch(pluginId, path);
    return Response.json({ success: true, message: `Watching ${pluginId}` });
  });

  api.registerHttpRoute("DELETE", "/api/plugins/watch", async (req) => {
    if (!checkAuth(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const pluginId = url.searchParams.get("pluginId");

    if (!pluginId) {
      return Response.json({ error: "pluginId required" }, { status: 400 });
    }

    if (!watcher) {
      return Response.json(
        { error: "Watcher not initialized" },
        { status: 503 }
      );
    }

    watcher.unwatch(pluginId);
    return Response.json({ success: true, message: `Stopped watching ${pluginId}` });
  });

  api.registerHttpRoute("GET", "/api/plugins/watch", async (req) => {
    if (!checkAuth(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!watcher) {
      return Response.json(
        { error: "Watcher not initialized" },
        { status: 503 }
      );
    }

    const watched = watcher.getWatchedPlugins();
    return Response.json({ watched });
  });

  // Register WS method
  api.registerGatewayMethod("plugins.reload", async (params) => {
    const pluginId = params.pluginId as string | undefined;

    if (!pluginId) {
      return { error: "pluginId required" };
    }

    if (!reloader) {
      return { error: "Hot reload not initialized" };
    }

    logger.info(`WS reload request: ${pluginId}`);
    const result = await reloader.reload(pluginId);

    return {
      success: result.success,
      pluginId: result.pluginId,
      message: result.error || "Reload successful",
      durationMs: Date.now() - result.timestamp,
    };
  });

  // Register command for CLI
  api.registerCommand("reload-plugin", async (ctx) => {
    const pluginId = ctx.args.trim();

    if (!pluginId) {
      await ctx.respond("Usage: /reload-plugin <plugin-id>");
      return;
    }

    if (!reloader) {
      await ctx.respond("❌ Hot reload not initialized");
      return;
    }

    logger.info(`Command reload request: ${pluginId}`);
    await ctx.respond(`⏳ Reloading plugin: ${pluginId}...`);

    const result = await reloader.reload(pluginId);

    if (result.success) {
      await ctx.respond(`✅ Plugin ${pluginId} reloaded successfully`);
    } else {
      await ctx.respond(`❌ Failed to reload ${pluginId}: ${result.error}`);
    }
  });

  // Expose setters for initialization
  (api as unknown as { setReloader: (r: PluginReloader) => void }).setReloader = (
    r: PluginReloader
  ) => {
    reloader = r;
    watcher = new PluginReloaderWatcher(r);
    logger.info("Hot reload initialized with watcher");
  };

  logger.info("Hot reload plugin registered");
}
