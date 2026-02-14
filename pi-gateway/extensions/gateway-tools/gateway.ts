/** gateway tool — manage the gateway itself (config, reload, restart). */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

export function createGatewayTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "gateway",
    label: "Gateway",
    description:
      "Manage the pi-gateway process. " +
      "Actions: config.get (view current config), reload (hot-reload config file), restart (restart gateway process).\n\n" +
      "EXAMPLES:\n" +
      '- View config: { action: "config.get" }\n' +
      '- Reload config: { action: "reload" }\n' +
      '- Restart gateway: { action: "restart" } (requires gateway.commands.restart: true in config)',
    parameters: Type.Object({
      action: Type.String({
        enum: ["config.get", "reload", "restart"],
        description: "Action to perform",
      }),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { action } = params as { action: string };
      const headers: Record<string, string> = gatewayHeaders(authToken ?? internalToken);

      try {
        switch (action) {
          case "config.get": {
            const res = await fetch(`${gatewayUrl}/api/gateway/config`, { headers });
            const config = await parseResponseJson(res);
            if (!res.ok) return toolError(`Failed to get config: ${String(config.error || res.statusText)}`);
            return toolOk(JSON.stringify(config, null, 2));
          }

          case "reload": {
            const res = await fetch(`${gatewayUrl}/api/gateway/reload`, {
              method: "POST",
              headers,
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return toolError(String(data.error || res.statusText));
            return toolOk(String(data.message || "Config reloaded."));
          }

          case "restart": {
            const res = await fetch(`${gatewayUrl}/api/gateway/restart`, {
              method: "POST",
              headers,
            });
            const data = await parseResponseJson(res);
            if (!res.ok) return toolError(String(data.error || res.statusText));
            return toolOk(String(data.message || "Gateway restarting..."));
          }

          default:
            return toolError(`Unknown action: ${action}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  };
}
