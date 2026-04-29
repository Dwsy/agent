/**
 * all-MiniLM-L6-v2 Embedding Provider
 * ONNX Runtime-based local embedding without external service dependencies
 */

import { EmbeddingProvider } from "./memory-vector.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { log } from "./logger.ts";

// Dynamic imports to avoid loading heavy modules when not needed
let ortModule: typeof import("onnxruntime-node") | null = null;
let tokenizerModule: any = null;

async function loadOnnxRuntime(): Promise<typeof import("onnxruntime-node")> {
  if (!ortModule) {
    try {
      ortModule = await import("onnxruntime-node");
    } catch (err) {
      throw new Error(
        `Failed to load onnxruntime-node. Install with: npm i onnxruntime-node. ${err}`
      );
    }
  }
  return ortModule;
}

export interface MiniLMConfig {
  /** Model path override. Auto-downloaded if not provided */
  modelPath?: string;
  /** Max sequence length (default: 512) */
  maxSeqLength?: number;
  /** Batch size for inference (default: 1) */
  batchSize?: number;
  /** Use GPU acceleration if available */
  useGPU?: boolean;
}

/**
 * AllMiniLMEmbeddingProvider - Direct ONNX inference
 * No external service dependencies, runs entirely in-process
 */
export class AllMiniLMEmbeddingProvider implements EmbeddingProvider {
  readonly dim = 384;
  readonly model = "all-MiniLM-L6-v2";

  private config: MiniLMConfig;
  private session: any = null; // ort.InferenceSession
  private tokenizer: any = null;
  private isHfTokenizer = false;
  private initialized = false;

  constructor(config: MiniLMConfig = {}) {
    this.config = {
      maxSeqLength: 512,
      batchSize: 1,
      useGPU: false,
      ...config,
    };
  }

  /**
   * Initialize the provider - load model and tokenizer
   * Must be called before embed()
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const modelPath = await this.resolveModelPath();
    log("embedding-minilm", `Loading model from ${modelPath}`);

    const ort = await loadOnnxRuntime();

    // Session options
    const sessionOptions: any = {
      graphOptimizationLevel: "all",
    };

    // GPU support (optional)
    if (this.config.useGPU) {
      try {
        sessionOptions.executionProviders = ["coreml"]; // macOS CoreML
      } catch {
        log("embedding-minilm", "GPU acceleration not available, using CPU");
      }
    }

    this.session = await ort.InferenceSession.create(modelPath, sessionOptions);

    // Initialize simple tokenizer (without heavy dependencies)
    await this.initializeTokenizer();

    this.initialized = true;
    log("embedding-minilm", "Provider initialized successfully");
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Truncate text to avoid token limit issues
    const truncated = text.slice(0, 8000);

    // Tokenize
    const tokens = this.tokenize(truncated);

    // Run inference
    const embeddings = await this.runInference(tokens);

    // Normalize
    return this.normalize(embeddings);
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.tokenizer = null;
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async resolveModelPath(): Promise<string> {
    if (this.config.modelPath && existsSync(this.config.modelPath)) {
      return this.config.modelPath;
    }

    const defaultPath = join(
      homedir(),
      ".pi",
      "models",
      "all-MiniLM-L6-v2",
      "model.onnx"
    );

    if (existsSync(defaultPath)) {
      return defaultPath;
    }

    throw new Error(
      `Model not found at ${defaultPath}. ` +
      `Download from: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2` +
      ` or run: npx pi-download-model all-MiniLM-L6-v2`
    );
  }

  private async initializeTokenizer(): Promise<void> {
    // Try to use transformers.js tokenizer (lightweight wasm version)
    try {
      // @ts-ignore - optional dependency
      const { AutoTokenizer } = await import("@xenova/transformers");
      this.tokenizer = await AutoTokenizer.from_pretrained(
        "sentence-transformers/all-MiniLM-L6-v2"
      );
      this.isHfTokenizer = true;
      log("embedding-minilm", "Using @xenova/transformers tokenizer");
    } catch (err) {
      // Fallback: load from local tokenizer.json
      const tokenizerPath = this.resolveTokenizerPath();
      log("embedding-minilm", `Loading tokenizer from ${tokenizerPath}`);
      this.tokenizer = await BertWordPieceTokenizer.fromFile(tokenizerPath);
      this.isHfTokenizer = false;
    }
  }

  private resolveTokenizerPath(): string {
    // Look for tokenizer.json in the model directory
    const modelDir = this.config.modelPath
      ? join(this.config.modelPath, "..")
      : join(homedir(), ".pi", "models", "all-MiniLM-L6-v2");
    return join(modelDir, "tokenizer.json");
  }

  private tokenize(text: string): TokenizationResult {
    if (this.isHfTokenizer && this.tokenizer?.encode) {
      // HuggingFace tokenizer (from @xenova/transformers)
      const encoded = this.tokenizer.encode(text, {
        max_length: this.config.maxSeqLength,
        padding: true,
        truncation: true,
      });

      return {
        inputIds: encoded.input_ids || encoded,
        attentionMask: encoded.attention_mask ||
          new Array(encoded.input_ids?.length || encoded.length).fill(1),
      };
    }

    // BertWordPieceTokenizer
    return this.tokenizer.encode(text, this.config.maxSeqLength);
  }

  private async runInference(tokens: TokenizationResult): Promise<Float32Array> {
    const ort = await loadOnnxRuntime();
    const seqLen = tokens.inputIds.length;

    // Create tensors
    const inputIds = new ort.Tensor("int64", BigInt64Array.from(
      tokens.inputIds.map(x => BigInt(x))
    ), [1, seqLen]);

    const attentionMask = new ort.Tensor("int64", BigInt64Array.from(
      tokens.attentionMask.map(x => BigInt(x))
    ), [1, seqLen]);

    // token_type_ids: all zeros for single sentence
    const tokenTypeIds = new ort.Tensor("int64", new BigInt64Array(seqLen), [1, seqLen]);

    // Run inference
    const results = await this.session.run({
      input_ids: inputIds,
      attention_mask: attentionMask,
      token_type_ids: tokenTypeIds,
    });

    // Mean pooling with attention mask
    const hiddenStates = results.last_hidden_state || results.output_0;
    return this.meanPooling(hiddenStates, tokens.attentionMask);
  }

  private meanPooling(hiddenStates: any, attentionMask: number[]): Float32Array {
    const dims = hiddenStates.dims as number[];
    const [batchSize, seqLen, hiddenDim] = dims;
    const data = hiddenStates.data as Float32Array;

    // Calculate mask sum for averaging
    let maskSum = 0;
    for (let i = 0; i < seqLen; i++) {
      maskSum += attentionMask[i];
    }

    // Mean pooling
    const output = new Float32Array(hiddenDim);
    for (let h = 0; h < hiddenDim; h++) {
      let sum = 0;
      for (let s = 0; s < seqLen; s++) {
        sum += data[s * hiddenDim + h] * attentionMask[s];
      }
      output[h] = sum / maskSum;
    }

    return output;
  }

  private normalize(vector: Float32Array): number[] {
    let sumSquares = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSquares += vector[i] * vector[i];
    }

    const magnitude = Math.sqrt(sumSquares);
    if (magnitude === 0) {
      return Array.from(vector);
    }

    return Array.from(vector).map(v => v / magnitude);
  }
}

// ============================================================================
// Types
// ============================================================================

interface TokenizationResult {
  inputIds: number[];
  attentionMask: number[];
}

// ============================================================================
// BERT WordPiece Tokenizer
// ============================================================================

export class BertWordPieceTokenizer {
  private vocab: Map<string, number> = new Map();
  private inverseVocab: Map<number, string> = new Map();
  private unkToken = 100;
  private clsToken = 101;
  private sepToken = 102;
  private padToken = 0;
  private maxInputCharsPerWord = 100;

  constructor(vocab: Record<string, number>) {
    for (const [token, id] of Object.entries(vocab)) {
      this.vocab.set(token, id);
      this.inverseVocab.set(id, token);
    }
  }

  /**
   * Load tokenizer from tokenizer.json file
   */
  static async fromFile(tokenizerPath: string): Promise<BertWordPieceTokenizer> {
    const { readFileSync } = await import("node:fs");
    const data = JSON.parse(readFileSync(tokenizerPath, "utf-8"));
    return new BertWordPieceTokenizer(data.model.vocab);
  }

  encode(text: string, maxLength: number = 512): TokenizationResult {
    // Step 1: Normalize (lowercase + handle chinese chars + strip accents)
    const normalized = this.normalize(text);

    // Step 2: Pre-tokenize (split on whitespace and punctuation)
    const words = this.preTokenize(normalized);

    // Step 3: WordPiece tokenization
    const tokens: number[] = [this.clsToken];

    for (const word of words) {
      if (tokens.length >= maxLength - 1) break; // Leave room for [SEP]

      const wordTokens = this.wordPieceTokenize(word);
      for (const tokenId of wordTokens) {
        if (tokens.length >= maxLength - 1) break;
        tokens.push(tokenId);
      }
    }

    tokens.push(this.sepToken);

    // Step 4: Create attention mask and pad
    const attentionMask = tokens.map(() => 1);
    while (tokens.length < maxLength) {
      tokens.push(this.padToken);
      attentionMask.push(0);
    }

    return {
      inputIds: tokens.slice(0, maxLength),
      attentionMask: attentionMask.slice(0, maxLength),
    };
  }

  /**
   * BertNormalizer: lowercase, handle chinese chars, strip accents
   */
  private normalize(text: string): string {
    // Lowercase
    let result = text.toLowerCase();

    // Handle Chinese characters: add spaces around each char
    result = result.replace(/([\u4e00-\u9fff])/g, " $1 ");

    // Strip accents (simplified - just remove common diacritics)
    result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    return result;
  }

  /**
   * BertPreTokenizer: split on whitespace and punctuation
   */
  private preTokenize(text: string): string[] {
    // Split on whitespace, then split punctuation from words
    const tokens: string[] = [];
    const words = text.split(/\s+/).filter(w => w.length > 0);

    for (const word of words) {
      // Split punctuation from the word
      let current = "";
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        // Check if character is punctuation
        if (/[.!?,;:"'()\[\]{}]/.test(ch)) {
          if (current) tokens.push(current);
          tokens.push(ch);
          current = "";
        } else {
          current += ch;
        }
      }
      if (current) tokens.push(current);
    }

    return tokens;
  }

  /**
   * WordPiece: greedy longest-match tokenization
   */
  private wordPieceTokenize(word: string): number[] {
    if (word.length > this.maxInputCharsPerWord) {
      return [this.unkToken];
    }

    const tokens: number[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found = false;

      while (start < end) {
        let substr = word.slice(start, end);

        // Add ## prefix for non-first subwords
        if (start > 0) {
          substr = "##" + substr;
        }

        if (this.vocab.has(substr)) {
          tokens.push(this.vocab.get(substr)!);
          found = true;
          start = end;
          break;
        }

        end--;
      }

      if (!found) {
        tokens.push(this.unkToken);
        start++;
      }
    }

    return tokens;
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createMiniLMProvider(
  config?: MiniLMConfig
): Promise<AllMiniLMEmbeddingProvider> {
  const provider = new AllMiniLMEmbeddingProvider(config);
  await provider.initialize();
  return provider;
}
