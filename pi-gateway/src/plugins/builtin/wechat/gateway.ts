import type { WechatInboundMessage, WechatAccountRuntime } from "./types.ts";
import { fetchWechatUpdates } from "./api.ts";
import { handleWechatMessage } from "./handlers.ts";
import {
  initSyncBuf,
  updateSyncBuf,
  isSessionPaused,
  getRemainingPauseMs,
  handleSessionExpiry,
  isDuplicate,
} from "./session.ts";
import { logger } from "./logger.ts";

/**
 * Default long-poll interval for getUpdates (milliseconds).
 */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Default reconnect delay on error (milliseconds).
 */
const DEFAULT_RECONNECT_DELAY_MS = 5000;

/**
 * Maximum reconnect delay (exponential backoff cap).
 */
const MAX_RECONNECT_DELAY_MS = 60000;

/**
 * Number of consecutive failures before extended backoff.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Extended backoff delay (milliseconds).
 */
const EXTENDED_BACKOFF_MS = 30000;

/**
 * Session pause duration (milliseconds) - 8 minutes.
 */
const SESSION_PAUSE_DURATION_MS = 8 * 60 * 1000;

/**
 * Start the Weixin long-poll gateway for a single account.
 * Continuously polls ilink getUpdates API and dispatches messages.
 */
export async function startWechatGateway(
  runtime: WechatAccountRuntime,
  onMessage: (msg: WechatInboundMessage) => Promise<void>
): Promise<void> {
  logger.info(`[wechat:gateway] starting for accountId=${runtime.accountId}`);

  // Initialize sync buffer
  initSyncBuf(runtime);

  let consecutiveFailures = 0;
  let nextPollInterval = DEFAULT_POLL_INTERVAL_MS;

  const poll = async (): Promise<void> => {
    if (runtime.disposed) {
      logger.info(`[wechat:gateway] stopped (disposed) for accountId=${runtime.accountId}`);
      return;
    }

    // Check session pause
    if (isSessionPaused(runtime.accountId)) {
      const remainingMs = getRemainingPauseMs(runtime.accountId);
      logger.info(
        `[wechat:gateway] session paused for accountId=${runtime.accountId}, waiting ${Math.ceil(remainingMs / 1000)}s`
      );
      runtime.reconnectTimer = setTimeout(poll, Math.min(remainingMs, 60000));
      return;
    }

    try {
      const { messages, getUpdatesBuf, longpollingTimeoutMs } = await fetchWechatUpdates(runtime);

      // Update sync buffer
      if (getUpdatesBuf) {
        updateSyncBuf(runtime, getUpdatesBuf);
      }

      // Update poll interval from server suggestion
      if (longpollingTimeoutMs && longpollingTimeoutMs > 0) {
        nextPollInterval = Math.max(1000, longpollingTimeoutMs - 30000);
      }

      // Reset consecutive failures on success
      consecutiveFailures = 0;

      // Update last event time
      runtime.lastEventAt = Date.now();

      // Process messages
      for (const msg of messages) {
        const msgId = msg.msg_id ?? `${msg.from_user_id}-${msg.create_time_ms}`;

        // Deduplication
        if (isDuplicate(runtime, msgId)) {
          logger.debug(`[wechat:gateway] dropping duplicate message ${msgId}`);
          continue;
        }

        try {
          await onMessage(msg);
        } catch (err) {
          logger.error(
            `[wechat:gateway] message handler error for ${msgId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Schedule next poll
      runtime.pollTimer = setTimeout(poll, nextPollInterval);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`[wechat:gateway] poll error for accountId=${runtime.accountId}: ${errorMessage}`);

      // Check for session expiry (errcode -14)
      const anyErr = err as any;
      if (handleSessionExpiry(runtime.accountId, anyErr?.errcode, anyErr?.ret)) {
        logger.warn(
          `[wechat:gateway] session expired for accountId=${runtime.accountId}, pausing for ${Math.ceil(SESSION_PAUSE_DURATION_MS / 60000)} minutes`
        );
        consecutiveFailures = 0;
        runtime.reconnectTimer = setTimeout(poll, SESSION_PAUSE_DURATION_MS);
        return;
      }

      // Increment consecutive failures
      consecutiveFailures++;

      // Calculate backoff delay
      let delay = DEFAULT_RECONNECT_DELAY_MS;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Extended backoff after too many failures
        delay = EXTENDED_BACKOFF_MS;
        logger.warn(
          `[wechat:gateway] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, extended backoff ${EXTENDED_BACKOFF_MS}ms`
        );
        consecutiveFailures = 0; // Reset after extended backoff
      } else {
        // Exponential backoff with cap
        delay = Math.min(DEFAULT_RECONNECT_DELAY_MS * Math.pow(2, consecutiveFailures - 1), MAX_RECONNECT_DELAY_MS);
      }

      runtime.reconnectTimer = setTimeout(poll, delay);
    }
  };

  // Start polling
  await poll();
}

/**
 * Stop the Weixin long-poll gateway.
 */
export async function stopWechatGateway(runtime: WechatAccountRuntime): Promise<void> {
  logger.info(`[wechat:gateway] stopping for accountId=${runtime.accountId}`);
  runtime.disposed = true;

  if (runtime.pollTimer) {
    clearTimeout(runtime.pollTimer);
    runtime.pollTimer = null;
  }

  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }

  // Clear caches
  runtime.contextTokens.clear();
  runtime.dedup.clear();
  runtime.streamPlaceholders.clear();

  logger.info(`[wechat:gateway] stopped for accountId=${runtime.accountId}`);
}

/**
 * Start gateways for all accounts in runtime.
 */
export async function startAllGateways(
  runtimes: Map<string, WechatAccountRuntime>,
  onMessage: (accountId: string, msg: WechatInboundMessage) => Promise<void>
): Promise<void> {
  const startPromises = Array.from(runtimes.entries()).map(async ([accountId, runtime]) => {
    if (!runtime.token) {
      logger.warn(`[wechat:gateway] skipping accountId=${accountId} (no token)`);
      return;
    }

    await startWechatGateway(runtime, async (msg) => {
      await onMessage(accountId, msg);
    });
  });

  await Promise.all(startPromises);
}

/**
 * Stop gateways for all accounts.
 */
export async function stopAllGateways(runtimes: Map<string, WechatAccountRuntime>): Promise<void> {
  const stopPromises = Array.from(runtimes.values()).map((runtime) => stopWechatGateway(runtime));
  await Promise.all(stopPromises);
}
