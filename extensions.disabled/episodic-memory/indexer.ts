/**
 * Indexer: orchestrates parsing, embedding, and storing conversation chunks.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EpisodicMemoryDB } from "./database.js";
import { embed, serializeEmbedding } from "./embeddings.js";
import { chunkMessages, discoverSessionFiles, parseSessionFile, shouldExclude } from "./parser.js";

export interface IndexProgress {
	total: number;
	current: number;
	currentFile: string;
	newChunks: number;
}

// Support multiple session directories
const SESSIONS_DIRS = [
	path.join(os.homedir(), ".pi", "agent", "sessions"),
	path.join(os.homedir(), ".pi", "gateway", "sessions"),
];
const DB_DIR = path.join(os.homedir(), ".pi", "agent", "episodic-memory");
export const DB_PATH = path.join(DB_DIR, "index.db");

export { SESSIONS_DIRS };

/**
 * Index all new/modified session files from all directories.
 * Returns the number of new chunks indexed.
 */
export async function indexNewSessions(
	db: EpisodicMemoryDB,
	onProgress?: (progress: IndexProgress) => void,
): Promise<{ filesIndexed: number; chunksIndexed: number }> {
	// Collect files from all session directories
	let allFiles: string[] = [];
	for (const sessionsDir of SESSIONS_DIRS) {
		if (fs.existsSync(sessionsDir)) {
			const files = discoverSessionFiles(sessionsDir);
			allFiles = allFiles.concat(files);
		}
	}

	let filesIndexed = 0;
	let chunksIndexed = 0;

	// Filter to only files that need indexing
	const filesToIndex: { path: string; stat: fs.Stats }[] = [];
	for (const filePath of allFiles) {
		try {
			const stat = fs.statSync(filePath);
			if (!db.isFileIndexed(filePath, stat.mtimeMs, stat.size)) {
				filesToIndex.push({ path: filePath, stat });
			}
		} catch {
			continue;
		}
	}

	if (filesToIndex.length === 0) return { filesIndexed: 0, chunksIndexed: 0 };

	for (let i = 0; i < filesToIndex.length; i++) {
		const file = filesToIndex[i];

		onProgress?.({
			total: filesToIndex.length,
			current: i + 1,
			currentFile: path.basename(file.path),
			newChunks: chunksIndexed,
		});

		// Check exclusion marker
		if (shouldExclude(file.path)) {
			db.markFileIndexed(file.path, file.stat.mtimeMs, file.stat.size);
			continue;
		}

		// Parse the session file
		const parsed = parseSessionFile(file.path);
		if (!parsed || parsed.messages.length === 0) {
			db.markFileIndexed(file.path, file.stat.mtimeMs, file.stat.size);
			continue;
		}

		// Remove old data if reindexing
		db.removeFile(file.path);

		// Chunk the messages
		const chunks = chunkMessages(parsed.session, parsed.messages);

		// Embed and store each chunk
		for (const chunk of chunks) {
			try {
				const embedding = await embed(chunk.text);
				const embeddingBuf = serializeEmbedding(embedding);

				db.transaction(() => {
					db.insertChunk(
						chunk.session.id,
						chunk.session.filePath,
						chunk.session.project,
						chunk.session.cwd,
						chunk.chunkIndex,
						chunk.text,
						chunk.startTime,
						chunk.endTime,
						chunk.session.timestamp,
						embeddingBuf,
					);
				});

				chunksIndexed++;
			} catch (err) {
				// Skip chunks that fail to embed, don't block the whole file
				console.error(`Failed to embed chunk ${chunk.chunkIndex} of ${file.path}:`, err);
			}
		}

		// Mark file as indexed
		db.markFileIndexed(file.path, file.stat.mtimeMs, file.stat.size);
		filesIndexed++;
	}

	return { filesIndexed, chunksIndexed };
}
