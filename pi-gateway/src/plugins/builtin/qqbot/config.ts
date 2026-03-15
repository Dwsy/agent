import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { QqbotChannelConfig } from "./types.ts";

function readSecretFile(path?: string): string {
  if (!path?.trim()) return "";
  const resolved = path.replace(/^~/, homedir());
  if (!existsSync(resolved)) return "";
  return readFileSync(resolved, "utf-8").trim();
}

export function resolveQqbotConfig(raw?: QqbotChannelConfig): QqbotChannelConfig {
  return {
    enabled: raw?.enabled ?? false,
    appId: raw?.appId?.trim() || process.env.QQBOT_APPID?.trim() || process.env.QQBOT_APP_ID?.trim() || "",
    clientSecret:
      raw?.clientSecret?.trim() ||
      readSecretFile(raw?.clientSecretFile) ||
      process.env.QQBOT_CLIENT_SECRET?.trim() ||
      process.env.QQBOT_CLIENTSECRET?.trim() ||
      readSecretFile(process.env.QQBOT_CLIENT_SECRET_FILE?.trim()) ||
      "",
    clientSecretFile: raw?.clientSecretFile,
    dmPolicy: raw?.dmPolicy ?? "pairing",
    allowFrom: raw?.allowFrom,
    groupPolicy: raw?.groupPolicy ?? "disabled",
    groupAllowFrom: raw?.groupAllowFrom,
    requireMention: raw?.requireMention ?? true,
    role: raw?.role,
    model: raw?.model,
    thinkingLevel: raw?.thinkingLevel,
    textChunkLimit: raw?.textChunkLimit ?? 1500,
    passiveReplyOnly: raw?.passiveReplyOnly ?? false,
    streaming: {
      enabled: raw?.streaming?.enabled ?? true,
      editThrottleMs: raw?.streaming?.editThrottleMs ?? 1200,
      streamStartChars: raw?.streaming?.streamStartChars ?? 80,
    },
  };
}

export function hasQqbotCredentials(cfg: QqbotChannelConfig): boolean {
  return Boolean(cfg.appId?.trim() && cfg.clientSecret?.trim());
}
