/**
 * Transcript reader over pi session JSONL files.
 *
 * WHY flattening here: the wire contract exposes TranscriptEntry only, so
 * message/block shapes stay local to this module.
 */
import { readFileSync } from "node:fs";
import type { TranscriptEntry } from "../protocol.ts";

const TOOL_RESULT_TEXT_LIMIT = 500;

export interface TranscriptQuery {
	limit?: number;
	beforeEntryId?: string;
}

interface RawBlock {
	type?: unknown;
	text?: unknown;
}

interface RawMessage {
	role?: unknown;
	content?: unknown;
	toolName?: unknown;
	isError?: unknown;
}

interface RawLine {
	type?: unknown;
	id?: unknown;
	timestamp?: unknown;
	message?: RawMessage;
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Concatenated text blocks; assistant thinking/toolCall blocks contribute nothing. */
function textOf(blocks: RawBlock[]): string {
	return blocks
		.filter(b => b?.type === "text" && typeof b.text === "string")
		.map(b => b.text as string)
		.join("\n");
}

function toBlocks(content: unknown): RawBlock[] {
	if (Array.isArray(content)) return content as RawBlock[];
	// Tolerate plain-string content (some producers emit it for user messages).
	if (typeof content === "string") return [{ type: "text", text: content }];
	return [];
}

function toEntry(line: RawLine): TranscriptEntry | null {
	const msg = line.message;
	if (!msg) return null;
	const role = typeof msg.role === "string" ? msg.role : "unknown";
	let text = textOf(toBlocks(msg.content));
	if (role === "toolResult") text = text.slice(0, TOOL_RESULT_TEXT_LIMIT);
	if (!text.trim()) return null; // empty-text entries carry nothing to show
	const entry: TranscriptEntry = {
		id: typeof line.id === "string" ? line.id : "",
		timestamp: typeof line.timestamp === "string" ? line.timestamp : "",
		role,
		text,
	};
	if (typeof msg.toolName === "string") entry.toolName = msg.toolName;
	if (typeof msg.isError === "boolean") entry.isError = msg.isError;
	return entry;
}

/**
 * Flatten a session JSONL file to TranscriptEntry[], oldest first.
 * `limit` keeps the newest N; `beforeEntryId` paginates backwards from an id.
 */
export function readTranscript(sessionFile: string, opts: TranscriptQuery = {}): TranscriptEntry[] {
	let raw: string;
	try {
		raw = readFileSync(sessionFile, "utf8");
	} catch (err) {
		throw new Error(`pi-mesh: cannot read transcript ${sessionFile}: ${errMessage(err)}`);
	}
	const entries: TranscriptEntry[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: RawLine;
		try {
			parsed = JSON.parse(trimmed) as RawLine;
		} catch {
			continue; // tolerate truncated/garbage lines from crashed writers
		}
		if (parsed?.type !== "message") continue; // session/model_change/custom/... lines are ignored
		const entry = toEntry(parsed);
		if (entry) entries.push(entry);
	}
	let result = entries;
	if (opts.beforeEntryId !== undefined) {
		const idx = result.findIndex(e => e.id === opts.beforeEntryId);
		if (idx >= 0) result = result.slice(0, idx);
		// Unknown cursor: fall back to the unfiltered tail (simplest sane behavior).
	}
	if (typeof opts.limit === "number" && Number.isFinite(opts.limit) && opts.limit >= 0) {
		result = result.slice(Math.max(0, result.length - opts.limit));
	}
	return result;
}
