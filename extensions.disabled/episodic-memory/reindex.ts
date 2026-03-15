/**
 * Standalone reindex script
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { EpisodicMemoryDB } from "./database.js";
import { indexNewSessions, DB_PATH } from "./indexer.js";

const DB_DIR = path.dirname(DB_PATH);

async function main() {
	console.log("Creating database directory:", DB_DIR);
	fs.mkdirSync(DB_DIR, { recursive: true });
	
	console.log("Initializing database at:", DB_PATH);
	const db = new EpisodicMemoryDB(DB_PATH);
	
	console.log("Starting reindex...");
	const result = await indexNewSessions(db, (progress) => {
		console.log(`Progress: ${progress.current}/${progress.total} - ${progress.currentFile}`);
	});
	
	console.log("\n=== Reindex Complete ===");
	console.log(`Files indexed: ${result.filesIndexed}`);
	console.log(`Chunks indexed: ${result.chunksIndexed}`);
	
	const stats = db.stats();
	console.log(`Total sessions: ${stats.totalSessions}`);
	console.log(`Total chunks: ${stats.totalChunks}`);
	console.log(`Total files: ${stats.totalFiles}`);
	console.log(`Projects: ${stats.projects.length}`);
	
	db.close();
}

main().catch(console.error);
