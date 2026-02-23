# Issue: 向量记忆混合搜索层集成

## Goal
在现有 Markdown 记忆系统之上叠加向量索引层，实现语义搜索能力，解决同义词、跨语言、语义相似但关键词不同的记忆召回问题。

## Background
当前 `memory-md.ts` 使用 `substring(0.5) + Jaccard(0.3) + token(0.2)` 组合算法，存在以下局限：
- 中英文混合时 Jaccard 失效（tokenization 差异）
- "React hooks" 与 "useState/useEffect" 语义相关但无法召回
- "性能优化"与"Performance tuning"跨语言无法匹配

参考 OpenClaw memory-lancedb 实现，采用混合架构：Markdown 为主，向量为索引。

## Phases

### Phase 1: 向量存储层基础设施
- [ ] 新增 `memory-vector.ts` 模块
  - LanceDB 本地向量数据库封装
  - 支持 OpenAI text-embedding-3-small (1536d)
  - 预留本地 embedding 降级路径 (384d)
- [ ] 新增 `memory-embedding.ts` 抽象层
  - `EmbeddingProvider` 接口
  - `OpenAIEmbedding` 实现
  - `LocalEmbedding` 占位实现
- [ ] 配置扩展 `pi-role-persona.jsonc`
  ```jsonc
  "vectorMemory": {
    "enabled": true,
    "provider": "openai", // "openai" | "local"
    "model": "text-embedding-3-small",
    "dbPath": ".vector-db"
  }
  ```

### Phase 2: 双向同步机制
- [ ] 写入时同步索引 (addRoleLearning/addRolePreference)
  - 异步队列，不阻塞主流程
  - 失败时记录日志，不影响 Markdown 写入
- [ ] 存量数据重建命令
  - `/memory-vector rebuild` - 全量索引重建
  - 启动时自动检测并提示重建

### Phase 3: 混合搜索实现
- [ ] 新增 `searchRoleMemoryHybrid()` 函数
  - 并行执行：关键词搜索 + 向量搜索
  - RRF (Reciprocal Rank Fusion) 融合排序
  - 可配置权重参数
- [ ] `memory tool` 的 search action 迁移
  - 默认使用 hybrid 搜索
  - 保留纯关键词搜索选项

### Phase 4: 自动召回增强
- [ ] `before_agent_start` hook 集成
  - 用户首消息自动语义搜索
  - 注入 `<relevant-memories>` 到 system prompt
  - 可配置 recallLimit/recallMinScore

## Acceptance Criteria
- [ ] 向量搜索延迟 < 50ms（LanceDB 本地）
- [ ] embedding 调用支持失败降级（纯关键词）
- [ ] 同义不同词查询召回率提升 > 30%
- [ ] 跨语言查询（中英）可正确召回
- [ ] 存量 MEMORY.md 可一键重建索引
- [ ] 配置 `enabled: false` 时零开销

## Dependencies
- `@lancedb/lancedb` (~15MB，纯本地)
- OpenAI API key（用于 embedding，可本地替代）

## Estimated Effort
- Phase 1: 2-3 天
- Phase 2: 1-2 天
- Phase 3: 2-3 天
- Phase 4: 1-2 天
- **总计: 6-10 天**

## References
- `docs/role-persona-vector-memory-plan.md` (已有详细设计)
- OpenClaw `memory-lancedb` 实现参考
- RRF paper: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf

## Notes
- 保持 Markdown 人类可读的核心设计
- 向量层仅作为索引，不替代 Markdown 存储
- 考虑未来的多模态 embedding（代码片段、图像）
