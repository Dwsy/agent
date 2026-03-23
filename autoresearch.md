# Autoresearch: 记忆系统分层与质量优化

## Objective

改进 role-persona 记忆系统的分层架构，解决以下核心问题：

1. **无 pending 层**：auto-extract 直接写入 consolidated，无试用期验证
2. **daily/consolidated 边界模糊**：两者职责不清，记忆提升无过滤
3. **used 计数器误导**：被搜索到 ≠ 真正有价值
4. **auto-extract prompt 过贪**：LLM 倾向于提取"看起来有价值的一切"

**目标**：实现 pending 层 + 二次验证机制，让记忆提升由"使用驱动"而非"提取时预判"。

## Metrics

- **Primary**: `memory_score` (0-100, higher is better) — 综合记忆质量评分
  - pending 层存在性：20分
  - 记忆分类准确性（learning/preference/event）：20分
  - 去重有效性（dedup 后唯一性）：30分
  - 使用驱动提升率（reinforced vs total extracted）：30分
- **Secondary**: 
  - `daily_count` — daily 记忆条数
  - `consolidated_count` — consolidated 记忆条数  
  - `dedup_ratio` — 去重率 (before/after)
  - `pending_count` — pending 层条数（0 表示 pending 未实现）

## How to Run

```bash
./autoresearch.sh
```

输出结构化指标：
```
METRIC memory_score=75
METRIC daily_count=45
METRIC consolidated_count=28
METRIC dedup_ratio=0.85
METRIC pending_count=0
```

## Files in Scope

| 文件 | 作用 |
|------|------|
| `extensions/role-persona/memory-md.ts` | 核心记忆 CRUD、解析、渲染 |
| `extensions/role-persona/memory-llm.ts` | auto-extract、LLM tidy |
| `extensions/role-persona/index.ts` | 钩子注册、记忆注入逻辑 |
| `extensions/role-persona/config.ts` | 配置管理 |

## Off Limits

- **不修改向量相关代码**（memory-vector.ts 等）
- **不修改 knowledge 相关代码**（knowledge.ts 等）
- **不修改 pi-gateway 插件代码**

## Constraints

1. 保持 Markdown 文件格式兼容（人类可读）
2. 向后兼容现有 memory 工具 API
3. 不引入新依赖

## Baseline (Before Pending Layer)

```
memory_score: 55  (无 pending 层，依赖 used 计数)
dedup_ratio: 0.72  (Jaccard 去重有效但粗糙)
pending_count: 0    (pending 层未实现)
```

## What's Been Tried

### Baseline (Round 0)
- **Status**: 已建立
- **Result**: memory_score=55, pending_count=0

### Pending Layer Implementation (Round 1+)
- **Goal**: 新增 pending 层，auto-extract 结果先进 pending
- **Approach**: 
  - 新增 `pending.md` 文件存储待验证记忆
  - 修改 `addRoleLearning` 逻辑，source=auto 时写入 pending
  - session_start 时随机 promote pending 记忆到 consolidated（模拟使用驱动）

### 二次验证机制 (Round 2+)
- **Goal**: 用 LLM 判断 pending 记忆是否值得提升
- **Approach**: 
  - compaction 时 review pending 项
  - 匹配当前 context 的 pending 项优先 promote

### 去重增强 (Round 3+)
- **Goal**: 改进 Jaccard 相似度阈值或引入其他去重算法
- **Approach**: 
  - 调整 dedupeThreshold 配置
  - 引入 n-gram 或 minhash 去重

---

*Last updated: 2026-03-24*
