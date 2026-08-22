# all-MiniLM-L6-v2 本地嵌入设计文档

## 1. 模型分析

### 1.1 模型规格
- **模型**: sentence-transformers/all-MiniLM-L6-v2
- **架构**: BERT (6 layers, 12 attention heads)
- **隐藏维度**: 384
- **输出维度**: 384 (sentence embedding)
- **最大序列长度**: 512 tokens
- **词汇量**: 30522
- **模型大小**: ~80MB (量化后 ~23MB)
- **推理速度**: ~10-50ms/请求 (CPU)

### 1.2 与当前方案的对比

| 特性 | OpenAI | EmbeddingGemma | all-MiniLM-L6-v2 |
|------|--------|----------------|------------------|
| 维度 | 1536 | 768 | 384 |
| 本地运行 | ❌ | ✅ | ✅ |
| 模型大小 | - | ~435MB | ~80MB |
| 启动时间 | - | ~2s | ~0.5s |
| 质量评分 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 依赖 | API | node-llama-cpp | ONNX Runtime |

## 2. 架构设计

### 2.1 核心问题
当前 `LocalEmbeddingProvider` 依赖 `pi-session-manager` 提供的 HTTP 服务，这限制了跨平台部署。

### 2.2 新架构：双模式嵌入引擎

```
┌─────────────────────────────────────────────────────────────┐
│                    Embedding Provider                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ ONNX Direct │    │  Daemon Mode │    │  HTTP Proxy │     │
│  │  (单进程)    │    │ (多进程共享)  │    │ (向后兼容)   │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │            │
│         └──────────────────┴──────────────────┘            │
│                            │                               │
│                    ┌───────┴───────┐                       │
│                    │  ONNX Runtime │                       │
│                    │   (跨平台)    │                       │
│                    └───────┬───────┘                       │
│                            │                               │
│                    ┌───────┴───────┐                       │
│                    │ all-MiniLM-v2 │                       │
│                    └───────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 守护进程模式详解

```
┌────────────────────────────────────────────────────────────┐
│                    System Architecture                      │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐     │
│  │  Pi Session #1  │    │   Embedding Daemon          │     │
│  │  ┌───────────┐  │    │  ┌─────────────────────┐    │     │
│  │  │ Pi Agent  │──┼────┼─>│ Unix/TCP Socket     │    │     │
│  │  └───────────┘  │  │    │  │                     │    │     │
│  └─────────────────┘  │    │  │  ┌───────────────┐  │    │     │
│                       │    │  │  │ Model Cache   │  │    │     │
│  ┌─────────────────┐  │    │  │  │ (384d vectors)│  │    │     │
│  │  Pi Session #2  │  │    │  │  └───────────────┘  │    │     │
│  │  ┌───────────┐  │  │    │  │         ↑           │    │     │
│  │  │ Pi Agent  │──┼──┼────┼─┤  ┌───────────────┐  │    │     │
│  │  └───────────┘  │  │    │  └─│ ONNX Runtime  │──┘    │     │
│  └─────────────────┘  │    │     │ (cross-platform)    │     │
│                       │    │     └───────────────┘     │     │
│  ┌─────────────────┐  │    │              ↑             │     │
│  │  Pi Session #N  │  │    │     ┌───────────────┐      │     │
│  │  ┌───────────┐  │  │    │     │ all-MiniLM    │      │     │
│  │  │ Pi Agent  │──┼──┘    │     │ -L6-v2.onnx   │      │     │
│  │  └───────────┘  │       │     └───────────────┘      │     │
│  └─────────────────┘       └─────────────────────────────┘     │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

## 3. 技术实现

### 3.1 依赖方案

```typescript
// package.json 新增依赖
{
  "dependencies": {
    "@lancedb/lancedb": "^0.15.0",
    "onnxruntime-node": "^1.24.3",  // 新增
    "tokenizers": "^0.20.0"          // 新增 (wasm tokenizer)
  }
}
```

### 3.2 Provider 实现

```typescript
// embedding-minilm.ts
import { EmbeddingProvider } from "./memory-vector";
import * as ort from "onnxruntime-node";

export class AllMiniLMEmbeddingProvider implements EmbeddingProvider {
  readonly dim = 384;
  readonly model = "all-MiniLM-L6-v2";
  
  private session: ort.InferenceSession | null = null;
  private tokenizer: any = null; // Tokenizer instance
  
  async initialize(modelPath: string): Promise<void> {
    // 加载 ONNX 模型
    this.session = await ort.InferenceSession.create(modelPath);
    // 初始化 tokenizer
    this.tokenizer = await loadTokenizer();
  }
  
  async embed(text: string): Promise<number[]> {
    // 1. Tokenize
    const tokens = this.tokenizer.encode(text, { maxLength: 512 });
    
    // 2. Create tensors
    const inputIds = new ort.Tensor("int64", tokens.ids, [1, tokens.ids.length]);
    const attentionMask = new ort.Tensor("int64", tokens.attentionMask, [1, tokens.ids.length]);
    
    // 3. Run inference
    const results = await this.session!.run({
      input_ids: inputIds,
      attention_mask: attentionMask
    });
    
    // 4. Mean pooling (for sentence embedding)
    const embeddings = this.meanPooling(results.last_hidden_state, tokens.attentionMask);
    
    // 5. L2 normalize
    return this.normalize(embeddings);
  }
  
  private meanPooling(hiddenStates: ort.Tensor, attentionMask: number[]): Float32Array {
    // Mean pooling with attention mask
    const [batch, seqLen, hiddenDim] = hiddenStates.dims as number[];
    const data = hiddenStates.data as Float32Array;
    const output = new Float32Array(hiddenDim);
    
    let maskSum = 0;
    for (let i = 0; i < seqLen; i++) {
      maskSum += attentionMask[i];
    }
    
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
    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);
    
    return Array.from(vector).map(v => v / magnitude);
  }
}
```

### 3.3 守护进程实现

```typescript
// embedding-daemon.ts
import { createServer, Server } from "net";
import * as ort from "onnxruntime-node";

interface DaemonConfig {
  socketPath: string;  // Unix socket (macOS/Linux) or named pipe (Windows)
  modelPath: string;
  maxBatchSize: number;
  idleTimeoutMs: number;
}

export class EmbeddingDaemon {
  private server: Server | null = null;
  private session: ort.InferenceSession | null = null;
  private requestQueue: Array<{ text: string; resolve: (v: number[]) => void }> = [];
  private processing = false;
  
  async start(config: DaemonConfig): Promise<void> {
    // 预加载模型
    this.session = await ort.InferenceSession.create(config.modelPath);
    
    // 创建 Unix Socket / Named Pipe server
    this.server = createServer((socket) => {
      this.handleConnection(socket);
    });
    
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(config.socketPath, () => {
        console.log(`[Daemon] Listening on ${config.socketPath}`);
        resolve();
      });
      this.server!.on("error", reject);
    });
  }
  
  private handleConnection(socket: any): void {
    let buffer = "";
    
    socket.on("data", (data: Buffer) => {
      buffer += data.toString();
      
      // 处理 newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const request = JSON.parse(line);
          this.processRequest(request).then((result) => {
            socket.write(JSON.stringify({ success: true, data: result }) + "\n");
          }).catch((err) => {
            socket.write(JSON.stringify({ success: false, error: err.message }) + "\n");
          });
        } catch (err) {
          socket.write(JSON.stringify({ success: false, error: "Invalid JSON" }) + "\n");
        }
      }
    });
  }
  
  private async processRequest(request: any): Promise<number[]> {
    // 批量处理优化
    return this.enqueueAndWait(request.text);
  }
  
  private async enqueueAndWait(text: string): Promise<number[]> {
    return new Promise((resolve) => {
      this.requestQueue.push({ text, resolve });
      if (!this.processing) {
        this.processBatch();
      }
    });
  }
  
  private async processBatch(): Promise<void> {
    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      // 取出一个 batch
      const batch = this.requestQueue.splice(0, 8); // max batch size
      
      // 处理 batch
      const embeddings = await this.computeEmbeddings(batch.map(b => b.text));
      
      // 分发结果
      batch.forEach((item, i) => {
        item.resolve(embeddings[i]);
      });
    }
    
    this.processing = false;
  }
  
  private async computeEmbeddings(texts: string[]): Promise<number[][]> {
    // Batch inference implementation
    // ...
    return [];
  }
  
  async stop(): Promise<void> {
    this.server?.close();
    await this.session?.release();
  }
}
```

### 3.4 客户端 Provider

```typescript
// minilm-daemon-client.ts
import { EmbeddingProvider } from "./memory-vector";
import { createConnection } from "net";
import { join } from "path";

export class DaemonClientProvider implements EmbeddingProvider {
  readonly dim = 384;
  readonly model = "all-MiniLM-L6-v2";
  
  private socketPath: string;
  private ensureDaemon: () => Promise<void>;
  
  constructor(socketPath?: string) {
    this.socketPath = socketPath || this.getDefaultSocketPath();
    this.ensureDaemon = this.createDaemonManager();
  }
  
  async embed(text: string): Promise<number[]> {
    await this.ensureDaemon();
    
    return new Promise((resolve, reject) => {
      const client = createConnection(this.socketPath);
      let buffer = "";
      
      client.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const response = JSON.parse(line);
            client.end();
            
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error));
            }
            return;
          } catch {
            // Continue buffering
          }
        }
      });
      
      client.on("error", (err) => {
        reject(err);
      });
      
      client.write(JSON.stringify({ text }) + "\n");
    });
  }
  
  private getDefaultSocketPath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
    return join(home, ".pi", "sockets", "embedding-daemon.sock");
  }
  
  private createDaemonManager(): () => Promise<void> {
    let daemonStarted = false;
    
    return async () => {
      if (daemonStarted) return;
      
      // Check if daemon is already running
      try {
        await this.pingDaemon();
        daemonStarted = true;
        return;
      } catch {
        // Daemon not running, start it
      }
      
      // Spawn daemon process
      await this.spawnDaemon();
      daemonStarted = true;
    };
  }
  
  private async pingDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = createConnection(this.socketPath);
      client.on("connect", () => {
        client.end();
        resolve();
      });
      client.on("error", reject);
      client.setTimeout(100, () => reject(new Error("Timeout")));
    });
  }
  
  private async spawnDaemon(): Promise<void> {
    const { spawn } = await import("child_process");
    const daemonPath = join(__dirname, "embedding-daemon.ts");
    
    const child = spawn("tsx", [daemonPath, "--socket", this.socketPath], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    // Wait for daemon to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Daemon startup timeout")), 10000);
      
      const checkReady = async () => {
        try {
          await this.pingDaemon();
          clearTimeout(timeout);
          resolve();
        } catch {
          setTimeout(checkReady, 100);
        }
      };
      
      setTimeout(checkReady, 500); // Give daemon time to start
    });
    
    // Unref so parent can exit independently
    child.unref();
  }
}
```

## 4. 配置更新

```typescript
// config.ts 更新
export interface VectorMemoryConfig {
  enabled: boolean;
  provider: "openai" | "local" | "minilm";  // 新增 "minilm"
  model: string;
  apiKey: string | null;
  baseUrl: string;
  
  // 新增配置
  minilm?: {
    mode: "direct" | "daemon";  // direct = 单进程, daemon = 共享进程
    modelPath?: string;           // 自定义模型路径
    daemonSocketPath?: string;   // 守护进程 socket 路径
    batchSize?: number;          // 批处理大小 (1-16)
    maxSeqLength?: number;       // 最大序列长度 (default: 512)
  };
  
  autoRecall: boolean;
  autoIndex: boolean;
  recallLimit: number;
  recallMinScore: number;
  hybridSearch: boolean;
  vectorWeight: number;
  dbPath: string;
}
```

## 5. 模型获取

### 5.1 自动下载流程

```typescript
// model-downloader.ts
export async function ensureModel(): Promise<string> {
  const modelDir = join(homedir(), ".pi", "models", "all-MiniLM-L6-v2");
  const modelPath = join(modelDir, "model.onnx");
  
  if (existsSync(modelPath)) {
    return modelPath;
  }
  
  // 模型不存在，自动下载
  console.log("[Embedding] Downloading all-MiniLM-L6-v2 model...");
  
  // Hugging Face 镜像或 CDN
  const urls = [
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx",
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@latest/models/all-MiniLM-L6-v2/onnx/model.onnx",
  ];
  
  for (const url of urls) {
    try {
      await downloadFile(url, modelPath);
      console.log("[Embedding] Model downloaded successfully");
      return modelPath;
    } catch (err) {
      console.warn(`[Embedding] Failed to download from ${url}: ${err}`);
    }
  }
  
  throw new Error("Failed to download model from all sources");
}
```

## 6. 性能预期

| 指标 | 单进程 Direct | 守护进程 | HTTP 服务 |
|------|-------------|----------|----------|
| 冷启动 | 500ms | 500ms (首次) | 2000ms |
| 热启动 | 500ms | 10ms | 50ms |
| 单请求 latency | 15ms | 20ms (IPC) | 50ms (HTTP) |
| 并发 100 req/s | 1500ms | 300ms | 800ms |
| 内存 (每实例) | 150MB | 5MB (client) | 150MB |

## 7. 向后兼容

```typescript
// 默认配置迁移
function migrateConfig(oldConfig: any): VectorMemoryConfig {
  if (oldConfig.provider === "local" && oldConfig.baseUrl) {
    // 旧配置使用 HTTP 服务，保持兼容
    return {
      ...oldConfig,
      provider: "local",
      // 保留 baseUrl 作为 HTTP 代理
    };
  }
  
  // 新默认使用 minilm + daemon
  return {
    ...oldConfig,
    provider: "minilm",
    minilm: {
      mode: "daemon",
      batchSize: 8,
    }
  };
}
```

## 8. 实现优先级

1. **Phase 1**: Direct Mode (单进程 ONNX) - 最快实现，验证可行性
2. **Phase 2**: Tokenizer 集成 - 使用 transformers.js 的 wasm tokenizer
3. **Phase 3**: Daemon Mode - 多进程共享模型
4. **Phase 4**: HTTP Proxy - 向后兼容 PSM

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| ONNX Runtime 平台兼容性问题 | 中 | 高 | 提供 fallback 到 node-llama-cpp |
| 模型下载失败 | 低 | 中 | 多镜像源 + 本地缓存 + 用户手动安装 |
| 守护进程生命周期管理 | 中 | 中 | 心跳检测 + 自动重启 + 优雅退出 |
| 内存泄漏 | 低 | 高 | Batch processing + 定期释放缓存 |

