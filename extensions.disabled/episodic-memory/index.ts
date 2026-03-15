/**
 * Pi Episodic Memory Extension
 *
 * Gives pi semantic search over all past conversations.
 * Indexes session files on startup and shutdown, provides
 * search tools for the LLM, and commands for the user.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { EpisodicMemoryDB } from "./database.js";
import { DB_PATH } from "./indexer.js";
import { indexNewSessions } from "./indexer.js";
import { search, formatResults } from "./search.js";

let db: EpisodicMemoryDB | null = null;

function getDB(): EpisodicMemoryDB {
	if (!db) {
		db = new EpisodicMemoryDB(DB_PATH);
	}
	return db;
}

export default function (pi: ExtensionAPI) {
	// ─── Index on session start ───
	pi.on("session_start", async (_event, ctx) => {
		try {
			const database = getDB();
			const stats = database.stats();

			// Only show notification if there are new files to index
			const result = await indexNewSessions(database, (progress) => {
				ctx.ui.setStatus(
					"episodic-memory",
					`Indexing memory: ${progress.current}/${progress.total} sessions...`,
				);
			});

			ctx.ui.setStatus("episodic-memory", ""); // clear status

			if (result.filesIndexed > 0) {
				ctx.ui.notify(
					`Episodic memory: indexed ${result.filesIndexed} new session(s), ${result.chunksIndexed} chunks`,
					"info",
				);
			}
		} catch (err) {
			ctx.ui.notify(`Episodic memory indexing failed: ${err}`, "warning");
		}
	});

	// ─── Index current session on shutdown ───
	pi.on("session_shutdown", async (_event, _ctx) => {
		try {
			const database = getDB();
			await indexNewSessions(database);
			database.close();
			db = null;
		} catch {
			// don't block shutdown
		}
	});

	// ─── Search tool for the LLM ───
	pi.registerTool({
		name: "episodic_memory_search",
		label: "Search Memory",
		description: [
			"Search past pi conversations using semantic similarity.",
			"Use this when the user references past work, asks 'how did we do X before',",
			"or when you encounter a problem that might have been solved in a previous session.",
			"Supports single queries, multi-concept AND search (pass array), and date filtering.",
		].join(" "),
		parameters: Type.Object({
			query: Type.Union([Type.String(), Type.Array(Type.String(), { minItems: 2, maxItems: 5 })], {
				description:
					"Search query string, or array of 2-5 concepts for AND search. Use descriptive phrases, not just keywords.",
			}),
			mode: Type.Optional(
				Type.Union([Type.Literal("vector"), Type.Literal("text"), Type.Literal("both")], {
					description: 'Search mode. "vector" for semantic, "text" for exact, "both" for hybrid. Default: "both".',
				}),
			),
			limit: Type.Optional(
				Type.Number({
					minimum: 1,
					maximum: 20,
					description: "Maximum results to return. Default: 5.",
				}),
			),
			project: Type.Optional(
				Type.String({
					description: "Filter to a specific project directory name.",
				}),
			),
			after: Type.Optional(
				Type.String({
					description: "Only show results after this date (YYYY-MM-DD).",
				}),
			),
			before: Type.Optional(
				Type.String({
					description: "Only show results before this date (YYYY-MM-DD).",
				}),
			),
		}),

		async execute(_toolCallId, params) {
			try {
				const database = getDB();
				const results = await search(database, {
					query: params.query,
					mode: params.mode || "both",
					limit: params.limit || 5,
					project: params.project,
					after: params.after,
					before: params.before,
				});

				const formatted = formatResults(results);
				return {
					content: [{ type: "text", text: formatted }],
					details: { resultCount: results.length },
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Search failed: ${err}` }],
					isError: true,
					details: {},
				};
			}
		},
	});

	// ─── Show full conversation tool ───
	pi.registerTool({
		name: "episodic_memory_show",
		label: "Show Conversation",
		description: [
			"Display the full content of a past conversation session.",
			"Use this after searching to get the complete context of a relevant conversation.",
			"Pass the session file path from search results.",
		].join(" "),
		parameters: Type.Object({
			sessionFile: Type.String({
				description: "Path to the session .jsonl file (from search results).",
			}),
			maxMessages: Type.Optional(
				Type.Number({
					minimum: 1,
					maximum: 100,
					description: "Maximum messages to show. Default: 30.",
				}),
			),
		}),

		async execute(_toolCallId, params) {
			try {
				const { parseSessionFile } = await import("./parser.js");
				const parsed = parseSessionFile(params.sessionFile);
				if (!parsed) {
					return {
						content: [{ type: "text", text: "Could not parse session file." }],
						isError: true,
						details: {},
					};
				}

				const maxMsgs = params.maxMessages || 30;
				const messages = parsed.messages.slice(0, maxMsgs);
				const parts: string[] = [];

				parts.push(`## Session: ${parsed.session.id}`);
				parts.push(`**Date:** ${parsed.session.timestamp}`);
				parts.push(`**Project:** ${parsed.session.project}`);
				parts.push(`**CWD:** ${parsed.session.cwd}`);
				parts.push(`**Messages:** ${parsed.messages.length} total (showing ${messages.length})`);
				parts.push("");

				for (const msg of messages) {
					const role = msg.role === "user" ? "**User**" : "**Assistant**";
					// Truncate very long messages
					const text = msg.text.length > 2000 ? msg.text.slice(0, 2000) + "\n...(truncated)" : msg.text;
					parts.push(`${role}:\n${text}\n`);
				}

				return {
					content: [{ type: "text", text: parts.join("\n") }],
					details: { totalMessages: parsed.messages.length, shown: messages.length },
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Failed to show conversation: ${err}` }],
					isError: true,
					details: {},
				};
			}
		},
	});

	// ─── /memory-search command ───
	pi.registerCommand("memory-search", {
		description: "Search episodic memory (usage: /memory-search <query>)",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /memory-search <query>", "warning");
				return;
			}

			ctx.ui.notify("Searching episodic memory...", "info");

			try {
				const database = getDB();
				const results = await search(database, { query: args.trim(), limit: 10 });

				if (results.length === 0) {
					ctx.ui.notify("No matching conversations found.", "info");
					return;
				}

				// Show results as a notification with key details
				const summary = results
					.slice(0, 5)
					.map((r, i) => {
						const date = r.sessionTimestamp?.split("T")[0] || "unknown";
						const project = r.project.replace(/^--/, "").replace(/--$/, "").replace(/--/g, "/");
						const score = (r.score * 100).toFixed(0);
						const preview = r.text.split("\n")[0].slice(0, 80);
						return `${i + 1}. [${date}] ${project} (${score}%) - ${preview}...`;
					})
					.join("\n");

				ctx.ui.notify(`Found ${results.length} results:\n${summary}`, "info");
			} catch (err) {
				ctx.ui.notify(`Search failed: ${err}`, "error");
			}
		},
	});

	// ─── /memory-stats command ───
	pi.registerCommand("memory-stats", {
		description: "Show episodic memory statistics",
		handler: async (_args, ctx) => {
			try {
				const database = getDB();
				const stats = database.stats();

				const lines = [
					`Episodic Memory Stats:`,
					`  Sessions: ${stats.totalSessions}`,
					`  Chunks:   ${stats.totalChunks}`,
					`  Files:    ${stats.totalFiles}`,
					`  Projects: ${stats.projects.length}`,
				];

				if (stats.oldestSession) {
					lines.push(`  Oldest:   ${stats.oldestSession.split("T")[0]}`);
				}
				if (stats.newestSession) {
					lines.push(`  Newest:   ${stats.newestSession.split("T")[0]}`);
				}

				if (stats.projects.length > 0) {
					lines.push(`  Project list:`);
					for (const p of stats.projects) {
						const name = p.replace(/^--/, "").replace(/--$/, "").replace(/--/g, "/");
						lines.push(`    - ${name}`);
					}
				}

				ctx.ui.notify(lines.join("\n"), "info");
			} catch (err) {
				ctx.ui.notify(`Failed to get stats: ${err}`, "error");
			}
		},
	});

	// ─── /memory-reindex command ───
	pi.registerCommand("memory-reindex", {
		description: "Force reindex all sessions",
		handler: async (_args, ctx) => {
			const ok = await ctx.ui.confirm("Reindex?", "This will reindex all session files. Continue?");
			if (!ok) return;

			ctx.ui.notify("Reindexing all sessions...", "info");

			try {
				// Close and recreate DB to start fresh
				if (db) {
					db.close();
					db = null;
				}

				// Delete existing DB
				const fs = await import("node:fs");
				if (fs.existsSync(DB_PATH)) {
					fs.unlinkSync(DB_PATH);
				}

				const database = getDB();
				const result = await indexNewSessions(database, (progress) => {
					ctx.ui.setStatus(
						"episodic-memory",
						`Reindexing: ${progress.current}/${progress.total} sessions...`,
					);
				});

				ctx.ui.setStatus("episodic-memory", "");
				ctx.ui.notify(
					`Reindex complete: ${result.filesIndexed} sessions, ${result.chunksIndexed} chunks`,
					"success",
				);
			} catch (err) {
				ctx.ui.setStatus("episodic-memory", "");
				ctx.ui.notify(`Reindex failed: ${err}`, "error");
			}
		},
	});
}
