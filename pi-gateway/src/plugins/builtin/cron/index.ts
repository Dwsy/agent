/**
 * Cron Plugin — BackgroundService that manages scheduled task execution.
 *
 * Migrated from server.ts hardcoded initialization to plugin system.
 */

import type { GatewayPluginApi } from "../../types.ts";
import { CronEngine } from "../../../core/cron.ts";
import { buildCronAnnouncer } from "../../../core/cron-announcer.ts";

let cronEngine: CronEngine | null = null;
let cronAnnouncer: ReturnType<typeof buildCronAnnouncer> | null = null;

export function getCronEngine(): CronEngine | null { return cronEngine; }
export function markCronSelfDelivered(sessionKey: string): void { cronAnnouncer?.markSelfDelivered(sessionKey); }

export default function register(api: GatewayPluginApi) {
  api.registerService({
    name: "cron",

    async start(svcApi: GatewayPluginApi) {
      const config = svcApi.config;
      if (!config.cron.enabled) {
        svcApi.logger.info("Cron disabled");
        return;
      }

      const systemEvents = svcApi.systemEvents;
      const sessionStore = svcApi.sessionStore;
      if (!systemEvents || !sessionStore) {
        svcApi.logger.warn("Cron plugin requires systemEvents and sessionStore — skipping");
        return;
      }

      cronAnnouncer = buildCronAnnouncer({
        log: svcApi.logger,
        sessions: sessionStore,
        systemEvents,
        getChannels: svcApi.getChannels ?? (() => new Map()),
        heartbeatWake: svcApi.requestHeartbeat,
      });

      const dataDir = config.session.dataDir.replace(/\/sessions$/, "");
      const dispatcher = { dispatch: (msg: any) => svcApi.dispatch(msg) };

      cronEngine = new CronEngine(
        dataDir,
        dispatcher,
        config,
        cronAnnouncer,
        systemEvents,
        svcApi.requestHeartbeat,
      );
      cronEngine.start();
      svcApi.logger.info("Cron engine started via plugin");
    },

    async stop() {
      cronEngine?.stop();
      cronEngine = null;
      cronAnnouncer = null;
    },
  });
}
