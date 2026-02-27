/**
 * Infrastructure Layer - Utilities
 *
 * Common utility functions used across the infrastructure layer.
 */

// ============================================================================
// Message Utilities
// ============================================================================

/**
 * Split a long message into chunks that fit within a platform's limit.
 *
 * Strategy:
 * 1. Try to split at paragraph boundaries (\n\n)
 * 2. Fall back to line boundaries (\n)
 * 3. Fall back to hard cut with continuation marker
 * 4. Preserve code block fences across chunks
 */
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let inCodeBlock = false;
  let codeBlockLang = "";

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(inCodeBlock ? remaining : remaining);
      break;
    }

    let splitAt = maxLength - 50;

    // Check for code block state
    const upToSplit = remaining.slice(0, splitAt);
    const codeBlockMatches = upToSplit.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      inCodeBlock = true;
      const lastFence = upToSplit.lastIndexOf("```");
      const langMatch = upToSplit.slice(lastFence + 3).match(/^(\w+)/);
      codeBlockLang = langMatch?.[1] ?? "";
    }

    // Try paragraph boundary
    const paraIdx = remaining.lastIndexOf("\n\n", splitAt);
    if (paraIdx > splitAt * 0.3) {
      splitAt = paraIdx;
    } else {
      // Fall back to line boundary
      const lineIdx = remaining.lastIndexOf("\n", splitAt);
      if (lineIdx > splitAt * 0.3) {
        splitAt = lineIdx;
      }
    }

    let chunk = remaining.slice(0, splitAt);

    // Close code block if needed
    if (inCodeBlock) {
      chunk += "\n```";
    }

    chunks.push(chunk);

    remaining = remaining.slice(splitAt).replace(/^\n+/, "");

    // Reopen code block for next chunk
    if (inCodeBlock) {
      remaining = "```" + codeBlockLang + "\n" + remaining;
      inCodeBlock = false;
    }
  }

  return chunks;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

/**
 * Parse a time string like "30m", "1h", "5m" to milliseconds.
 */
export function parseDuration(str: string): number {
  const match = str.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) throw new Error(`Invalid duration format: ${str}`);

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Create a debouncer that delays execution until `delayMs` after the last call.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T;
}

/**
 * Create a promise that resolves after a delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const { maxRetries, initialDelayMs, maxDelayMs = 30_000, onRetry } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxRetries) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );
      await sleep(delay);
    }
  }

  throw lastError!;
}

// ============================================================================
// Object Utilities
// ============================================================================

/**
 * Deep merge two objects.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sv = (source as Record<string, unknown>)[key];
    const tv = result[key];

    if (
      isPlainObject(sv) &&
      isPlainObject(tv)
    ) {
      result[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>
      );
    } else if (sv !== undefined) {
      result[key] = sv;
    }
  }

  return result as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null &&
    typeof v === "object" &&
    Object.prototype.toString.call(v) === "[object Object]";
}

/**
 * Pick specific keys from an object.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    delete result[key as string];
  }
  return result as Omit<T, K>;
}
