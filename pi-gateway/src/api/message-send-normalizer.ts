export interface StreamHints {
  streamMode?: string;
  streamId?: string | number;
  channelMeta?: Record<string, unknown>;
  legacyStreamId?: number;
}

export function normalizeStreamHints(hints: StreamHints): {
  streamMode?: string;
  streamId?: string | number;
  channelMeta?: Record<string, unknown>;
} {
  const streamMode = typeof hints.streamMode === "string" ? hints.streamMode : undefined;

  let streamId = hints.streamId;
  if (streamId === undefined && typeof hints.legacyStreamId === "number") {
    streamId = hints.legacyStreamId;
  }

  const base = hints.channelMeta ? { ...hints.channelMeta } : {};

  if (streamMode && base.transport === undefined) {
    base.transport = streamMode;
  }

  if (streamId !== undefined && base.streamId === undefined && base.draftId === undefined) {
    base.streamId = streamId;
  }

  const channelMeta = Object.keys(base).length > 0 ? base : undefined;

  return {
    streamMode,
    streamId,
    channelMeta,
  };
}
