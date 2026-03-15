/**
 * Search: vector, text, and hybrid search over indexed conversations.
 */

import type { EpisodicMemoryDB, SearchResult } from "./database.js";
import { embed, serializeEmbedding } from "./embeddings.js";

export type SearchMode = "vector" | "text" | "both";

export interface SearchOptions {
	query: string | string[];
	mode?: SearchMode;
	limit?: number;
	project?: string;
	after?: string; // YYYY-MM-DD
	before?: string; // YYYY-MM-DD
}

/**
 * Search the episodic memory database.
 *
 * - "vector": semantic similarity search
 * - "text": exact substring match
 * - "both": run both and merge results (default)
 * - Array query: multi-concept AND (intersect vector results)
 */
export async function search(db: EpisodicMemoryDB, options: SearchOptions): Promise<SearchResult[]> {
	const { query, mode = "both", limit = 10, project, after, before } = options;

	// Multi-concept AND search
	if (Array.isArray(query)) {
		return multiConceptSearch(db, query, limit, project, after, before);
	}

	if (mode === "vector") {
		return vectorSearch(db, query, limit, project, after, before);
	}

	if (mode === "text") {
		return db.textSearch(query, limit, project, after, before);
	}

	// Hybrid: run both, merge and deduplicate
	const [vectorResults, textResults] = await Promise.all([
		vectorSearch(db, query, Math.ceil(limit * 1.5), project, after, before),
		Promise.resolve(db.textSearch(query, Math.ceil(limit * 1.5), project, after, before)),
	]);

	return mergeResults(vectorResults, textResults, limit);
}

async function vectorSearch(
	db: EpisodicMemoryDB,
	query: string,
	limit: number,
	project?: string,
	after?: string,
	before?: string,
): Promise<SearchResult[]> {
	const embedding = await embed(query);
	const embeddingBuf = serializeEmbedding(embedding);
	return db.vectorSearch(embeddingBuf, limit, project, after, before);
}

/**
 * Multi-concept AND search: find chunks relevant to ALL concepts.
 * Runs vector search for each concept, then intersects results by chunk ID.
 */
async function multiConceptSearch(
	db: EpisodicMemoryDB,
	concepts: string[],
	limit: number,
	project?: string,
	after?: string,
	before?: string,
): Promise<SearchResult[]> {
	// Get results for each concept with a larger limit
	const perConceptLimit = limit * 3;
	const allResults = await Promise.all(
		concepts.map((concept) => vectorSearch(db, concept, perConceptLimit, project, after, before)),
	);

	// Intersect: only keep chunks that appear in results for ALL concepts
	const chunkScores = new Map<number, { result: SearchResult; totalScore: number; count: number }>();

	for (const results of allResults) {
		for (const result of results) {
			const existing = chunkScores.get(result.id);
			if (existing) {
				existing.totalScore += result.score;
				existing.count++;
			} else {
				chunkScores.set(result.id, { result, totalScore: result.score, count: 1 });
			}
		}
	}

	// Only keep chunks that matched ALL concepts
	const matches: SearchResult[] = [];
	for (const [, entry] of chunkScores) {
		if (entry.count === concepts.length) {
			matches.push({
				...entry.result,
				score: entry.totalScore / concepts.length,
			});
		}
	}

	matches.sort((a, b) => b.score - a.score);
	return matches.slice(0, limit);
}

/**
 * Merge vector and text search results, deduplicating by chunk ID.
 * Text matches get a slight boost since they're exact matches.
 */
function mergeResults(vectorResults: SearchResult[], textResults: SearchResult[], limit: number): SearchResult[] {
	const seen = new Map<number, SearchResult>();

	// Add vector results first
	for (const r of vectorResults) {
		seen.set(r.id, r);
	}

	// Add text results with a boost
	for (const r of textResults) {
		const existing = seen.get(r.id);
		if (existing) {
			// Boost score if found by both methods
			existing.score = Math.min(1, existing.score * 1.3);
		} else {
			seen.set(r.id, { ...r, score: 0.85 }); // text-only matches get good baseline score
		}
	}

	const merged = Array.from(seen.values());
	merged.sort((a, b) => b.score - a.score);
	return merged.slice(0, limit);
}

/**
 * Format search results as readable markdown.
 */
export function formatResults(results: SearchResult[]): string {
	if (results.length === 0) {
		return "No matching conversations found.";
	}

	const parts: string[] = [];
	parts.push(`Found ${results.length} matching conversation segments:\n`);

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const date = r.sessionTimestamp ? r.sessionTimestamp.split("T")[0] : "unknown";
		const projectName = r.project.replace(/^--/, "").replace(/--$/, "").replace(/--/g, "/");
		const score = (r.score * 100).toFixed(0);

		parts.push(`### ${i + 1}. [${date}] ${projectName} (${score}% match)`);
		parts.push(`**Session:** ${r.sessionId}`);
		parts.push(`**File:** ${r.sessionFile}`);
		parts.push("");

		// Truncate very long chunks for display
		const text = r.text.length > 1500 ? r.text.slice(0, 1500) + "\n\n...(truncated)" : r.text;
		parts.push(text);
		parts.push("\n---\n");
	}

	return parts.join("\n");
}
