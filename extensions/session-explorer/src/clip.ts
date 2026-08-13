/**
 * Size limits and text normalization shared by the transcript parsers.
 *
 * A transcript can carry a whole file inside one tool call. Clipping happens
 * at parse time so an oversized payload never reaches the wire, and every clip
 * records the original length so the UI can say what it is not showing.
 */

/** Tool output is reference material, not prose: clip it hard. */
export const TOOL_RESULT_LIMIT = 4_000;
/** String arguments (file contents in a `write`, say) are clipped harder still. */
export const ARGUMENT_LIMIT = 1_500;
/** Prose is the thing being read, so it survives nearly intact. */
export const TEXT_LIMIT = 24_000;

export interface ClippedText {
  text: string;
  truncated?: boolean;
  fullLength?: number;
}

export function clipText(value: unknown, limit: number): ClippedText {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= limit) return { text };
  return { text: text.slice(0, limit), truncated: true, fullLength: text.length };
}

/** Collapse long string leaves so a `write` call does not ship a whole file. */
export function clipArguments(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > ARGUMENT_LIMIT ? `${value.slice(0, ARGUMENT_LIMIT)}…` : value;
  }
  if (depth >= 6) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => clipArguments(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = clipArguments(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/** Collapse whitespace and clip, for outline titles and one-line previews. */
export function firstLine(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Normalize the several timestamp shapes the transcripts use to an ISO string. */
export function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return fallback;
}
