/**
 * Hot Reload Plugin - Exposes API endpoints for plugin hot reloading.
 *
 * Provides:
 * - HTTP POST /api/plugins/reload
 * - WS method: plugins.reload
 */

import type { GatewayPluginApi } from "../../types.ts";
import { createLogger } from "../../../core/types.ts";
import { PluginReloader } from "../../reloader.ts";

export default function hotReloadPlugin(api: GatewayPluginApi) {
  const logger = createLogger("plugin:hot-reload");

  // Store reloader instance (will be set by loader integration)
  let reloader: PluginReloader | null = null;

  // Register HTTP endpoint
  api.registerHttpRoute("POST", "/api/plugins/reload", async (req) => {
    // Auth check
    const authHeader = req.headers.get("authorization");
    const config = api.config;
    const expectedToken = config.gateway.auth.token;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
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

    // Check reloader is available
    if (!reloader) {
      return Response.json(
        { error: "Hot reload not initialized" },
        { status: 503 }
      );
    }

    logger.info(`HTTP reload request: ${pluginId}`);

    // Execute reload
    const result = await reloader.reload(pluginId);

    const response = {
      success: result.success,
      pluginId: result.pluginId,
      message: result.error || "Reload successful",
      durationMs: Date.now() - result.timestamp,
    };

    return Response.json(response, { status: result.success ? 200 : 500 });
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

  // Expose reloader setter for initialization
  (api as unknown as { setReloader: (r: PluginReloader) => void }).setReloader = (
    r: PluginReloader
  ) => {
    reloader = r;
    logger.info("Hot reload initialized");
  };

  logger.info("Hot reload plugin registered");
}
