/**
 * Integration test for all-MiniLM-L6-v2 embedding provider
 *
 * Usage:
 *   npx tsx test-minilm-integration.ts
 *
 * Tests:
 * 1. BertWordPieceTokenizer - tokenize text correctly
 * 2. AllMiniLMEmbeddingProvider - generate 384-dim embeddings
 * 3. Cosine similarity - verify semantic understanding
 */

import { BertWordPieceTokenizer } from "./embedding-minilm";
import { createMiniLMProvider, AllMiniLMEmbeddingProvider } from "./embedding-minilm";
import { join } from "path";
import { homedir } from "os";

const MODEL_DIR = join(homedir(), ".pi", "models", "all-MiniLM-L6-v2");
const TOKENIZER_PATH = join(MODEL_DIR, "tokenizer.json");

// ============================================================================
// Test Helpers
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vectors must have same length");
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

function formatVector(v: number[], len = 8): string {
  return `[${v.slice(0, len).map(x => x.toFixed(4)).join(", ")}...]`;
}

// ============================================================================
// Test 1: BertWordPieceTokenizer
// ============================================================================

async function testTokenizer(): Promise<void> {
  console.log("\n=== Test 1: BertWordPieceTokenizer ===\n");

  const tokenizer = await BertWordPieceTokenizer.fromFile(TOKENIZER_PATH);

  // Test basic tokenization
  const result = tokenizer.encode("Hello world", 128);
  console.log(`Input: "Hello world"`);
  console.log(`Tokens: ${result.inputIds.slice(0, 10)}...`);
  console.log(`Attention mask: ${result.attentionMask.slice(0, 10)}...`);

  // Verify [CLS] and [SEP] tokens
  assert(result.inputIds[0] === 101, "First token should be [CLS] (101)");
  assert(result.inputIds[result.inputIds.lastIndexOf(102)] === 102, "Should contain [SEP] (102)");

  // Verify padding
  assert(result.attentionMask[0] === 1, "First attention mask should be 1");
  const lastPadIndex = result.attentionMask.lastIndexOf(0);
  if (lastPadIndex > 0) {
    assert(result.inputIds[lastPadIndex] === 0, "Padded positions should have token ID 0");
  }

  // Test Chinese text
  const zhResult = tokenizer.encode("你好世界", 128);
  console.log(`\nInput: "你好世界"`);
  console.log(`Tokens: ${zhResult.inputIds.slice(0, 10)}...`);
  assert(zhResult.inputIds[0] === 101, "Chinese text should start with [CLS]");

  // Test truncation
  const longText = "word ".repeat(1000);
  const truncated = tokenizer.encode(longText, 128);
  assert(truncated.inputIds.length === 128, "Should truncate to maxLength");
}

// ============================================================================
// Test 2: AllMiniLMEmbeddingProvider
// ============================================================================

async function testProvider(): Promise<AllMiniLMEmbeddingProvider> {
  console.log("\n=== Test 2: AllMiniLMEmbeddingProvider ===\n");

  const provider = await createMiniLMProvider({
    modelPath: join(MODEL_DIR, "model.onnx"),
    maxSeqLength: 128,
  });

  // Test single embedding
  console.log("Generating embedding for 'Hello world'...");
  const start = Date.now();
  const embedding = await provider.embed("Hello world");
  const elapsed = Date.now() - start;

  console.log(`Dimension: ${embedding.length}`);
  console.log(`First 8 values: ${formatVector(embedding)}`);
  console.log(`Time: ${elapsed}ms`);

  assert(embedding.length === 384, "Embedding should be 384-dimensional");

  // Verify normalization (magnitude should be ~1.0)
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  console.log(`Magnitude: ${magnitude.toFixed(6)}`);
  assert(Math.abs(magnitude - 1.0) < 0.01, "Embedding should be L2-normalized");

  return provider;
}

// ============================================================================
// Test 3: Semantic Similarity
// ============================================================================

async function testSemanticSimilarity(provider: AllMiniLMEmbeddingProvider): Promise<void> {
  console.log("\n=== Test 3: Semantic Similarity ===\n");

  const testPairs: Array<[string, string, string]> = [
    ["I love coding", "Programming is my passion", "similar"],
    ["I love coding", "The weather is nice today", "different"],
    ["TypeScript is great", "TS is awesome", "similar"],
    ["猫很可爱", "狗很忠诚", "similar (animals)"],
    ["猫很可爱", "今天天气很好", "different"],
  ];

  for (const [text1, text2, expected] of testPairs) {
    const emb1 = await provider.embed(text1);
    const emb2 = await provider.embed(text2);
    const sim = cosineSimilarity(emb1, emb2);

    const label = sim > 0.5 ? "similar" : "different";
    const icon = label === "similar" ? "🔥" : "❄️";

    console.log(`${icon} ${sim.toFixed(4)} | "${text1}" ↔ "${text2}" (expected: ${expected})`);
  }

  // Verify similar pairs have higher similarity
  const similarEmbs = await Promise.all([
    provider.embed("I love coding"),
    provider.embed("Programming is my passion"),
  ]);
  const differentEmbs = await Promise.all([
    provider.embed("I love coding"),
    provider.embed("The weather is nice today"),
  ]);

  const similarSim = cosineSimilarity(similarEmbs[0], similarEmbs[1]);
  const differentSim = cosineSimilarity(differentEmbs[0], differentEmbs[1]);

  console.log(`\nSimilar pair sim: ${similarSim.toFixed(4)}`);
  console.log(`Different pair sim: ${differentSim.toFixed(4)}`);
  assert(similarSim > differentSim, "Similar texts should have higher similarity");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("=== all-MiniLM-L6-v2 Integration Test ===\n");
  console.log(`Model dir: ${MODEL_DIR}`);
  console.log(`Tokenizer: ${TOKENIZER_PATH}\n`);

  try {
    await testTokenizer();
    const provider = await testProvider();
    await testSemanticSimilarity(provider);

    console.log("\n=== All Tests Passed ===\n");
    await provider.dispose();
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  }
}

main();
