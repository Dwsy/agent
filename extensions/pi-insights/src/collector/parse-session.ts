/**
 * Turns one session transcript into a `SessionDetail`.
 *
 * Every number here is read from the transcript. Where a fact is not recorded
 * the field stays at zero or absent — nothing is inferred from message text,
 * output text, or command strings.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import {
	addUsage,
	emptyEdits,
	emptyUsage,
	IDLE_GAP_MINUTES,
	type LanguageStat,
	type ModelUsage,
	type SessionDetail,
	type SessionEvent,
	type ToolStat,
	type UsageTotals,
} from "../types.js";
import type { SessionFileRef } from "./scan.js";

/** Free text carried into a timeline label is cut here. */
const LABEL_MAX_CHARS = 120;

const IDLE_GAP_MS = IDLE_GAP_MINUTES * 60 * 1000;

/** Extensions we can name. Anything else falls back to the extension itself. */
const LANGUAGE_LABELS: Record<string, string> = {
	c: "C",
	cc: "C++",
	cpp: "C++",
	cs: "C#",
	css: "CSS",
	go: "Go",
	h: "C header",
	hpp: "C++ header",
	html: "HTML",
	java: "Java",
	js: "JavaScript",
	json: "JSON",
	jsonl: "JSONL",
	jsx: "JavaScript",
	kt: "Kotlin",
	lua: "Lua",
	md: "Markdown",
	mjs: "JavaScript",
	php: "PHP",
	py: "Python",
	rb: "Ruby",
	rs: "Rust",
	scss: "SCSS",
	sh: "Shell",
	sql: "SQL",
	svelte: "Svelte",
	swift: "Swift",
	toml: "TOML",
	ts: "TypeScript",
	tsx: "TypeScript",
	vue: "Vue",
	xml: "XML",
	yaml: "YAML",
	yml: "YAML",
	zsh: "Shell",
};

export interface ParsedSession {
	detail: SessionDetail;
	/** Lines in this file that failed `JSON.parse`. */
	badLines: number;
}

interface FileEdits {
	writes: number;
	edits: number;
	linesAdded: number;
	linesRemoved: number;
}

export interface SessionParser {
	push(line: string): void;
	/** Returns null when the file carried no `session` header. */
	finish(): ParsedSession | null;
}

/**
 * Incremental parser so a multi-megabyte transcript can be streamed rather
 * than held in memory as one string.
 */
export function createSessionParser(filePath: string): SessionParser {
	let badLines = 0;
	let sessionId = "";
	let cwd = "";
	let hasHeader = false;
	let name: string | undefined;

	let firstAtMs = 0;
	let lastAtMs = 0;
	let previousAtMs = 0;
	let activeMs = 0;

	let userMessages = 0;
	let assistantMessages = 0;
	let toolCalls = 0;
	let toolErrors = 0;
	let interruptions = 0;
	let errors = 0;
	let compactions = 0;
	let lastStopReason = "";

	const usage = emptyUsage();
	const tools = new Map<string, ToolStat>();
	const models = new Map<string, ModelUsage>();
	const files = new Map<string, FileEdits>();
	const toolNamesByCallId = new Map<string, string>();
	const events: SessionEvent[] = [];

	function recordEvent(at: string, kind: SessionEvent["kind"], label: string): void {
		events.push({ at, kind, label });
	}

	function handleToolCall(item: Record<string, unknown>): void {
		const toolName = typeof item.name === "string" && item.name.length > 0 ? item.name : "unknown";
		toolCalls += 1;

		const stat = tools.get(toolName);
		if (stat) stat.calls += 1;
		else tools.set(toolName, { name: toolName, calls: 1, errors: 0, sessions: 1 });

		if (typeof item.id === "string") toolNamesByCallId.set(item.id, toolName);
		if (toolName !== "write" && toolName !== "edit") return;

		const args = asRecord(item.arguments);
		if (!args) return;
		const path = readPath(args);
		if (!path) return;

		const entry = files.get(path) ?? { writes: 0, edits: 0, linesAdded: 0, linesRemoved: 0 };
		if (toolName === "write") {
			entry.writes += 1;
			entry.linesAdded += countLines(readText(args.content));
		} else {
			entry.edits += 1;
			for (const change of readEdits(args)) {
				entry.linesAdded += countLines(change.newText);
				entry.linesRemoved += countLines(change.oldText);
			}
		}
		files.set(path, entry);
	}

	function handleAssistant(message: Record<string, unknown>, at: string): void {
		assistantMessages += 1;

		const provider = typeof message.provider === "string" ? message.provider : "unknown";
		const model = typeof message.model === "string" ? message.model : "unknown";
		const key = `${provider}/${model}`;

		const stopReason = typeof message.stopReason === "string" ? message.stopReason : "";
		if (stopReason) lastStopReason = stopReason;
		// The kind already says "interrupt"/"error"; the model is the fact worth
		// carrying, since scanning a run of failures is really asking which model failed.
		if (stopReason === "aborted") {
			interruptions += 1;
			if (at) recordEvent(at, "interrupt", key);
		}
		if (stopReason === "error") {
			errors += 1;
			if (at) recordEvent(at, "error", key);
		}

		const messageUsage = readUsage(message.usage);
		if (messageUsage) {
			addUsage(usage, messageUsage);
			const existing = models.get(key);
			if (existing) addUsage(existing.usage, messageUsage);
			else {
				models.set(key, {
					key,
					provider,
					model,
					api: typeof message.api === "string" ? message.api : undefined,
					usage: messageUsage,
					sessions: 1,
				});
			}
		}

		const content = message.content;
		if (!Array.isArray(content)) return;
		for (const raw of content) {
			const item = asRecord(raw);
			if (!item || item.type !== "toolCall") continue;
			handleToolCall(item);
		}
	}

	function handleToolResult(message: Record<string, unknown>): void {
		if (message.isError !== true) return;
		toolErrors += 1;

		const callId = typeof message.toolCallId === "string" ? message.toolCallId : "";
		const toolName =
			(typeof message.toolName === "string" && message.toolName) || toolNamesByCallId.get(callId) || "unknown";
		const stat = tools.get(toolName);
		if (stat) stat.errors += 1;
		else tools.set(toolName, { name: toolName, calls: 0, errors: 1, sessions: 1 });
	}

	return {
		push(line: string): void {
			if (line.length === 0) return;
			let entry: unknown;
			try {
				entry = JSON.parse(line);
			} catch {
				badLines += 1;
				return;
			}

			const record = asRecord(entry);
			if (!record) {
				badLines += 1;
				return;
			}

			const at = typeof record.timestamp === "string" ? record.timestamp : "";
			const atMs = at ? Date.parse(at) : Number.NaN;
			if (Number.isFinite(atMs)) {
				if (firstAtMs === 0) firstAtMs = atMs;
				lastAtMs = atMs;
				const gap = atMs - previousAtMs;
				// Gaps over the idle threshold are the user walking away, not working.
				if (previousAtMs > 0 && gap > 0 && gap <= IDLE_GAP_MS) activeMs += gap;
				previousAtMs = atMs;
			}

			switch (record.type) {
				case "session": {
					hasHeader = true;
					if (typeof record.id === "string") sessionId = record.id;
					if (typeof record.cwd === "string") cwd = record.cwd;
					if (at) recordEvent(at, "start", cwd);
					return;
				}
				case "session_info": {
					// The last one wins; a session may be renamed several times.
					if (typeof record.name === "string" && record.name.length > 0) name = record.name;
					return;
				}
				case "compaction": {
					compactions += 1;
					if (at) recordEvent(at, "compaction", truncateLabel(readText(record.summary)));
					return;
				}
				case "branch_summary": {
					if (at) recordEvent(at, "branch", truncateLabel(readText(record.summary)));
					return;
				}
				case "model_change": {
					const provider = typeof record.provider === "string" ? record.provider : "unknown";
					const modelId = typeof record.modelId === "string" ? record.modelId : "unknown";
					if (at) recordEvent(at, "model_change", `${provider}/${modelId}`);
					return;
				}
				case "message": {
					const message = asRecord(record.message);
					if (!message) return;
					if (message.role === "user") {
						userMessages += 1;
						if (at) recordEvent(at, "user", truncateLabel(readFirstText(message.content)));
						return;
					}
					if (message.role === "assistant") {
						handleAssistant(message, at);
						return;
					}
					if (message.role === "toolResult") handleToolResult(message);
					return;
				}
				default:
					return;
			}
		},

		finish(): ParsedSession | null {
			// A file with no header, or with no readable timestamp, cannot be placed
			// on a timeline; it is skipped rather than dated to the epoch.
			if (!hasHeader || firstAtMs === 0) return null;

			const startedAt = new Date(firstAtMs).toISOString();
			const endedAt = new Date(Math.max(firstAtMs, lastAtMs)).toISOString();
			recordEvent(endedAt, "end", lastStopReason);

			const fileList = [...files.entries()]
				.map(([path, entry]) => ({ path, ...entry }))
				.sort((a, b) => b.writes + b.edits - (a.writes + a.edits) || a.path.localeCompare(b.path));

			const edits = emptyEdits();
			edits.filesTouched = fileList.length;
			for (const file of fileList) {
				edits.writes += file.writes;
				edits.edits += file.edits;
				edits.linesAdded += file.linesAdded;
				edits.linesRemoved += file.linesRemoved;
			}

			const detail: SessionDetail = {
				sessionId: sessionId || basename(filePath, ".jsonl"),
				filePath,
				name,
				cwd,
				project: cwd ? basename(cwd) : "unknown",
				startedAt,
				endedAt,
				wallMinutes: msToMinutes(Math.max(0, lastAtMs - firstAtMs)),
				activeMinutes: msToMinutes(activeMs),
				userMessages,
				assistantMessages,
				toolCalls,
				toolErrors,
				interruptions,
				errors,
				compactions,
				usage,
				edits,
				models: [...models.keys()],
				tools: [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
				languages: summarizeLanguages(fileList),
				modelUsage: [...models.values()],
				events,
				files: fileList,
			};

			return { detail, badLines };
		},
	};
}

/** Convenience wrapper used by tests and by anything holding lines in memory. */
export function parseSessionLines(lines: Iterable<string>, filePath: string): ParsedSession | null {
	const parser = createSessionParser(filePath);
	for (const line of lines) parser.push(line);
	return parser.finish();
}

/** Streams the file so a 25 MB transcript never becomes a 25 MB string. */
export async function parseSessionFile(ref: SessionFileRef): Promise<ParsedSession | null> {
	const parser = createSessionParser(ref.path);
	const stream = createReadStream(ref.path, { encoding: "utf8" });
	const reader = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
	try {
		for await (const line of reader) parser.push(line);
	} catch {
		return null;
	} finally {
		reader.close();
		stream.destroy();
	}
	return parser.finish();
}

/**
 * A line is a `\n`-separated segment; a trailing newline does not create one.
 * Empty text is zero lines.
 */
export function countLines(text: string): number {
	if (text.length === 0) return 0;
	let lines = 1;
	for (let i = 0; i < text.length; i += 1) {
		if (text.charCodeAt(i) === 10) lines += 1;
	}
	if (text.charCodeAt(text.length - 1) === 10) lines -= 1;
	return lines;
}

/** Lowercase extension of the touched path, or `other` when there is none. */
export function extensionOf(path: string): string {
	const file = basename(path);
	const dot = file.lastIndexOf(".");
	if (dot <= 0) return "other";
	const ext = file.slice(dot + 1).toLowerCase();
	// Version suffixes and dated backups are not languages.
	if (!/^[a-z0-9]{1,10}$/.test(ext)) return "other";
	return ext;
}

export function truncateLabel(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length <= LABEL_MAX_CHARS) return flat;
	const cut = flat.slice(0, LABEL_MAX_CHARS);
	const last = cut.charCodeAt(cut.length - 1);
	// Do not leave a lone high surrogate behind.
	if (last >= 0xd800 && last <= 0xdbff) return cut.slice(0, -1);
	return cut;
}

function summarizeLanguages(files: ReadonlyArray<{ path: string; linesAdded: number; linesRemoved: number }>): LanguageStat[] {
	const byExt = new Map<string, LanguageStat>();
	for (const file of files) {
		const ext = extensionOf(file.path);
		const stat = byExt.get(ext) ?? { ext, label: LANGUAGE_LABELS[ext] ?? ext, files: 0, linesAdded: 0, linesRemoved: 0 };
		stat.files += 1;
		stat.linesAdded += file.linesAdded;
		stat.linesRemoved += file.linesRemoved;
		byExt.set(ext, stat);
	}
	return [...byExt.values()].sort((a, b) => b.linesAdded + b.linesRemoved - (a.linesAdded + a.linesRemoved));
}

function readUsage(value: unknown): UsageTotals | null {
	const raw = asRecord(value);
	if (!raw) return null;
	const cost = asRecord(raw.cost);
	return {
		input: readNumber(raw.input),
		output: readNumber(raw.output),
		cacheRead: readNumber(raw.cacheRead),
		cacheWrite: readNumber(raw.cacheWrite),
		reasoning: readNumber(raw.reasoning),
		totalTokens: readNumber(raw.totalTokens),
		costUsd: cost ? readNumber(cost.total) : 0,
		requests: 1,
	};
}

/**
 * `write`/`edit` arguments appear in more than one encoding across pi versions.
 * All of them record the same fact, so all of them are read.
 */
function readPath(args: Record<string, unknown>): string {
	if (typeof args.path === "string" && args.path.length > 0) return args.path;
	if (typeof args.file_path === "string" && args.file_path.length > 0) return args.file_path;
	return "";
}

function readEdits(args: Record<string, unknown>): Array<{ oldText: string; newText: string }> {
	if (Array.isArray(args.edits)) {
		const changes: Array<{ oldText: string; newText: string }> = [];
		for (const raw of args.edits) {
			const change = asRecord(raw);
			if (!change) continue;
			changes.push({ oldText: readText(change.oldText ?? change.old_string), newText: readText(change.newText ?? change.new_string) });
		}
		return changes;
	}
	const oldText = readText(args.oldText ?? args.old_string);
	const newText = readText(args.newText ?? args.new_string);
	if (!oldText && !newText) return [];
	return [{ oldText, newText }];
}

function readFirstText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	for (const raw of content) {
		const item = asRecord(raw);
		if (item && item.type === "text" && typeof item.text === "string") return item.text;
	}
	return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function readNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function msToMinutes(ms: number): number {
	return Math.round((ms / 60000) * 100) / 100;
}
