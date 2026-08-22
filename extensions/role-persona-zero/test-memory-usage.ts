/**
 * Memory usage test for local embedding model
 * Check RAM consumption and multi-instance behavior
 */

import { getLlama, LlamaLogLevel } from "node-llama-cpp";
import { join } from "node:path";
import { homedir } from "node:os";

const MODEL_PATH = join(homedir(), ".pi/models/embedding-models/embeddinggemma-300M-Q8_0.gguf");

function getMemoryUsage(): { rss: number; heapUsed: number; external: number } {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
}

async function loadModel() {
  console.log("\n=== Memory Usage Test ===\n");
  
  console.log("Before loading model:", getMemoryUsage());
  
  const llama = await getLlama({ logLevel: LlamaLogLevel.error });
  console.log("After getLlama():", getMemoryUsage());
  
  const model = await llama.loadModel({ 
    modelPath: MODEL_PATH,
    embedding: true,
  });
  console.log("After loadModel():", getMemoryUsage());
  
  const context = await model.createEmbeddingContext();
  console.log("After createEmbeddingContext():", getMemoryUsage());
  
  // Test inference
  const text = "Test embedding generation";
  const embedding = await context.getEmbeddingFor(text);
  console.log("After first embedding:", getMemoryUsage());
  console.log(`Embedding dimensions: ${embedding.vector.length}`);
  
  // Multiple inferences
  for (let i = 0; i < 10; i++) {
    await context.getEmbeddingFor(`Test text ${i}`);
  }
  console.log("After 10 embeddings:", getMemoryUsage());
  
  context.dispose();
  model.dispose();
  llama.dispose();
  
  // Force GC if available
  if (global.gc) {
    global.gc();
    console.log("After forced GC:", getMemoryUsage());
  }
  
  console.log("\n=== Test Complete ===");
}

loadModel().catch(console.error);
