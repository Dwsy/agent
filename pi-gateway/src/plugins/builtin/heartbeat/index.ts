/**
 * Heartbeat Plugin — BackgroundService registration.
 *
 * The HeartbeatExecutor lifecycle is managed by server.ts (creates, starts, stops).
 * This plugin registers the service name for /api/plugins visibility only.
 * It does NOT create a second executor — that caused duplicate heartbeats.
 */

import type { GatewayPluginApi } from "../../types.ts";

export default function register(api: GatewayPluginApi) {
  api.registerService({
    name: "heartbeat",
    async start() {
      // No-op: HeartbeatExecutor is created and started by server.ts
      // with delivery deps and cron callback wired in.
      api.logger.info("Heartbeat service registered (lifecycle managed by server.ts)");
    },
    async stop() {
      // No-op: server.ts handles stop
    },
  });
}
