/**
 * Turning a session `.jsonl` file into something readable.
 *
 * The raw transcript is awkward to read directly: two thirds of its entries are
 * `toolResult` messages that sit far away from the call they answer, and a
 * single tool result can be longer than the entire conversation around it.
 * This module normalizes a file into a flat list of items, folds each tool
 * result into the call that produced it, and clips oversized payloads so a
 * response stays transportable.
 *
 * The file on disk is the source of truth and is only ever read.
 */

import { readFileSync, statSync } from "node:fs";

import {
  TEXT_LIMIT,
  TOOL_RESULT_LIMIT,
  clipArguments,
  clipText,
  firstLine,
  normalizeTimestamp,
} from "./clip.ts";
import { parseCodexTranscript } from "./codex.ts";
import type { AssistantBlock, OutlineEntry, ToolResultView, TranscriptItem } from "./types.ts";

export interface TranscriptStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolErrors: number;
  thinkingBlocks: number;
  compactions: number;
  toolCounts: Array<{ name: string; count: number }>;
}

export interface ParsedTranscript {
  items: TranscriptItem[];
  outline: OutlineEntry[];
  stats: TranscriptStats;
  /** Session id from the file header, when present. */
  sessionId?: string;
  cwd?: string;
  /** Latest assigned session name. */
  name?: string;
  /** Lines that could not be parsed as JSON. */
  malformedLines: number;
  /** Which agent wrote the transcript. */
  format: "pi" | "codex";
}

/** Flatten the `content` array of a tool result into displayable text. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as { type?: string; text?: string };
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (block.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

interface RawEntry {
  type?: string;
  id?: string;
  parentId?: string;
  fromId?: string;
  targetId?: string;
  timestamp?: string;
  summary?: string;
  label?: string;
  name?: string;
  provider?: string;
  modelId?: string;
  customType?: string;
  content?: unknown;
  data?: unknown;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    provider?: string;
    stopReason?: string;
    timestamp?: number | string;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: { total?: number };
    };
  };
}

/**
 * Parse a transcript file.
 *
 * Two passes: the first collects tool results by call id, the second builds the
 * item list so each call can carry its outcome. Both run over an already-parsed
 * array because a 25MB file — the largest present — parses in well under a
 * second, and pairing needs random access anyway.
 */
export function parseTranscript(path: string): ParsedTranscript {
  const raw = readFileSync(path, "utf8");
  const entries: RawEntry[] = [];
  let malformedLines = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as RawEntry);
    } catch {
      malformedLines += 1;
    }
  }

  // Codex rollouts open with `session_meta`; Pi transcripts with `session`.
  if (entries.some((entry) => entry.type === "session_meta")) {
    const parsed = parseCodexTranscript(entries as never[]);
    return { ...parsed, malformedLines };
  }

  const results = new Map<string, ToolResultView>();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "toolResult") continue;
    const callId = entry.message.toolCallId;
    if (!callId) continue;

    const { text, truncated, fullLength } = clipText(toolResultText(entry.message.content), TOOL_RESULT_LIMIT);
    results.set(callId, {
      text,
      isError: entry.message.isError === true,
      truncated: truncated === true,
      fullLength: fullLength ?? text.length,
    });
  }

  const items: TranscriptItem[] = [];
  const outline: OutlineEntry[] = [];
  const toolCounts = new Map<string, number>();
  const stats: TranscriptStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolErrors: 0,
    thinkingBlocks: 0,
    compactions: 0,
    toolCounts: [],
  };

  let sessionId: string | undefined;
  let cwd: string | undefined;
  let name: string | undefined;
  let lastTimestamp = "";

  for (const entry of entries) {
    const id = entry.id ?? `${items.length}`;
    const timestamp = normalizeTimestamp(entry.timestamp, lastTimestamp);
    lastTimestamp = timestamp || lastTimestamp;

    switch (entry.type) {
      case "session": {
        sessionId = entry.id;
        cwd = entry.cwd;
        break;
      }

      case "session_info": {
        if (entry.name) {
          name = entry.name;
          items.push({ kind: "sessionInfo", id, timestamp, name: entry.name });
        }
        break;
      }

      case "compaction": {
        stats.compactions += 1;
        items.push({ kind: "compaction", id, timestamp, summary: clipText(entry.summary, TEXT_LIMIT).text });
        break;
      }

      case "branch_summary": {
        items.push({
          kind: "branchSummary",
          id,
          timestamp,
          summary: clipText(entry.summary, TEXT_LIMIT).text,
          fromId: entry.fromId,
        });
        break;
      }

      case "label": {
        if (entry.label) {
          items.push({ kind: "label", id, timestamp, label: entry.label, targetId: entry.targetId });
        }
        break;
      }

      case "model_change": {
        items.push({ kind: "modelChange", id, timestamp, provider: entry.provider, modelId: entry.modelId });
        break;
      }

      case "custom_message":
      case "custom": {
        const source = entry.content ?? entry.data;
        const text = typeof source === "string" ? source : JSON.stringify(source ?? null);
        items.push({
          kind: "custom",
          id,
          timestamp,
          customType: entry.customType ?? entry.type,
          text: clipText(text, 2_000).text,
        });
        break;
      }

      case "message": {
        const message = entry.message;
        if (!message) break;
        const messageTimestamp = normalizeTimestamp(message.timestamp, timestamp);

        if (message.role === "user") {
          const parts = Array.isArray(message.content) ? message.content : [];
          const text = parts
            .filter((p): p is { type: "text"; text: string } =>
              Boolean(p && typeof p === "object" && (p as { type?: string }).type === "text"),
            )
            .map((p) => p.text)
            .join("\n");
          const images = parts.filter(
            (p) => p && typeof p === "object" && (p as { type?: string }).type === "image",
          ).length;

          const clipped = clipText(text, TEXT_LIMIT);
          stats.userMessages += 1;
          outline.push({
            id,
            timestamp: messageTimestamp,
            title: firstLine(text) || (images > 0 ? "[image]" : "—"),
            index: items.length,
          });
          items.push({
            kind: "user",
            id,
            timestamp: messageTimestamp,
            text: clipped.text,
            truncated: clipped.truncated,
            fullLength: clipped.fullLength,
            images,
          });
          break;
        }

        if (message.role === "assistant") {
          const blocks: AssistantBlock[] = [];
          for (const part of Array.isArray(message.content) ? message.content : []) {
            if (!part || typeof part !== "object") continue;
            const block = part as {
              type?: string;
              text?: string;
              thinking?: string;
              id?: string;
              name?: string;
              arguments?: unknown;
            };

            if (block.type === "text") {
              const clipped = clipText(block.text, TEXT_LIMIT);
              blocks.push({ type: "text", ...clipped });
            } else if (block.type === "thinking") {
              stats.thinkingBlocks += 1;
              const clipped = clipText(block.thinking ?? block.text, TEXT_LIMIT);
              blocks.push({ type: "thinking", ...clipped });
            } else if (block.type === "toolCall") {
              stats.toolCalls += 1;
              const toolName = block.name ?? "tool";
              toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
              const result = block.id ? results.get(block.id) : undefined;
              if (result?.isError) stats.toolErrors += 1;
              blocks.push({
                type: "toolCall",
                toolCallId: block.id,
                toolName,
                arguments: clipArguments(block.arguments),
                result,
              });
            } else if (block.type === "image") {
              blocks.push({ type: "image" });
            }
          }

          // A turn that produced nothing visible adds noise, not information.
          if (blocks.length === 0) break;

          stats.assistantMessages += 1;
          const usage = message.usage;
          items.push({
            kind: "assistant",
            id,
            timestamp: messageTimestamp,
            blocks,
            model: message.model,
            provider: message.provider,
            stopReason: message.stopReason,
            usage: usage
              ? {
                  input: usage.input ?? 0,
                  output: usage.output ?? 0,
                  cacheRead: usage.cacheRead ?? 0,
                  cacheWrite: usage.cacheWrite ?? 0,
                  total: usage.totalTokens ?? 0,
                  cost: usage.cost?.total ?? 0,
                }
              : undefined,
          });
        }

        // `toolResult` rows were consumed in the pairing pass above.
        break;
      }

      default:
        // `thinking_level_change` and unknown future types carry nothing to read.
        break;
    }
  }

  stats.toolCounts = [...toolCounts.entries()]
    .map(([toolName, count]) => ({ name: toolName, count }))
    .sort((a, b) => b.count - a.count);

  return { items, outline, stats, sessionId, cwd, name, malformedLines, format: "pi" };
}

/**
 * Parsed transcripts, keyed by path and invalidated on file change.
 *
 * Paging through a session must not re-parse the file on every request. The
 * cache is deliberately tiny: entries are large, and a reader looks at one
 * session at a time.
 */
export class TranscriptCache {
  #entries = new Map<string, { mtimeMs: number; size: number; parsed: ParsedTranscript }>();
  #limit: number;

  constructor(limit = 4) {
    this.#limit = limit;
  }

  get(path: string): ParsedTranscript {
    const stat = statSync(path);
    const cached = this.#entries.get(path);

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      // Refresh recency for the LRU eviction below.
      this.#entries.delete(path);
      this.#entries.set(path, cached);
      return cached.parsed;
    }

    const parsed = parseTranscript(path);
    this.#entries.delete(path);
    this.#entries.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, parsed });

    while (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }

    return parsed;
  }

  clear(): void {
    this.#entries.clear();
  }
}
