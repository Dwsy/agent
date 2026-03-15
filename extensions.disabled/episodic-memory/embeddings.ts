/**
 * Local embeddings using Transformers.js.
 * Downloads the model on first use (~23MB), then runs locally.
 */

let pipeline: any = null;
let loadingPromise: Promise<any> | null = null;

const MODEL_NAME = "Xenova/multilingual-e5-base";
const EMBEDDING_DIM = 768;

export { EMBEDDING_DIM };

/**
 * Initialize the embedding pipeline. Cached after first call.
 */
async function getEmbedder(): Promise<any> {
	if (pipeline) return pipeline;
	if (loadingPromise) return loadingPromise;

	loadingPromise = (async () => {
		const { pipeline: createPipeline } = await import("@huggingface/transformers");
		pipeline = await createPipeline("feature-extraction", MODEL_NAME, {
			dtype: "int8",
		});
		return pipeline;
	})();

	return loadingPromise;
}

/**
 * Generate an embedding for a single text.
 * Returns a Float32Array of dimension 384.
 */
export async function embed(text: string): Promise<Float32Array> {
	const embedder = await getEmbedder();
	// Truncate long text to avoid OOM — model max is 256 tokens, ~1000 chars is safe
	const truncated = text.length > 2000 ? text.slice(0, 2000) : text;
	const result = await embedder(truncated, { pooling: "mean", normalize: true });
	return new Float32Array(result.data);
}

/**
 * Generate embeddings for multiple texts in batch.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
	const results: Float32Array[] = [];
	// Process sequentially to avoid OOM with large batches
	for (const text of texts) {
		results.push(await embed(text));
	}
	return results;
}

/**
 * Serialize a Float32Array to a Buffer for SQLite storage.
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
	return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Deserialize a Buffer from SQLite back to Float32Array.
 */
export function deserializeEmbedding(buffer: Buffer): Float32Array {
	const ab = new ArrayBuffer(buffer.length);
	const view = new Uint8Array(ab);
	for (let i = 0; i < buffer.length; i++) view[i] = buffer[i];
	return new Float32Array(ab);
}
