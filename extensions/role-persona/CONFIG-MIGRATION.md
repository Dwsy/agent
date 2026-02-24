# Role Persona Extension - 配置参考

完整配置指南，涵盖所有可用选项。

---

## 配置文件位置

```
~/.pi/agent/extensions/role-persona/pi-role-persona.jsonc
```

JSONC 格式支持注释和尾部逗号。

---

## 配置优先级

```
1. 环境变量 (ROLE_*)
       ↓
2. pi-role-persona.jsonc 配置文件
       ↓
3. 内置默认值 (config.ts)
```

---

## 完整配置示例

```jsonc
{
  // ==================== 自动记忆配置 ====================
  "autoMemory": {
    // 总开关：是否启用自动记忆提取
    "enabled": true,

    // 自动记忆提取使用的模型
    "model": "openai-codex/gpt-5.1-codex-mini",

    // 标签提取专用模型（默认继承 autoMemory.model）
    "tagModel": null,

    // Token 预算：为上下文预留的 token 数
    "reserveTokens": 8192,

    // 单次提取最多条目数（防止过度提取）
    "maxItems": 3,

    // 单条记忆最大字符数
    "maxText": 200,

    // Checkpoint 触发：累计轮数
    "batchTurns": 5,

    // 间隔触发：最小轮数（配合 intervalMs）
    "minTurns": 2,

    // 间隔触发：时间间隔（毫秒），默认 30 分钟
    "intervalMs": 1800000,

    // Flush 时保留的上下文重叠消息数
    "contextOverlap": 4
  },

  // ==================== 日志配置 ====================
  "logging": {
    // 是否启用日志
    "enabled": true,

    // 日志级别: "debug" | "info" | "warn" | "error"
    "level": "info",

    // 日志保留天数（0 表示不自动清理）
    "retentionDays": 7
  },

  // ==================== 记忆管理配置 ====================
  "memory": {
    // 默认学习分类（用于 Preferences）
    "defaultCategories": [
      "Communication",
      "Code",
      "Tools",
      "Workflow",
      "General"
    ],

    // 每日记忆文件路径模板
    // 变量: {rolePath}, {date}
    "dailyPathTemplate": "{rolePath}/memory/daily/{date}.md",

    // 记忆去重相似度阈值（0-1，Jaccard 系数）
    "dedupeThreshold": 0.9,

    // 按需搜索：第一条消息时根据内容自动搜索相关记忆
    "onDemandSearch": {
      // 是否启用（默认 true）
      "enabled": true,
      // 最大返回结果数
      "maxResults": 5,
      // 最小匹配分数（0-1）
      "minScore": 0.2,
      // 始终加载 High Priority 记忆（作为基础上下文）
      "alwaysLoadHighPriority": true
    },

    // 搜索默认参数
    "searchDefaults": {
      "maxResults": 20,
      "minScore": 0.1,
      "includeDailyMemory": true
    }
  },

  // ==================== UI 配置 ====================
  "ui": {
    // Checkpoint 动画帧间隔（毫秒）
    "spinnerIntervalMs": 260,

    // Checkpoint 动画帧符号
    "spinnerFrames": ["✳", "✶", "✧", "✦"],

    // 记忆查看器默认过滤
    // "all" | "learnings" | "preferences" | "events"
    "viewerDefaultFilter": "all"
  },

  // ==================== 高级配置 ====================
  "advanced": {
    // 会话关闭时 flush 的最大等待时间（毫秒）
    "shutdownFlushTimeoutMs": 1500,

    // 检查点触发的强制关键词（正则表达式字符串）
    "forceKeywords": "结束|总结|退出|收尾|结束会话|final|summary|wrap\\s?up|quit|exit",

    // 自动整理：进化提醒间隔（每 N 轮触发一次）
    "evolutionReminderTurns": 5
  },

  // ==================== 向量记忆配置 ====================
  "vectorMemory": {
    // 总开关：是否启用向量语义搜索
    // 需要 @lancedb/lancedb 依赖和 OpenAI API key
    "enabled": false,

    // Embedding 提供商（目前仅支持 openai）
    "provider": "openai",

    // Embedding 模型
    // text-embedding-3-small (1536维, $0.02/1M tokens)
    // text-embedding-3-large (3072维, $0.13/1M tokens)
    "model": "text-embedding-3-small",

    // 显式 API key（默认从 modelRegistry 自动获取 OpenAI key）
    "apiKey": null,

    // 自动召回：before_agent_start 时语义搜索注入上下文
    "autoRecall": true,

    // 自动索引：写入记忆时同步生成向量索引
    "autoIndex": true,

    // 混合搜索：关键词 + 向量 → RRF 融合排序
    "hybridSearch": true,

    // 向量搜索在 RRF 融合中的权重（1.0 = 等权）
    "vectorWeight": 1.0,

    // 自动召回：最大返回条数
    "recallLimit": 3,

    // 自动召回：最低相似度阈值
    "recallMinScore": 0.3,

    // 向量数据库存储路径（相对于 rolePath）
    "dbPath": ".vector-db"
  },

  // ==================== 外部只读记忆增强（可选） ====================
  "externalReadonly": {
    // 总开关：是否接入外部只读记忆服务
    "enabled": false,

    // 服务地址（不带 /api 前缀）
    "baseUrl": "http://127.0.0.1:52131",

    // 可选鉴权 token
    "token": null,

    // 超时毫秒
    "timeoutMs": 1200,

    // unified 查询 top_k
    "topK": 8,

    // experience 抽取 limit
    "experienceLimit": 8,

    // unified 注入最小置信度
    "minConfidence": 0.35
  }
}
```

---

## 环境变量清单

| 变量 | 说明 | 对应配置键 |
|------|------|-----------|
| `ROLE_AUTO_MEMORY` | 自动记忆总开关 | `autoMemory.enabled` |
| `ROLE_AUTO_MEMORY_MODEL` | 自动记忆模型 | `autoMemory.model` |
| `ROLE_TAG_MODEL` | 标签提取模型 | `autoMemory.tagModel` |
| `ROLE_AUTO_MEMORY_RESERVE_TOKENS` | Token 预留 | `autoMemory.reserveTokens` |
| `ROLE_LOG` | 日志开关 | `logging.enabled` |
| `ROLE_VECTOR_MEMORY` | 向量记忆开关 | `vectorMemory.enabled` |
| `ROLE_VECTOR_API_KEY` | 向量记忆 API key | `vectorMemory.apiKey` |
| `ROLE_EXTERNAL_READONLY` | 外部只读记忆开关 | `externalReadonly.enabled` |
| `ROLE_EXTERNAL_BASE_URL` | 外部记忆服务地址 | `externalReadonly.baseUrl` |
| `ROLE_EXTERNAL_TOKEN` | 外部记忆服务 token | `externalReadonly.token` |
| `ROLE_EXTERNAL_TIMEOUT_MS` | 外部记忆超时 | `externalReadonly.timeoutMs` |
| `ROLE_EXTERNAL_TOP_K` | 外部记忆查询条数 | `externalReadonly.topK` |
| `ROLE_EXTERNAL_EXP_LIMIT` | 外部经验抽取限制 | `externalReadonly.experienceLimit` |
| `ROLE_EXTERNAL_MIN_CONFIDENCE` | 外部记忆最小置信度 | `externalReadonly.minConfidence` |

---

## 使用示例

### 临时禁用自动记忆

```bash
ROLE_AUTO_MEMORY=false pi
```

### 使用自定义模型

```bash
ROLE_AUTO_MEMORY_MODEL=anthropic/claude-sonnet-4 pi
```

### 启用向量记忆

```bash
# 1. 安装依赖
cd ~/.pi/agent/extensions/role-persona
npm install @lancedb/lancedb

# 2. 设置环境变量
export ROLE_VECTOR_MEMORY=true
export ROLE_VECTOR_API_KEY=sk-...

# 3. 启动
pi
```

### 热重载配置

```typescript
// 在 pi 中重新加载配置
/reload-config  // 如果可用
// 或重启 pi
```

---

## 配置验证

配置文件错误时：
1. 扩展会使用内置默认值
2. 错误信息会写入日志（`.log/YYYY-MM-DD.log`）
3. 不影响正常对话流程

---

## 迁移历史

### 从 v1 (硬编码) 到 v2 (JSONC 配置)

| 旧方式 | 新方式 |
|--------|--------|
| `index.ts` 中硬编码常量 | `pi-role-persona.jsonc` 配置文件 |
| 环境变量直接读取 | 通过 `config.ts` 统一加载 |
| 无配置验证 | 带类型检查和默认值回退 |

自动迁移：配置系统会自动处理，无需手动操作。
