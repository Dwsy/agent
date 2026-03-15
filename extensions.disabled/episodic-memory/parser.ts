/**
 * Parser for pi's JSONL session format.
 * Extracts user↔assistant exchanges into searchable chunks.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface SessionMeta {
	id: string;
	timestamp: string;
	cwd: string;
	filePath: string;
	project: string; // derived from parent dir name
}

export interface MessageEntry {
	role: "user" | "assistant" | "toolResult";
	text: string;
	timestamp: string;
}

export interface ConversationChunk {
	session: SessionMeta;
	messages: MessageEntry[];
	text: string; // combined text for embedding
	startTime: string;
	endTime: string;
	chunkIndex: number;
}

interface RawEntry {
	type: string;
	id?: string;
	timestamp?: string;
	message?: {
		role?: string;
		content?: Array<{ type: string; text?: string; thinking?: string }>;
		timestamp?: number;
	};
	cwd?: string;
	version?: number;
}

/**
 * Extract text from a message's content array.
 */
function extractText(content: Array<{ type: string; text?: string; thinking?: string }>): string {
	const parts: string[] = [];
	for (const part of content) {
		if (part.type === "text" && part.text) {
			parts.push(part.text);
		}
	}
	return parts.join("\n");
}

/**
 * Parse a session JSONL file into metadata and messages.
 */
export function parseSessionFile(filePath: string): { session: SessionMeta; messages: MessageEntry[] } | null {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}

	const lines = raw.split("\n").filter((l) => l.trim());
	if (lines.length === 0) return null;

	let session: SessionMeta | null = null;
	const messages: MessageEntry[] = [];

	for (const line of lines) {
		let entry: RawEntry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		if (entry.type === "session") {
			// Use parent directory name as project (handles nested paths)
			const pathParts = filePath.split(path.sep);
			const parentDir = pathParts[pathParts.length - 2] || "unknown";
			session = {
				id: entry.id || path.basename(filePath, ".jsonl"),
				timestamp: entry.timestamp || "",
				cwd: entry.cwd || "",
				filePath,
				project: parentDir,
			};
			continue;
		}

		if (entry.type === "message" && entry.message) {
			const msg = entry.message;
			const role = msg.role as string;

			if ((role === "user" || role === "assistant") && msg.content) {
				const text = extractText(msg.content);
				if (text.trim()) {
					messages.push({
						role: role as "user" | "assistant",
						text,
						timestamp: entry.timestamp || "",
					});
				}
			}
		}
	}

	if (!session) return null;
	return { session, messages };
}

/**
 * Check if a session contains the exclusion marker.
 */
export function shouldExclude(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return content.includes("<EPISODIC-MEMORY-EXCLUDE/>");
	} catch {
		return false;
	}
}

/**
 * Chunk messages into groups of ~4 turns for embedding.
 * Each chunk overlaps by 1 turn with the next for continuity.
 */
export function chunkMessages(session: SessionMeta, messages: MessageEntry[], turnsPerChunk = 4): ConversationChunk[] {
	if (messages.length === 0) return [];

	const chunks: ConversationChunk[] = [];
	const overlap = 1;
	let i = 0;
	let chunkIndex = 0;

	while (i < messages.length) {
		const end = Math.min(i + turnsPerChunk * 2, messages.length); // *2 because user+assistant = 1 turn
		const slice = messages.slice(i, end);

		const textParts: string[] = [];
		for (const msg of slice) {
			const prefix = msg.role === "user" ? "User" : "Assistant";
			textParts.push(`${prefix}: ${msg.text}`);
		}

		chunks.push({
			session,
			messages: slice,
			text: textParts.join("\n\n"),
			startTime: slice[0].timestamp,
			endTime: slice[slice.length - 1].timestamp,
			chunkIndex,
		});

		// Advance by (turnsPerChunk - overlap) * 2 messages
		const advance = Math.max((turnsPerChunk - overlap) * 2, 2);
		i += advance;
		chunkIndex++;
	}

	return chunks;
}

/**
 * Discover all session files recursively in a directory.
 */
export function discoverSessionFiles(sessionsDir: string): string[] {
	const files: string[] = [];

	if (!fs.existsSync(sessionsDir)) return files;

	function walkDir(dir: string) {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walkDir(fullPath);
				} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
					files.push(fullPath);
				}
			}
		} catch {
			// ignore errors
		}
	}

	walkDir(sessionsDir);
	return files;
}
