# Handoff: Role Persona Extension

**Date**: 2026-02-23
**Version**: 2.0
**Status**: Production-ready

---

## 当前状态

Role Persona Extension 已从初始的 1,100 行单文件实现演进为 9 模块、4,800+ 行的完整系统。

### 已实现功能

| 功能 | 状态 | 模块 |
|------|------|------|
| 角色创建与映射 | ✅ 稳定 | `role-store.ts` |
| 多语言模板 | ✅ 稳定 | `role-template.ts` |
| Markdown 记忆引擎 | ✅ 稳定 | `memory-md.ts` |
| 自动记忆提取 | ✅ 稳定 | `memory-llm.ts` |
| 压缩时记忆抢救 | ✅ 稳定 | `index.ts` |
| 按需记忆搜索 | ✅ 稳定 | `memory-md.ts` |
| 标签系统 | ✅ 稳定 | `memory-tags.ts` |
| 向量语义搜索 | ✅ 可选 | `memory-vector.ts` |
| 外部只读记忆 | ✅ 可选 | `index.ts` |
| TUI 记忆查看器 | ✅ 稳定 | `memory-viewer.ts` |
| Role CRUD Tools | ✅ 稳定 | `index.ts` |
| 结构化目录布局 | ✅ 稳定 | `role-store.ts` |

---

## 架构演进

### v1 (2025-02-06)
```
role-persona/
└── index.ts              # 1,100 lines, 全功能单文件
```

### v2 (2026-02-23)
```
role-persona/
├── index.ts              # 1,446 lines - 编排层
├── role-store.ts         # 210 lines - 角色/映射/加载
├── role-template.ts      # 370 lines - i18n 模板
├── memory-md.ts          # 1,111 lines - MD 记忆核心
├── memory-llm.ts         # 417 lines - LLM 提取/tidy
├── memory-tags.ts        # 682 lines - 标签系统
├── memory-viewer.ts      # 214 lines - TUI 查看器
├── memory-vector.ts      # 595 lines - 向量搜索
├── config.ts             # 272 lines - 配置中心
└── logger.ts             # 77 lines - 文件日志
```

---

## 核心数据流

### 会话生命周期

```
session_start
    ↓
加载 config.json → 解析 CWD 映射 → 确定角色
    ↓
加载 core/*.md 人格文件
    ↓
before_agent_start
    ↓
按需搜索记忆 → 注入 system prompt
    ↓
[对话进行]
    ↓
agent_end (每轮)
    ↓
检查触发条件 → 批量提取记忆
    ↓
session_before_compact
    ↓
压缩时记忆抢救（零额外调用）
    ↓
session_shutdown
    ↓
兜底 flush 未保存记忆
```

### 记忆写入来源

| 来源 | 触发时机 | LLM 调用 |
|------|----------|----------|
| `compaction` | 上下文压缩时 | 0（搭便车） |
| `auto-extract` | 5轮/关键词/30分钟 | 1 |
| `tool` | AI 调用 memory tool | 0 |
| `manual` | `/memory-tidy-llm` | 1 |

---

## 关键设计决策

### 1. 结构化目录布局 (v2)

从扁平结构迁移到层级结构：

```
<role>/
├── core/                 # 新增
│   ├── agents.md
│   ├── identity.md
│   ├── soul.md
│   ├── user.md
│   ├── tools.md
│   ├── heartbeat.md
│   └── constraints.md    # 新增
├── memory/
│   ├── consolidated.md
│   └── daily/            # 新增层级
├── context/              # 新增
│   ├── active-project.md
│   └── session-state.md
├── skills/               # 新增
│   └── active.json
└── archive/              # 新增
```

**迁移策略**：
- 启动时自动迁移旧文件
- 保留旧文件直到新文件确认写入
- 历史备份移至 `.backup/`

### 2. 零额外调用记忆提取

在上下文压缩的同一次 LLM 调用中提取记忆：

```typescript
// 压缩提示词追加
const memoryInstruction = `
在总结之前，提取重要记忆到 <memory> 块：
{"learnings": [...], "preferences": [...], "events": [...]}
`;

// LLM 返回
const response = `<summary>对话摘要</summary>
<memory>{"learnings": [...]}</memory>`;

// 解析并写入
parseAndWriteMemory(response);

// 返回干净的 summary 给 Pi
return stripMemoryBlock(response);
```

### 3. 向量记忆（可选增强）

基于 LanceDB + OpenAI Embedding：

```
memory-md.ts (source of truth)
         ↓
[写入 learning/preference]
         ↓
   queueVectorIndex()
         ↓
   LanceDB (async indexing)
         ↓
before_agent_start: autoRecall()
         ↓
   hybridSearch(): keyword + vector → RRF
         ↓
注入相关记忆到 system prompt
```

**降级策略**：
- `@lancedb/lancedb` 未安装 → 自动禁用
- OpenAI API 失败 → 回退纯关键词搜索
- 索引损坏 → 自动重建

### 4. 外部只读记忆（可选）

接入外部记忆服务（如 pi-session-manager）：

```
before_agent_start
    ↓
调用 /v1/memory/unified
    ↓
按置信度过滤 → 注入 hints
    ↓
原有记忆流程继续
```

完全可选，失败时静默降级。

---

## 配置系统

### 三级优先级

```
1. 环境变量 (ROLE_*)
       ↓
2. pi-role-persona.jsonc
       ↓
3. 内置默认值 (config.ts)
```

### 关键配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `autoMemory.enabled` | `true` | 自动提取总开关 |
| `autoMemory.model` | `gpt-5.1-codex-mini` | 提取模型 |
| `autoMemory.batchTurns` | `5` | 累计轮数触发 |
| `autoMemory.intervalMs` | `1800000` | 30分钟触发 |
| `memory.onDemandSearch.enabled` | `true` | 按需搜索 |
| `vectorMemory.enabled` | `false` | 向量记忆（需安装依赖） |
| `externalReadonly.enabled` | `false` | 外部只读记忆 |

---

## 扩展点

### 添加新的记忆来源

在 `index.ts` 的 `agent_end` 处理器中添加：

```typescript
// 自定义提取逻辑
const customExtract = async () => {
  const memories = await extractFromCustomSource();
  for (const m of memories) {
    await addRoleLearning(rolePath, m.content, m.category);
  }
};
```

### 自定义向量索引

在 `memory-vector.ts` 中扩展：

```typescript
// 添加新的 embedding provider
class CustomEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // 自定义 embedding 逻辑
  }
}
```

---

## 已知限制

1. **向量记忆依赖**：需要额外安装 `@lancedb/lancedb` 和 OpenAI API key
2. **角色切换**：仅在会话启动时确定，会话内不可切换
3. **并发写入**：同一角色的并发会话可能导致记忆文件冲突（文件锁未实现）
4. **标签系统**：基于 LLM 提取，可能产生不一致的标签命名

---

## 性能特征

| 操作 | 耗时 | 备注 |
|------|------|------|
| 角色加载 | < 10ms | 纯文件读取 |
| 按需搜索 | 10-50ms | Jaccard + substring |
| 向量搜索 | 50-200ms | 含 embedding API 调用 |
| 自动提取 | 500-2000ms | LLM 调用 |
| 压缩抢救 | 0ms | 搭便车，零额外调用 |

---

## 测试建议

```bash
# 基础功能测试
/role create test-role
/role map test-role
/role info
/memories

# 记忆系统测试
# 1. 进行 5 轮对话
# 2. 观察 /memory-log 是否有 auto-extract 记录
# 3. 检查 memory/consolidated.md 是否写入

# 向量记忆测试（如启用）
/memory-vector stats
/memory-vector rebuild

# 配置热重载测试
# 1. 修改 pi-role-persona.jsonc
# 2. 观察下一轮是否生效
```

---

## 下一步（可选）

1. **角色继承**：支持角色模板继承
2. **GUI 编辑器**：可视化角色编辑器
3. **记忆冲突解决**：并发写入检测与合并
4. **记忆可视化**：时间线视图、关联图
5. **导出/导入**：角色打包分享

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `README.md` | 用户文档 |
| `ARCHITECTURE.md` | 架构图 |
| `CHANGELOG.md` | 变更日志 |
| `CONFIG-MIGRATION.md` | 配置迁移指南 |
| `TAG_SYSTEM_DESIGN.md` | 标签系统设计 |
| `docs/ai-runtime-comparison.md` | 与 ai-runtime 对比 |

---

## Credits

- 初始设计基于 [OpenClaw](https://openclaw.io)
- 演进过程中的重要贡献：向量记忆、压缩抢救、按需搜索
