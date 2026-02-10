import type { TelegramChannelConfig } from "../../../core/config.ts";

export function migrateTelegramGroupConfig(params: {
  cfg: TelegramChannelConfig;
  accountId: string;
  oldChatId: string;
  newChatId: string;
}): { migrated: boolean; skippedExisting: boolean } {
  const accountGroups = params.cfg.accounts?.[params.accountId]?.groups;
  const globalGroups = params.cfg.groups;
  let migrated = false;
  let skippedExisting = false;

  const migrateOne = (groups?: Record<string, any>) => {
    if (!groups) return;
    if (!(params.oldChatId in groups)) return;
    if (params.newChatId in groups) {
      skippedExisting = true;
      return;
    }
    groups[params.newChatId] = groups[params.oldChatId];
    delete groups[params.oldChatId];
    migrated = true;
  };

  migrateOne(accountGroups);
  migrateOne(globalGroups);

  return { migrated, skippedExisting };
}
