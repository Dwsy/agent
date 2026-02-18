/**
 * Concise Mode State Manager
 * 
 * Manages session state for concise-mode using State Pattern.
 * Encapsulates state transitions and validation logic.
 */

import type { GatewayPluginApi } from "../../types.ts";

/**
 * Session state for concise-mode
 */
export interface ConciseSessionState {
  sessionKey: string;
  channel: string;
  target: string;
  activatedAt: number;
  suppressCount: number;
}

/**
 * State Manager for concise-mode sessions
 * 
 * Responsibilities:
 * - Track active sessions per channel
 * - Manage suppress routes with TTL
 * - Provide metrics and diagnostics
 */
export class ConciseStateManager {
  private enabledChannels: Set<string>;
  private activeSessions: Map<string, ConciseSessionState>;
  private suppressRoutes: Map<string, number>; // routeKey → expiryTimestamp
  private metrics: ConciseMetrics;

  constructor(
    channels: string[],
    private ttlMs: number = 5000
  ) {
    this.enabledChannels = new Set(channels);
    this.activeSessions = new Map();
    this.suppressRoutes = new Map();
    this.metrics = { suppressedCount: 0, skippedCount: 0, errorCount: 0 };
  }

  /**
   * Activate concise-mode for a session
   */
  activateSession(sessionKey: string, channel: string): void {
    if (!this.enabledChannels.has(channel)) {
      this.activeSessions.delete(sessionKey);
      return;
    }

    this.activeSessions.set(sessionKey, {
      sessionKey,
      channel,
      target: "",
      activatedAt: Date.now(),
      suppressCount: 0,
    });
  }

  /**
   * Add a suppress route after send_message tool call
   */
  addSuppressRoute(sessionKey: string, target: string): boolean {
    const session = this.activeSessions.get(sessionKey);
    if (!session) {
      return false;
    }

    const routeKey = this.makeRouteKey(session.channel, target);
    const expiry = Date.now() + this.ttlMs;
    this.suppressRoutes.set(routeKey, expiry);
    
    session.suppressCount++;
    this.logger?.info(`[state] Added suppress route: ${routeKey} (TTL: ${this.ttlMs}ms)`);
    return true;
  }

  /**
   * Check if a route should be suppressed
   */
  shouldSuppress(channel: string, target: string): boolean {
    const routeKey = this.makeRouteKey(channel, target);
    const expiry = this.suppressRoutes.get(routeKey);

    if (!expiry) {
      this.metrics.skippedCount++;
      return false;
    }

    // Check TTL
    if (Date.now() > expiry) {
      this.suppressRoutes.delete(routeKey);
      this.metrics.skippedCount++;
      return false;
    }

    this.suppressRoutes.delete(routeKey);
    this.metrics.suppressedCount++;
    return true;
  }

  /**
   * Update session target from gateway state
   */
  updateSessionTarget(sessionKey: string, channel: string | undefined, target: string | undefined): boolean {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return false;

    if (!channel || !target || !this.enabledChannels.has(channel)) {
      return false;
    }

    session.target = target;
    return true;
  }

  /**
   * Clean up expired routes (called periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, expiry] of this.suppressRoutes.entries()) {
      if (now > expiry) {
        this.suppressRoutes.delete(key);
        cleaned++;
      }
    }

    // Clean inactive sessions (older than 1 hour)
    const sessionTimeout = 3600000;
    for (const [key, session] of this.activeSessions.entries()) {
      if (now - session.activatedAt > sessionTimeout) {
        this.activeSessions.delete(key);
      }
    }

    return cleaned;
  }

  /**
   * Get metrics for diagnostics
   */
  getMetrics(): ConciseMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = { suppressedCount: 0, skippedCount: 0, errorCount: 0 };
  }

  /**
   * Check if channel is enabled
   */
  isChannelEnabled(channel: string): boolean {
    return this.enabledChannels.has(channel);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get pending suppress route count
   */
  getPendingSuppressCount(): number {
    return this.suppressRoutes.size;
  }

  private makeRouteKey(channel: string, target: string): string {
    return `${channel}::${target}`;
  }
}

export interface ConciseMetrics {
  suppressedCount: number;
  skippedCount: number;
  errorCount: number;
}
