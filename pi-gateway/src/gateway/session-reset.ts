/**
 * Session Reset — centralized session reset logic.
 *
 * Handles RPC new_session + state cleanup + queue drain + hooks + notifications.
 * Used by both HTTP API and plugin API.
 */

import type { GatewayContext } from "../gateway/types.ts";
import type { SessionKey } from "../core/types.ts";

export interface SessionResetResult {
  sessionKey: SessionKey;
  rpcReset: boolean;
  stateReset: boolean;
  queueCleared: number;
  eventsCleared: number;
}

/**
 * Reset a session: new RPC conversation + clear state + drain queues + notify.
 */
export async function resetSession(
  ctx: GatewayContext,
  sessionKey: SessionKey,
): Promise<SessionResetResult> {
  const result: SessionResetResult = {
    sessionKey,
    rpcReset: false,
    stateReset: false,
    queueCleared: 0,
    eventsCleared: 0,
  };

  // 1. RPC new_session
  const rpc = ctx.pool.getForSession(sessionKey);
  if (rpc) {
    await rpc.newSession();
    result.rpcReset = true;
  }

  // 2. Reset session state
  const session = ctx.sessions.get(sessionKey);
  if (session) {
    session.messageCount = 0;
    session.lastActivity = Date.now();
    ctx.sessions.touch(sessionKey);
    result.stateReset = true;
  }

  // 3. Clear system events for this session
  if (ctx.systemEvents) {
    const pending = ctx.systemEvents.consume(sessionKey);
    result.eventsCleared = pending.length;
  }

  // 4. Clear message queue collect buffer for this session
  if (ctx.queue) {
    result.queueCleared = ctx.queue.clearCollectBuffer(sessionKey);
  }

  // 5. Fire hooks: session_end (old) → session_reset → session_start (new)
  try {
    await ctx.registry.hooks.dispatch("session_end", { sessionKey });
    await ctx.registry.hooks.dispatch("session_reset", { sessionKey });
    await ctx.registry.hooks.dispatch("session_start", { sessionKey });
  } catch {
    // Non-fatal: hooks shouldn't block reset
  }

  // 6. Broadcast to WS clients
  ctx.broadcastToWs("session_reset", { sessionKey });

  // 7. Log
  ctx.transcripts.logMeta(sessionKey, "session_reset", { ...result });

  ctx.log.info(`[SESSION-RESET] ${sessionKey} rpc=${result.rpcReset} state=${result.stateReset} queue=${result.queueCleared} events=${result.eventsCleared}`);

  return result;
}
