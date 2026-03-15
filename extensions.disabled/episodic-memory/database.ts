/**
 * SQLite database with sqlite-vec for vector similarity search.
 * Stores conversation chunks and their embeddings.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EMBEDDING_DIM } from "./embeddings.js";

export interface StoredChunk {
	id: number;
	sessionId: string;
	sessionFile: string;
	project: string;
	cwd: string;
	chunkIndex: number;
	text: string;
	startTime: string;
	endTime: string;
	sessionTimestamp: string;
}

export interface SearchResult extends StoredChunk {
	distance: number;
	score: number; // 0-1, higher is better
}

export class EpisodicMemoryDB {
	private db: Database.Database;

	constructor(dbPath: string) {
		// Ensure directory exists
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		this.db = new Database(dbPath);
		this.db.pragma("journal_mode = WAL");
		sqliteVec.load(this.db);
		this.init();
	}

	private init() {
		// Main chunks table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chunks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				session_file TEXT NOT NULL,
				project TEXT NOT NULL,
				cwd TEXT NOT NULL,
				chunk_index INTEGER NOT NULL,
				text TEXT NOT NULL,
				start_time TEXT NOT NULL,
				end_time TEXT NOT NULL,
				session_timestamp TEXT NOT NULL,
				UNIQUE(session_file, chunk_index)
			)
		`);

		// Track which files have been indexed
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS indexed_files (
				file_path TEXT PRIMARY KEY,
				mtime_ms INTEGER NOT NULL,
				size INTEGER NOT NULL,
				indexed_at TEXT NOT NULL
			)
		`);

		// Virtual table for vector search
		this.db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
				chunk_id INTEGER PRIMARY KEY,
				embedding float[${EMBEDDING_DIM}]
			)
		`);

		// Index for text search
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_text ON chunks(text)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project)
		`);
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_session_timestamp ON chunks(session_timestamp)
		`);
	}

	/**
	 * Check if a file needs (re)indexing based on mtime and size.
	 */
	isFileIndexed(filePath: string, mtimeMs: number, size: number): boolean {
		const row = this.db.prepare("SELECT mtime_ms, size FROM indexed_files WHERE file_path = ?").get(filePath) as
			| { mtime_ms: number; size: number }
			| undefined;
		if (!row) return false;
		return row.mtime_ms === mtimeMs && row.size === size;
	}

	/**
	 * Remove all chunks for a given session file (for reindexing).
	 */
	removeFile(filePath: string) {
		const chunks = this.db.prepare("SELECT id FROM chunks WHERE session_file = ?").all(filePath) as { id: number }[];
		const deleteVec = this.db.prepare("DELETE FROM chunks_vec WHERE chunk_id = CAST(? AS INTEGER)");
		for (const chunk of chunks) {
			deleteVec.run(chunk.id);
		}
		this.db.prepare("DELETE FROM chunks WHERE session_file = ?").run(filePath);
		this.db.prepare("DELETE FROM indexed_files WHERE file_path = ?").run(filePath);
	}

	/**
	 * Insert a chunk and its embedding.
	 */
	insertChunk(
		sessionId: string,
		sessionFile: string,
		project: string,
		cwd: string,
		chunkIndex: number,
		text: string,
		startTime: string,
		endTime: string,
		sessionTimestamp: string,
		embedding: Buffer,
	): number {
		const result = this.db
			.prepare(
				`INSERT OR REPLACE INTO chunks
				(session_id, session_file, project, cwd, chunk_index, text, start_time, end_time, session_timestamp)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(sessionId, sessionFile, project, cwd, chunkIndex, text, startTime, endTime, sessionTimestamp);

		const chunkId = Number(result.lastInsertRowid);

		// Insert embedding — sqlite-vec requires CAST for parameterized integer PKs
		this.db.prepare("INSERT INTO chunks_vec (chunk_id, embedding) VALUES (CAST(? AS INTEGER), ?)").run(chunkId, embedding);

		return chunkId;
	}

	/**
	 * Mark a file as indexed.
	 */
	markFileIndexed(filePath: string, mtimeMs: number, size: number) {
		this.db
			.prepare(
				`INSERT OR REPLACE INTO indexed_files (file_path, mtime_ms, size, indexed_at)
				VALUES (?, ?, ?, ?)`,
			)
			.run(filePath, mtimeMs, size, new Date().toISOString());
	}

	/**
	 * Run operations in a transaction.
	 */
	transaction<T>(fn: () => T): T {
		return this.db.transaction(fn)();
	}

	/**
	 * Semantic vector search.
	 */
	vectorSearch(embedding: Buffer, limit: number, project?: string, after?: string, before?: string): SearchResult[] {
		// sqlite-vec requires k=? for knn queries; we fetch more if filtering, then trim
		const fetchLimit = (project || after || before) ? limit * 5 : limit;

		const rows = this.db
			.prepare(
				`SELECT c.*, v.distance
				FROM chunks_vec v
				JOIN chunks c ON c.id = v.chunk_id
				WHERE v.embedding MATCH ? AND k = ?
				ORDER BY v.distance`,
			)
			.all(embedding, fetchLimit) as any[];

		// Apply post-filters
		let filtered = rows;
		if (project) {
			filtered = filtered.filter((r: any) => r.project === project);
		}
		if (after) {
			filtered = filtered.filter((r: any) => r.session_timestamp >= after);
		}
		if (before) {
			filtered = filtered.filter((r: any) => r.session_timestamp <= before);
		}
		filtered = filtered.slice(0, limit);

		return filtered.map((row: any) => ({
			id: row.id,
			sessionId: row.session_id,
			sessionFile: row.session_file,
			project: row.project,
			cwd: row.cwd,
			chunkIndex: row.chunk_index,
			text: row.text,
			startTime: row.start_time,
			endTime: row.end_time,
			sessionTimestamp: row.session_timestamp,
			distance: row.distance,
			score: 1 / (1 + row.distance), // convert distance to 0-1 score
		}));
	}

	/**
	 * Full-text search using LIKE (simple but effective).
	 */
	textSearch(query: string, limit: number, project?: string, after?: string, before?: string): SearchResult[] {
		let sql = "SELECT * FROM chunks WHERE text LIKE ?";
		const params: any[] = [`%${query}%`];

		if (project) {
			sql += " AND project = ?";
			params.push(project);
		}
		if (after) {
			sql += " AND session_timestamp >= ?";
			params.push(after);
		}
		if (before) {
			sql += " AND session_timestamp <= ?";
			params.push(before);
		}

		sql += " ORDER BY session_timestamp DESC LIMIT ?";
		params.push(limit);

		const rows = this.db.prepare(sql).all(...params) as any[];

		return rows.map((row) => ({
			id: row.id,
			sessionId: row.session_id,
			sessionFile: row.session_file,
			project: row.project,
			cwd: row.cwd,
			chunkIndex: row.chunk_index,
			text: row.text,
			startTime: row.start_time,
			endTime: row.end_time,
			sessionTimestamp: row.session_timestamp,
			distance: 0,
			score: 1,
		}));
	}

	/**
	 * Get index statistics.
	 */
	stats(): {
		totalChunks: number;
		totalSessions: number;
		totalFiles: number;
		projects: string[];
		oldestSession: string | null;
		newestSession: string | null;
	} {
		const totalChunks = (this.db.prepare("SELECT COUNT(*) as count FROM chunks").get() as any).count;
		const totalSessions = (
			this.db.prepare("SELECT COUNT(DISTINCT session_id) as count FROM chunks").get() as any
		).count;
		const totalFiles = (this.db.prepare("SELECT COUNT(*) as count FROM indexed_files").get() as any).count;
		const projects = (this.db.prepare("SELECT DISTINCT project FROM chunks ORDER BY project").all() as any[]).map(
			(r) => r.project,
		);
		const oldest = this.db
			.prepare("SELECT MIN(session_timestamp) as ts FROM chunks")
			.get() as any;
		const newest = this.db
			.prepare("SELECT MAX(session_timestamp) as ts FROM chunks")
			.get() as any;

		return {
			totalChunks,
			totalSessions,
			totalFiles,
			projects,
			oldestSession: oldest?.ts || null,
			newestSession: newest?.ts || null,
		};
	}

	close() {
		this.db.close();
	}
}
