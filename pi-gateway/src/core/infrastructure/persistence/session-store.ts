/**
 * Infrastructure Layer - Session Store Implementation
 *
 * File-based persistence for session metadata.
 * Implements the SessionRepository interface from domain layer.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type {
  SessionKey,
  SessionState,
  Logger,
} from "../../domain/types.ts";
import type {
  SessionRepository,
  SessionRepositoryOptions,
} from "../../domain/session/repository.ts";

// ============================================================================
// Types
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
  lastModel?: string;
  lastModelSource?: string;
  lastThinkingLevel?: string;
  lastThinkingLevelSource?: string;
}

// ============================================================================
// Session Store Implementation
// ============================================================================

export class SessionStore implements SessionRepository {
  private sessions = new Map<SessionKey, SessionState>();
  private filePath: string;
  private logger: Logger;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionRepositoryOptions & { logger: Logger }) {
    this.filePath = join(options.dataDir, "sessions.json");
    this.logger = options.logger;
    this.load();

    const intervalMs = options.flushIntervalMs ?? 10_000;
    this.flushTimer = setInterval(() => this.flushIfDirty(), intervalMs);
  }

  // ============================================================================
  // Repository Interface Implementation
  // ============================================================================

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

  getOrCreate(
    key: SessionKey,
    defaults: Omit<SessionState, "sessionKey">
  ): SessionState {
    let session = this.sessions.get(key);
    if (!session) {
      session = { sessionKey: key, ...defaults };
      this.sessions.set(key, session);
      this.dirty = true;
    }
    return session;
  }

  touch(key: SessionKey): void {
    const session = this.sessions.get(key);
    if (session) {
      session.lastActivity = Date.now();
      session.messageCount = (session.messageCount ?? 0) + 1;
      this.dirty = true;
    }
  }

  flush(): void {
    if (!this.dirty) return;

    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const persisted: Record<string, PersistedSession> = {};
      for (const [key, state] of this.sessions) {
        persisted[key] = {
          sessionKey: state.sessionKey,
          role: state.role,
          lastActivity: state.lastActivity,
          messageCount: state.messageCount,
          lastChatId: state.lastChatId,
          lastChannel: state.lastChannel,
          lastAccountId: state.lastAccountId,
          lastChatType: state.lastChatType,
          lastSenderId: state.lastSenderId,
          lastSenderName: state.lastSenderName,
          lastTopicId: state.lastTopicId,
          lastThreadId: state.lastThreadId,
          lastModel: state.lastModel,
          lastModelSource: state.lastModelSource,
          lastThinkingLevel: state.lastThinkingLevel,
          lastThinkingLevelSource: state.lastThinkingLevelSource,
        };
      }

      writeFileSync(this.filePath, JSON.stringify(persisted, null, 2));
      this.dirty = false;

      this.logger.debug("Session store flushed", {
        count: this.sessions.size,
        path: this.filePath,
      });
    } catch (error) {
      this.logger.error("Failed to flush session store", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.logger.info("No existing session store found, starting fresh");
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const persisted = JSON.parse(raw) as Record<string, PersistedSession>;

      let count = 0;
      for (const [key, data] of Object.entries(persisted)) {
        this.sessions.set(key, {
          sessionKey: data.sessionKey,
          role: data.role,
          lastActivity: data.lastActivity,
          messageCount: data.messageCount ?? 0,
          lastChatId: data.lastChatId,
          lastChannel: data.lastChannel,
          lastAccountId: data.lastAccountId,
          lastChatType: data.lastChatType,
          lastSenderId: data.lastSenderId,
          lastSenderName: data.lastSenderName,
          lastTopicId: data.lastTopicId,
          lastThreadId: data.lastThreadId,
          lastModel: data.lastModel,
          lastModelSource: data.lastModelSource,
          lastThinkingLevel: data.lastThinkingLevel as any,
          lastThinkingLevelSource: data.lastThinkingLevelSource,
        });
        count++;
      }

      this.logger.info("Session store loaded", { count, path: this.filePath });
    } catch (error) {
      this.logger.error("Failed to load session store", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private flushIfDirty(): void {
    if (this.dirty) {
      this.flush();
    }
  }
}
