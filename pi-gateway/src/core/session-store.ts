/**
 * Session Store — persists session metadata to disk.
 *
 * Aligned with OpenClaw's sessions.json model:
 * - sessions.json: key/value index (sessionKey -> metadata)
 * - Transcript files: managed by pi RPC (--session-dir)
 *
 * Gateway owns the index; pi owns the transcripts.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { SessionKey, SessionState } from "./types.ts";
import { createLogger, type Logger } from "./types.ts";

// ============================================================================
// Persisted format (what goes to disk)
// ============================================================================

interface PersistedSession {
  sessionKey: string;
  role: string | null;
  lastActivity: number;
  messageCount: number;
  lastChatId?: string;
  lastChannel?: string;
  lastAccountId?: string;
  lastChatType?: "dm" | "group" | "channel" | "thread";
  lastSenderId?: string;
  lastSenderName?: string;
  lastTopicId?: string;
  lastThreadId?: string;
}

// ============================================================================
// Session Store
// ============================================================================

export class SessionStore {
  private sessions = new Map<SessionKey, SessionState>();
  private filePath: string;
  private log: Logger;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "sessions.json");
    this.log = createLogger("session-store");
    this.load();
    // Periodic flush every 10s if dirty
    this.flushTimer = setInterval(() => this.flushIfDirty(), 10_000);
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  get(key: SessionKey): SessionState | undefined {
    return this.sessions.get(key);
  }

  has(key: SessionKey): boolean {
    return this.sessions.has(key);
  }

  set(key: SessionKey, state: SessionState): void {
    this.sessions.set(key, state);
    this.dirty = true;
  }

  delete(key: SessionKey): void {
    this.sessions.delete(key);
    this.dirty = true;
  }

  values(): IterableIterator<SessionState> {
    return this.sessions.values();
  }

  get size(): number {
    return this.sessions.size;
  }

  toArray(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  // ==========================================================================
  // Convenience
  // ==========================================================================

  /** Get or create a session, marking dirty if created. */
  getOrCreate(key: SessionKey, defaults: Omit<SessionState, "sessionKey">): SessionState {
    let s = this.sessions.get(key);
    if (!s) {
      s = { sessionKey: key, ...defaults };
      this.sessions.set(key, s);
      this.dirty = true;
    }
    return s;
  }

  /** Mark a session as updated (triggers deferred flush). */
  touch(key: SessionKey): void {
    const s = this.sessions.get(key);
    if (s) {
      s.lastActivity = Date.now();
      this.dirty = true;
    }
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /** Immediately write to disk. */
  flush(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const persisted: Record<string, PersistedSession> = {};
      for (const [key, s] of this.sessions) {
        persisted[key] = {
          sessionKey: s.sessionKey,
          role: s.role,
          lastActivity: s.lastActivity,
          messageCount: s.messageCount,
          lastChatId: s.lastChatId,
          lastChannel: s.lastChannel,
          lastAccountId: s.lastAccountId,
          lastChatType: s.lastChatType,
          lastSenderId: s.lastSenderId,
          lastSenderName: s.lastSenderName,
          lastTopicId: s.lastTopicId,
          lastThreadId: s.lastThreadId,
        };
      }

      writeFileSync(this.filePath, JSON.stringify(persisted, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      this.log.error("Failed to flush sessions.json:", err);
    }
  }

  /** Flush only if there are unsaved changes. */
  flushIfDirty(): void {
    if (this.dirty) this.flush();
  }

  /** Stop the periodic flush timer. */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushIfDirty();
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.log.info("No sessions.json found, starting fresh");
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const persisted = JSON.parse(raw) as Record<string, PersistedSession>;
      let count = 0;

      for (const [key, p] of Object.entries(persisted)) {
        this.sessions.set(key, {
          sessionKey: p.sessionKey,
          role: p.role,
          isStreaming: false,          // Runtime state, always false on load
          lastActivity: p.lastActivity,
          messageCount: p.messageCount,
          rpcProcessId: null,          // Runtime state, null on load
          lastChatId: p.lastChatId,
          lastChannel: p.lastChannel,
          lastAccountId: p.lastAccountId,
          lastChatType: p.lastChatType,
          lastSenderId: p.lastSenderId,
          lastSenderName: p.lastSenderName,
          lastTopicId: p.lastTopicId,
          lastThreadId: p.lastThreadId,
        });
        count++;
      }

      this.log.info(`Restored ${count} sessions from sessions.json`);
    } catch (err) {
      this.log.error("Failed to load sessions.json:", err);
    }
  }
}

// ============================================================================
// Session Dir Encoding
// ============================================================================

/**
 * Encode a session key into a safe directory name.
 * Replaces colons with double underscores.
 */
export function encodeSessionDir(sessionKey: SessionKey): string {
  return sessionKey.replace(/:/g, "__");
}

/**
 * Get the session directory for a given session key.
 */
export function getSessionDir(dataDir: string, sessionKey: SessionKey): string {
  return join(dataDir, encodeSessionDir(sessionKey));
}
