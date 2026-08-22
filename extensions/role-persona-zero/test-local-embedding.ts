/**
 * Test script for local embedding model (EmbeddingGemma Q8_0)
 * Following OpenClaw's implementation pattern
 */

import { getLlama, LlamaLogLevel } from "node-llama-cpp";
import { join } from "node:path";
import { homedir } from "node:os";

const MODEL_PATH = join(homedir(), ".pi/models/embedding-models/embeddinggemma-300M-Q8_0.gguf");

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  readonly dim: number;
  readonly model: string;
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dim = 768; // EmbeddingGemma 768d
  readonly model = "embeddinggemma-300m-qat-q8_0";
  
  private llama: any = null;
  private embeddingModel: any = null;
  private embeddingContext: any = null;

  private async ensureContext(): Promise<any> {
    if (!this.llama) {
      this.llama = await getLlama({ logLevel: LlamaLogLevel.error });
    }
    if (!this.embeddingModel) {
      console.log(`Loading model: ${MODEL_PATH}`);
      this.embeddingModel = await this.llama.loadModel({ 
        modelPath: MODEL_PATH,
        embedding: true,
      });
      console.log("✅ Model loaded");
    }
    if (!this.embeddingContext) {
      this.embeddingContext = await this.embeddingModel.createEmbeddingContext();
      console.log("✅ Embedding context created");
    }
    return this.embeddingContext;
  }

  async embed(text: string): Promise<number[]> {
    const context = await this.ensureContext();
    
    // Truncate to safe length
    const truncated = text.slice(0, 8000);
    
    const embedding = await context.getEmbeddingFor(truncated);
    const vector = embedding.vector;
    
    // Normalize to unit magnitude (match OpenClaw behavior)
    return this.normalize(vector);
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }

  dispose(): void {
    this.embeddingContext?.dispose();
    this.embeddingModel?.dispose();
    this.llama?.dispose();
  }
}

// Test
async function test() {
  console.log("=== Local Embedding Test (OpenClaw Pattern) ===\n");
  
  const provider = new LocalEmbeddingProvider();
  
  try {
    const testTexts = [
      "I prefer TypeScript over JavaScript",
      "My favorite programming language is TypeScript",
      "The weather is nice today",
      "I enjoy coding in Python",
    ];
    
    console.log("Generating embeddings...\n");
    const embeddings: { text: string; vector: number[] }[] = [];
    
    for (const text of testTexts) {
      const start = Date.now();
      const vector = await provider.embed(text);
      const elapsed = Date.now() - start;
      
      console.log(`✓ "${text.slice(0, 40)}..."`);
      console.log(`  → ${vector.length} dims, norm=${Math.sqrt(vector.reduce((s,v)=>s+v*v,0)).toFixed(3)} (${elapsed}ms)`);
      embeddings.push({ text, vector });
    }
    
    // Cosine similarity (dot product since normalized)
    console.log("\n=== Cosine Similarities ===");
    
    function cosineSimilarity(a: number[], b: number[]): number {
      return a.reduce((sum, v, i) => sum + v * b[i], 0);
    }
    
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i].vector, embeddings[j].vector);
        const label = sim > 0.8 ? "🔥" : sim > 0.5 ? "👍" : "❄️";
        console.log(`${label} ${sim.toFixed(3)} | "${embeddings[i].text.slice(0, 25)}..." ↔ "${embeddings[j].text.slice(0, 25)}..."`);
      }
    }
    
    console.log("\n✅ Test completed!");
    
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  } finally {
    provider.dispose();
  }
}

test();
