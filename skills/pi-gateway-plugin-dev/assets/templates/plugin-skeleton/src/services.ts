import type { BackgroundService, GatewayApi } from "./types.ts";

export function createHeartbeatService(intervalMs = 60_000): BackgroundService {
  let timer: ReturnType<typeof setInterval> | null = null;
  let apiRef: GatewayApi | null = null;

  return {
    name: "__PLUGIN_ID__-heartbeat",
    async start(api: GatewayApi) {
      apiRef = api;
      timer = setInterval(() => {
        api.logger.debug("[__PLUGIN_ID__] heartbeat");
      }, intervalMs);
      api.logger.info("[__PLUGIN_ID__] heartbeat service started");
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      apiRef?.logger.info("[__PLUGIN_ID__] heartbeat service stopped");
    },
  };
}
