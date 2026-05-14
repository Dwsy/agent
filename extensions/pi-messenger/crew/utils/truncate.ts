/**
 * Crew - Output Truncation
 * 
 * Prevents token explosion from verbose agent outputs.
 */

export interface MaxOutputConfig {
  bytes?: number;
  lines?: number;
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
  originalBytes?: number;
  originalLines?: number;
  artifactPath?: string;
}

export const DEFAULT_MAX_OUTPUT: Required<MaxOutputConfig> = {
  bytes: 200 * 1024,  // 200KB
  lines: 5000,
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Truncate output to fit within limits.
 */
export function truncateOutput(
  output: string,
  config: MaxOutputConfig,
  artifactPath?: string
): TruncationResult {
  const maxBytes = config.bytes ?? DEFAULT_MAX_OUTPUT.bytes;
  const maxLines = config.lines ?? DEFAULT_MAX_OUTPUT.lines;

  const lines = output.split("\n");
  const bytes = Buffer.byteLength(output, "utf-8");

  if (bytes <= maxBytes && lines.length <= maxLines) {
    return { text: output, truncated: false };
  }

  // Truncate by lines first
  let truncatedLines = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  let result = truncatedLines.join("\n");

  // Then truncate by bytes if still too large
  if (Buffer.byteLength(result, "utf-8") > maxBytes) {
    // Binary search for the right cut point
    let low = 0, high = result.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (Buffer.byteLength(result.slice(0, mid), "utf-8") <= maxBytes) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    result = result.slice(0, low);
  }

  const keptLines = result.split("\n").length;
  const fullOutputHint = artifactPath ? ` - full output at ${artifactPath}` : "";
  const marker = `[TRUNCATED: ${keptLines}/${lines.length} lines, ${formatBytes(Buffer.byteLength(result))}/${formatBytes(bytes)}${fullOutputHint}]\n`;

  return {
    text: marker + result,
    truncated: true,
    originalBytes: bytes,
    originalLines: lines.length,
    artifactPath,
  };
}
