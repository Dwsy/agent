/**
 * Network resilience — error classification and retry wrapper.
 *
 * Ported from legacy network-errors.ts, adapted for chat-sdk.
 */

/**
 * Classify whether a Telegram API error is transient (retryable).
 * Transient: network errors, timeouts, 429 rate limits, 5xx server errors.
 * Permanent: 400 bad request, 403 forbidden, 404 not found.
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;

  const anyErr = err as Record<string, unknown>;
  const msg = String(anyErr?.message ?? err ?? "").toLowerCase();

  // Network-level errors
  if (
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("socket") ||
    msg.includes("temporarily") ||
    msg.includes("timeout")
  ) {
    return true;
  }

  // HTTP status code checks
  const statusCode = anyErr?.error_code ?? anyErr?.statusCode ?? anyErr?.status;
  if (typeof statusCode === "number") {
    if (statusCode === 429) return true; // Rate limited
    if (statusCode >= 500) return true;  // Server error
    if (statusCode === 400 || statusCode === 403 || statusCode === 404) return false;
  }

  // grammy-specific error codes
  const code = anyErr?.code;
  if (typeof code === "string" && (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ECONNREFUSED")) {
    return true;
  }

  return false;
}

/**
 * Check if error is a getUpdates conflict (409).
 */
export function isGetUpdatesConflict(err: unknown): boolean {
  const anyErr = err as Record<string, unknown>;
  const code = anyErr?.error_code ?? anyErr?.errorCode;
  if (code === 409) return true;
  const msg = String(anyErr?.description ?? anyErr?.message ?? err ?? "").toLowerCase();
  return msg.includes("409") && msg.includes("getupdates");
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff.
 * Only retries on transient errors.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelayMs - Base delay in ms (default: 500)
 * @returns Result of fn
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}
