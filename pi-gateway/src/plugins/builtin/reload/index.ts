/**
 * Reload Plugin — Provides manual reload command for gateway.
 *
 * Aligned with pi's ctx.reload() pattern:
 * - /reload command reloads extensions, skills, prompts
 * - Can be triggered via CLI, WebSocket, or slash command
 */

import type { GatewayPluginApi, CommandContext } from "../../types.ts";
import { createLogger } from "../../../core/types.ts";

export default function reloadPlugin(api: GatewayPluginApi) {
  const logger = createLogger("plugin:reload");

  // Register slash command that forwards /reload to the agent
  api.registerCommand("reload", async (ctx: CommandContext) => {
    logger.info("Reload command triggered", { sessionKey: ctx.sessionKey, source: "slash" });

    try {
      await ctx.respond("⏳ Sending reload command to agent runtime...");

      // Forward /reload command to the agent via RPC
      // The agent will execute its native reload mechanism
      await api.forwardCommand(ctx.sessionKey, "/reload", "");

      await ctx.respond("✅ Reload command queued for agent runtime.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Reload failed", { sessionKey: ctx.sessionKey, error: message });
      await ctx.respond(`❌ Reload failed: ${message}`);
    }
  });

  // Register HTTP endpoint for external trigger
  api.registerHttpRoute("POST", "/api/reload", async (req) => {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionKey = body.sessionKey as string | undefined;

    if (!sessionKey) {
      return Response.json({ success: false, error: "sessionKey required" }, { status: 400 });
    }

    // Validate session exists
    const sessionState = api.getSessionState(sessionKey);
    if (!sessionState) {
      return Response.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    logger.info("Reload triggered", { sessionKey, source: "http" });

    try {
      // Forward /reload to the agent
      await api.forwardCommand(sessionKey, "/reload", "");

      return Response.json({
        success: true,
        message: "Reload command queued for agent runtime",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Reload failed", { sessionKey, error: message });
      return Response.json({ success: false, error: message }, { status: 500 });
    }
  });

  const handleReloadRequest = async (
    params: Record<string, unknown>,
    source: "ws" | "ws-legacy",
  ) => {
    const sessionKey = params.sessionKey as string | undefined;

    if (!sessionKey) {
      return { success: false, error: "sessionKey required" };
    }

    // Validate session exists
    const sessionState = api.getSessionState(sessionKey);
    if (!sessionState) {
      return { success: false, error: "Session not found" };
    }

    logger.info("Reload triggered", { sessionKey, source });

    try {
      // Forward /reload to the agent
      await api.forwardCommand(sessionKey, "/reload", "");

      return { success: true, message: "Reload command queued for agent runtime" };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Reload failed", { sessionKey, error: message });
      return { success: false, error: message };
    }
  };

  // Register WS method for programmatic access
  api.registerGatewayMethod("session.reload", async (params) => {
    return handleReloadRequest(params, "ws");
  });

  // Backward-compatible alias for external callers
  api.registerGatewayMethod("reloadsession", async (params) => {
    return handleReloadRequest(params, "ws-legacy");
  });

  logger.info("Reload plugin registered");
}
