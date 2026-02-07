/**
 * Utility functions for pi-gateway.
 */

// ============================================================================
// Message Chunking (respects platform limits)
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

    // Find a good split point
    let splitAt = maxLength - 50; // Leave room for continuation marker

    // Check if we're inside a code block
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
      // Try line boundary
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

    // Re-open code block in next chunk
    if (inCodeBlock) {
      remaining = `\`\`\`${codeBlockLang}\n${remaining}`;
      inCodeBlock = false;
    }
  }

  return chunks;
}

// ============================================================================
// Markdown Formatting Helpers
// ============================================================================

/**
 * Convert standard Markdown to Telegram-compatible MarkdownV2.
 * Telegram requires escaping special characters outside code blocks.
 */
export function markdownToTelegram(text: string): string {
  // For now, just return as-is; Telegram's Markdown mode handles basic formatting
  // Full MarkdownV2 escaping is complex and can wait
  return text;
}

/**
 * Convert Markdown to Discord-compatible format.
 * Discord natively supports most Markdown, but has some quirks.
 */
export function markdownToDiscord(text: string): string {
  // Discord supports standard Markdown well
  return text;
}

// ============================================================================
// Timing
// ============================================================================

/**
 * Create a debouncer that delays execution until `delayMs` after the last call.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T;
}

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
