/**
 * Reading Codex rollout transcripts.
 *
 * Pi's index covers Codex sessions as well as its own — they turn up in the
 * list and in search results — so the reader has to understand both formats or
 * roughly one session in eight opens blank.
 *
 * Codex records a flat stream of `response_item` entries rather than grouped
 * turns, and it duplicates most of them as `event_msg` entries for its own UI.
 * The `response_item` stream is the source of truth here; `event_msg` is
 * skipped except for the turn outcomes it alone reports. Consecutive assistant
 * activity is gathered back into one turn so the reader looks the same as it
 * does for a Pi session.
 */

import {
  TEXT_LIMIT,
  TOOL_RESULT_LIMIT,
  clipArguments,
  clipText,
  firstLine,
  normalizeTimestamp,
} from "./clip.ts";
import type { AssistantBlock, OutlineEntry, ToolResultView, TranscriptItem } from "./types.ts";
import type { ParsedTranscript, TranscriptStats } from "./transcript.ts";

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

/** `{"output": "...", "metadata": {...}}` is the common shape; unwrap it. */
function toolOutputText(output: unknown): string {
  if (typeof output !== "string") {
    return output == null ? "" : JSON.stringify(output, null, 2);
  }

  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const inner = (parsed as { output?: unknown }).output;
      if (typeof inner === "string") return inner;
    }
    if (Array.isArray(parsed)) {
      const texts = parsed
        .map((part) =>
          part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : null,
        )
        .filter((text): text is string => text !== null);
      if (texts.length > 0) return texts.join("\n");
    }
  } catch {
    // Not JSON: the raw string is already what the user should read.
  }

  return output;
}

/**
 * Codex has no error flag on tool results — failure shows up as a non-zero
 * exit code, either in the wrapper metadata or in the command output itself.
 */
function looksFailed(raw: unknown, text: string): boolean {
  const metadata = String(raw ?? "");
  if (/"exit_code":\s*(?!0\b)-?\d+/.test(metadata)) return true;
  return /Process exited with code (?!0\b)\d+/.test(text);
}

/**
 * Codex opens every session by replaying the project's AGENTS.md as a user
 * message. It is machine-injected context, not something the user typed, so it
 * is shown as an event, kept out of the prompt outline, and never used as a
 * session title.
 */
export function isInjectedContext(text: string): boolean {
  const head = text.slice(0, 200);
  return (
    /^#\s*AGENTS\.md instructions for /.test(head) ||
    /^<(environment_context|user_instructions|permissions instructions)>/.test(head.trimStart())
  );
}

/** Codex stores call arguments as a JSON string; show structure when it parses. */
function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return clipArguments(value);
  try {
    return clipArguments(JSON.parse(value));
  } catch {
    return clipArguments(value);
  }
}

function messageText(content: unknown): { text: string; images: number } {
  if (!Array.isArray(content)) return { text: "", images: 0 };

  const texts: string[] = [];
  let images = 0;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as { type?: string; text?: string };
    if (block.type === "input_text" || block.type === "output_text") {
      if (typeof block.text === "string") texts.push(block.text);
    } else if (block.type === "input_image") {
      images += 1;
    }
  }

  return { text: texts.join("\n"), images };
}

/** Reasoning text lives in `summary[]`; `content` is usually null or encrypted. */
function reasoningText(payload: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const key of ["summary", "content"]) {
    const value = payload[key];
    if (!Array.isArray(value)) continue;
    for (const part of value) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        parts.push((part as { text: string }).text);
      }
    }
  }

  return parts.join("\n\n");
}

export function parseCodexTranscript(entries: CodexEntry[]): ParsedTranscript {
  // Tool results are matched by call id, exactly as in the Pi parser.
  const results = new Map<string, ToolResultView>();
  for (const entry of entries) {
    if (entry.type !== "response_item") continue;
    const payload = entry.payload ?? {};
    if (payload.type !== "function_call_output" && payload.type !== "custom_tool_call_output") {
      continue;
    }
    const callId = payload.call_id;
    if (typeof callId !== "string") continue;

    const { text, truncated, fullLength } = clipText(
      toolOutputText(payload.output),
      TOOL_RESULT_LIMIT,
    );
    results.set(callId, {
      text,
      isError: looksFailed(payload.output, text),
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
  let model: string | undefined;
  let lastTimestamp = "";

  /** Assistant activity accumulates here until a user turn closes it. */
  let pending: AssistantBlock[] = [];
  let pendingId = "";
  let pendingTimestamp = "";

  const flush = () => {
    if (pending.length === 0) return;
    stats.assistantMessages += 1;
    items.push({
      kind: "assistant",
      id: pendingId,
      timestamp: pendingTimestamp,
      blocks: pending,
      model,
    });
    pending = [];
  };

  const startTurn = (id: string, timestamp: string) => {
    if (pending.length === 0) {
      pendingId = id;
      pendingTimestamp = timestamp;
    }
  };

  for (const [index, entry] of entries.entries()) {
    const timestamp = normalizeTimestamp(entry.timestamp, lastTimestamp);
    lastTimestamp = timestamp || lastTimestamp;
    const payload = entry.payload ?? {};
    const id = `c${index}`;

    if (entry.type === "session_meta") {
      sessionId = typeof payload.id === "string" ? payload.id : undefined;
      cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
      continue;
    }

    if (entry.type === "turn_context") {
      const next = typeof payload.model === "string" ? payload.model : undefined;
      if (next && next !== model) {
        // Only announce a real change; every turn carries the current model.
        if (model !== undefined) {
          flush();
          items.push({ kind: "modelChange", id, timestamp, modelId: next });
        }
        model = next;
      }
      continue;
    }

    if (entry.type === "compacted") {
      flush();
      stats.compactions += 1;
      items.push({
        kind: "compaction",
        id,
        timestamp,
        summary: clipText(payload.message, TEXT_LIMIT).text,
      });
      continue;
    }

    if (entry.type === "event_msg") {
      // Everything here duplicates a response_item except the turn outcome.
      if (payload.type === "turn_aborted") {
        flush();
        items.push({
          kind: "label",
          id,
          timestamp,
          label: `aborted${payload.reason ? `: ${payload.reason}` : ""}`,
        });
      }
      continue;
    }

    if (entry.type !== "response_item") continue;

    switch (payload.type) {
      case "message": {
        const role = payload.role;
        // `developer` messages are injected policy text, repeated every turn.
        if (role === "developer" || role === "system") break;

        const { text, images } = messageText(payload.content);
        if (!text && images === 0) break;

        if (role === "user") {
          flush();

          if (isInjectedContext(text)) {
            items.push({
              kind: "custom",
              id,
              timestamp,
              customType: "project instructions",
              text: clipText(text, 2_000).text,
            });
            break;
          }

          const clipped = clipText(text, TEXT_LIMIT);
          stats.userMessages += 1;
          outline.push({
            id,
            timestamp,
            title: firstLine(text) || (images > 0 ? "[image]" : "—"),
            index: items.length,
          });
          items.push({
            kind: "user",
            id,
            timestamp,
            text: clipped.text,
            truncated: clipped.truncated,
            fullLength: clipped.fullLength,
            images,
          });
        } else {
          startTurn(id, timestamp);
          pending.push({ type: "text", ...clipText(text, TEXT_LIMIT) });
        }
        break;
      }

      case "reasoning": {
        const text = reasoningText(payload);
        if (!text) break;
        startTurn(id, timestamp);
        stats.thinkingBlocks += 1;
        pending.push({ type: "thinking", ...clipText(text, TEXT_LIMIT) });
        break;
      }

      case "function_call":
      case "custom_tool_call": {
        const name = typeof payload.name === "string" ? payload.name : "tool";
        const callId = typeof payload.call_id === "string" ? payload.call_id : undefined;
        const result = callId ? results.get(callId) : undefined;

        startTurn(id, timestamp);
        stats.toolCalls += 1;
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
        if (result?.isError) stats.toolErrors += 1;

        pending.push({
          type: "toolCall",
          toolCallId: callId,
          toolName: name,
          // `function_call` carries JSON in `arguments`; `custom_tool_call` uses `input`.
          arguments: parseArguments(payload.arguments ?? payload.input),
          result,
        });
        break;
      }

      case "web_search_call": {
        const action = payload.action as { query?: string } | undefined;
        startTurn(id, timestamp);
        stats.toolCalls += 1;
        toolCounts.set("web_search", (toolCounts.get("web_search") ?? 0) + 1);
        pending.push({
          type: "toolCall",
          toolName: "web_search",
          arguments: action?.query ? { query: action.query } : undefined,
        });
        break;
      }

      default:
        // Outputs were consumed in the pairing pass; other kinds carry no prose.
        break;
    }
  }

  flush();

  stats.toolCounts = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { items, outline, stats, sessionId, cwd, malformedLines: 0, format: "codex" };
}
