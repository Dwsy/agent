/**
 * Telegram session key migration — extracted from server.ts R3.
 *
 * Migrates old-format session keys to the new account-scoped format.
 *
 * @owner MintHawk (KeenUnion)
 */

import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../core/config.ts";
import type { SessionStore } from "../core/session-store.ts";
import type { Logger } from "../core/types.ts";

function getSessionDir(dataDir: string, sessionKey: string): string {
  return join(dataDir, "sessions", encodeSessionDir(sessionKey));
}

function encodeSessionDir(sessionKey: string): string {
  return sessionKey.replace(/:/g, "_");
}

/**
 * Migrate old Telegram session keys (agent:main:telegram:dm:*)
 * to new account-scoped format (agent:main:telegram:account:default:dm:*).
 */
export function migrateTelegramSessionKeys(
  sessions: SessionStore,
  config: Config,
  log: Logger,
): void {
  const migrations: Array<{ oldKey: string; newKey: string }> = [];
  for (const session of sessions.toArray()) {
    const oldKey = session.sessionKey;
    let newKey: string | null = null;
    if (oldKey.startsWith("agent:main:telegram:group:")) {
      newKey = oldKey.replace(
        "agent:main:telegram:",
        "agent:main:telegram:account:default:",
      );
    } else if (oldKey.startsWith("agent:main:telegram:dm:")) {
      newKey = oldKey.replace(
        "agent:main:telegram:",
        "agent:main:telegram:account:default:",
      );
    }
    if (!newKey || newKey === oldKey) continue;
    if (sessions.has(newKey)) {
      log.warn(`Skip session migration (target exists): ${oldKey} -> ${newKey}`);
      continue;
    }
    migrations.push({ oldKey, newKey });
  }

  if (migrations.length === 0) return;
  const transcriptDir = join(config.session.dataDir, "transcripts");
  for (const migration of migrations) {
    const state = sessions.get(migration.oldKey);
    if (!state) continue;
    sessions.delete(migration.oldKey);
    state.sessionKey = migration.newKey;
    sessions.set(migration.newKey, state);

    const oldSessionDir = getSessionDir(config.session.dataDir, migration.oldKey);
    const newSessionDir = getSessionDir(config.session.dataDir, migration.newKey);
    if (existsSync(oldSessionDir) && !existsSync(newSessionDir)) {
      try {
        renameSync(oldSessionDir, newSessionDir);
      } catch (err: any) {
        log.warn(`Session dir migration failed ${migration.oldKey}: ${err?.message ?? String(err)}`);
      }
    }

    const oldTranscript = join(transcriptDir, `${encodeSessionDir(migration.oldKey)}.jsonl`);
    const newTranscript = join(transcriptDir, `${encodeSessionDir(migration.newKey)}.jsonl`);
    if (existsSync(oldTranscript) && !existsSync(newTranscript)) {
      try {
        renameSync(oldTranscript, newTranscript);
      } catch (err: any) {
        log.warn(`Transcript migration failed ${migration.oldKey}: ${err?.message ?? String(err)}`);
      }
    }
    log.info(`Migrated Telegram session key: ${migration.oldKey} -> ${migration.newKey}`);
  }
  sessions.flushIfDirty();
}
