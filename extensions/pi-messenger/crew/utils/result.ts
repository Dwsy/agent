/**
 * Crew - Result Formatter
 * 
 * Helper for consistent tool result formatting.
 */

/**
 * Format a tool result with text content and structured details.
 * Matches the pattern used throughout pi-messenger handlers.
 */
export function result(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details
  };
}
