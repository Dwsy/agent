import type { GatewayApi, UnknownRecord } from "./types.ts";

function getSessionKey(payload: UnknownRecord): string {
  const key = payload.sessionKey;
  return typeof key === "string" ? key : "unknown-session";
}

export function registerLifecycleHooks(api: GatewayApi): void {
  api.on("gateway_start", async () => {
    api.logger.info("[__PLUGIN_ID__] gateway_start");
  });

  api.on("gateway_stop", async () => {
    api.logger.info("[__PLUGIN_ID__] gateway_stop");
  });

  api.on("session_start", async (payload) => {
    api.logger.debug(`[__PLUGIN_ID__] session_start: ${getSessionKey(payload)}`);
  });

  api.on("agent_end", async (payload) => {
    api.logger.debug(`[__PLUGIN_ID__] agent_end: ${getSessionKey(payload)}`);
  });
}
