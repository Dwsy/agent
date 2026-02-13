import type { TelegramAccountConfig } from "../../../core/config.ts";

export interface TelegramStreamCompat {
  debounceMs: number;
  editThrottleMs: number;
  streamStartChars: number;
  placeholder: string;
  streamMode: "off" | "partial" | "block";
}

const DEFAULT_DEBOUNCE_MS = 0;
const DEFAULT_EDIT_THROTTLE_MS = 500;
const DEFAULT_STREAM_START_CHARS = 1;
const DEFAULT_STREAM_PLACEHOLDER = "…";

function asNonNegativeInt(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

export function resolveStreamCompat(cfg: TelegramAccountConfig): TelegramStreamCompat {
  const legacyStreaming = cfg.streaming as Record<string, unknown> | undefined;
  const draftChunk = cfg.draftChunk ?? {};

  const debounceMs = asNonNegativeInt(
    legacyStreaming?.debounceMs,
    DEFAULT_DEBOUNCE_MS,
  );
  const editThrottleMs = asNonNegativeInt(
    legacyStreaming?.editThrottleMs,
    DEFAULT_EDIT_THROTTLE_MS,
  );
  const streamStartChars = asNonNegativeInt(
    draftChunk.minChars ?? legacyStreaming?.streamStartChars,
    DEFAULT_STREAM_START_CHARS,
  );
  const placeholderRaw =
    (typeof legacyStreaming?.placeholder === "string" && legacyStreaming.placeholder.trim())
      ? legacyStreaming.placeholder.trim()
      : DEFAULT_STREAM_PLACEHOLDER;

  return {
    debounceMs,
    editThrottleMs,
    streamStartChars,
    placeholder: placeholderRaw,
    streamMode: cfg.streamMode ?? "partial",
  };
}
