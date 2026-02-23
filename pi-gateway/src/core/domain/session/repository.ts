/**
 * Domain Layer - Session Repository Interface
 *
 * Repository pattern interface for session persistence.
 * Infrastructure layer provides concrete implementation.
 */

import type { SessionKey, SessionState } from "../types.ts";

/**
 * Session repository interface - defines contract for session persistence.
 * Domain layer depends on this interface, not implementation.
 */
export interface SessionRepository {
  /**
   * Get session by key.
   * @returns Session state or undefined if not found.
   */
  get(key: SessionKey): SessionState | undefined;

  /**
   * Check if session exists.
   */
  has(key: SessionKey): boolean;

  /**
   * Save or update session state.
   */
  set(key: SessionKey, state: SessionState): void;

  /**
   * Delete session.
   */
  delete(key: SessionKey): void;

  /**
   * Get all session values.
   */
  values(): IterableIterator<SessionState>;

  /**
   * Get session count.
   */
  get size(): number;

  /**
   * Get all sessions as array.
   */
  toArray(): SessionState[];

  /**
   * Get or create a session.
   * @param key - Session key
   * @param defaults - Default values if session doesn't exist
   * @returns Existing or newly created session
   */
  getOrCreate(key: SessionKey, defaults: Omit<SessionState, "sessionKey">): SessionState;

  /**
   * Mark session as updated (triggers deferred flush).
   */
  touch(key: SessionKey): void;

  /**
   * Force immediate persistence.
   */
  flush(): void;

  /**
   * Clean up resources.
   */
  dispose(): void;
}

/**
 * Options for creating a session repository.
 */
export interface SessionRepositoryOptions {
  /** Data directory for persistence */
  dataDir: string;
  /** Auto-flush interval in ms. Default: 10000 */
  flushIntervalMs?: number;
}

/**
 * Factory function type for creating repository instances.
 * Infrastructure layer exports the concrete factory.
 */
export type SessionRepositoryFactory = (options: SessionRepositoryOptions) => SessionRepository;

/**
 * Session lookup criteria for flexible querying.
 */
export interface SessionLookupCriteria {
  channel?: string;
  accountId?: string;
  chatId?: string;
  role?: string;
  agentId?: string;
}

/**
 * Extended repository with query capabilities.
 */
export interface QueryableSessionRepository extends SessionRepository {
  /**
   * Find sessions matching criteria.
   */
  find(criteria: SessionLookupCriteria): SessionState[];

  /**
   * Find single session by criteria.
   * @returns First matching session or undefined
   */
  findOne(criteria: SessionLookupCriteria): SessionState | undefined;

  /**
   * Get sessions by role.
   */
  findByRole(role: string): SessionState[];

  /**
   * Get sessions by agent ID.
   */
  findByAgentId(agentId: string): SessionState[];
}

/**
 * Events emitted by session repository.
 */
export type SessionRepositoryEvent =
  | { type: "session_created"; key: SessionKey; state: SessionState }
  | { type: "session_updated"; key: SessionKey; state: SessionState }
  | { type: "session_deleted"; key: SessionKey }
  | { type: "session_flushed"; count: number }
  | { type: "error"; error: Error };

/**
 * Event handler type for repository events.
 */
export type SessionRepositoryEventHandler = (event: SessionRepositoryEvent) => void;

/**
 * Observable repository interface.
 */
export interface ObservableSessionRepository extends SessionRepository {
  /**
   * Subscribe to repository events.
   * @returns Unsubscribe function
   */
  subscribe(handler: SessionRepositoryEventHandler): () => void;
}
