# all-MiniLM-L6-v2 集成实现计划

## 概述
将 `sentence-transformers/all-MiniLM-L6-v2` 嵌入模型集成到 role-persona 记忆系统，提供独立于 PSM (pi-session-manager) 的本地嵌入方案。

## 实现状态

### ✅ 已完成
- [x] 架构设计文档 (`docs/all-minilm-embedding-design.md`)
- [x] Direct Mode Provider (`embedding-minilm.ts`)
- [x] Daemon 服务端 (`embedding-daemon.ts`)
- [x] Daemon Client Provider (`embedding-minilm-daemon-client.ts`)

### 📋 待完成

#### Phase 1: 配置集成
**文件**: `config.ts`
- [ ] 扩展 `VectorMemoryConfig` 添加 `minilm` 配置选项
- [ ] 添加 provider 类型 `"minilm-direct" | "minilm-daemon"`
- [ ] 添加默认配置值

**文件**: `memory-vector.ts`
- [ ] 在 `initVectorMemory()` 中添加 MiniLM provider 分支
- [ ] 导入 `AllMiniLMEmbeddingProvider`
- [ ] 导入 `MiniLMDaemonClientProvider`

#### Phase 2: Tokenizer 完善
**文件**: `embedding-minilm.ts`, `embedding-daemon.ts`
- [ ] 集成 `@xenova/transformers` Tokenizer
- [ ] 实现 word-piece 分词器作为 fallback
- [ ] 添加词汇表加载逻辑

#### Phase 3: 依赖管理
**文件**: `package.json`
- [ ] 添加 `onnxruntime-node` 依赖
- [ ] 添加 `@xenova/transformers` 依赖

#### Phase 4: 模型管理
**新文件**: `model-downloader.ts`
- [ ] 实现模型自动下载
- [ ] 添加 HuggingFace 镜像支持
- [ ] 添加模型校验

#### Phase 5: 测试与验证
**新文件**: `embedding-minilm.test.ts`
- [ ] 单元测试: embed() 功能
- [ ] 集成测试: daemon 生命周期
- [ ] 性能测试: 延迟/吞吐量

## 配置示例

```json
// pi-role-persona.jsonc
{
  "vectorMemory": {
    "enabled": true,
    "provider": "minilm-daemon",
    "minilm": {
      "mode": "daemon",
      "modelPath": "~/.pi/models/all-MiniLM-L6-v2/model.onnx",
      "socketPath": "~/.pi/sockets/embedding-daemon.sock",
      "batchSize": 8,
      "maxSeqLength": 512
    }
  }
}
```

## Provider 选择决策树

```
provider === "openai"
  → OpenAIEmbeddingProvider (云端, 高质量, 需API Key)

provider === "local"
  → LocalEmbeddingProvider (PSM HTTP 服务, 向后兼容)

provider === "minilm-direct"
  → AllMiniLMEmbeddingProvider (单进程, 无依赖, 适合快速启动)

provider === "minilm-daemon"
  → MiniLMDaemonClientProvider (多进程共享, 节省内存, 推荐)
```

## 技术债务

1. **Tokenizer**: 当前使用简单的字符级 fallback tokenizer，需要集成正式的 BERT tokenizer
2. **Batch Processing**: 当前的 batch 处理是顺序的，需要实现真正的并行 batch inference
3. **错误处理**: 需要更完善的降级策略 (fallback to keyword search)
4. **模型下载**: 需要实现自动模型下载和缓存

## 下一步行动

1. 安装依赖: `npm i onnxruntime-node @xenova/transformers`
2. 更新配置: 修改 `config.ts` 和 `memory-vector.ts`
3. 下载模型: 实现 `model-downloader.ts`
4. 测试验证: 编写测试文件并验证功能

