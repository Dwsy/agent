# 配置参考

## 文件位置

```
~/.pi/agent/extensions/role-persona/pi-role-persona.jsonc
```

优先级：环境变量 (`ROLE_*`) > JSONC > 默认值

## 完整配置

```jsonc
{
  "autoMemory": {
    "enabled": true,
    "model": "openai-codex/gpt-5.1-codex-mini",
    "tagModel": null,
    "reserveTokens": 8192,
    "maxItems": 3,
    "maxText": 200,
    "batchTurns": 5,
    "minTurns": 2,
    "intervalMs": 1800000,
    "contextOverlap": 4
  },

  "logging": {
    "enabled": true,
    "level": "info",
    "retentionDays": 7
  },

  "memory": {
    "defaultCategories": ["Communication", "Code", "Tools", "Workflow", "General"],
    "dedupeThreshold": 0.9,
    "onDemandSearch": {
      "enabled": true,
      "maxResults": 5,
      "minScore": 0.2,
      "alwaysLoadHighPriority": true
    },
    "searchDefaults": { "maxResults": 20, "minScore": 0.1, "includeDailyMemory": true }
  },

  "ui": {
    "spinnerIntervalMs": 260,
    "spinnerFrames": ["✳", "✶", "✧", "✦"],
    "viewerDefaultFilter": "all"
  },

  "advanced": {
    "shutdownFlushTimeoutMs": 1500,
    "forceKeywords": "结束|总结|退出|收尾|final|summary|wrap\\s?up",
    "evolutionReminderTurns": 5
  },

  "vectorMemory": {
    "enabled": false,
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": null,
    "autoRecall": true,
    "autoIndex": true,
    "hybridSearch": true,
    "vectorWeight": 1.0,
    "recallLimit": 3,
    "recallMinScore": 0.3,
    "dbPath": ".vector-db"
  },

  "externalReadonly": {
    "enabled": false,
    "baseUrl": "http://127.0.0.1:52131",
    "token": null,
    "timeoutMs": 1200,
    "topK": 8,
    "experienceLimit": 8,
    "minConfidence": 0.35
  }
}
```

## 环境变量

| 变量 | 配置键 |
|------|--------|
| `ROLE_AUTO_MEMORY` | autoMemory.enabled |
| `ROLE_AUTO_MEMORY_MODEL` | autoMemory.model |
| `ROLE_TAG_MODEL` | autoMemory.tagModel |
| `ROLE_LOG` | logging.enabled |
| `ROLE_VECTOR_MEMORY` | vectorMemory.enabled |
| `ROLE_VECTOR_API_KEY` | vectorMemory.apiKey |
| `ROLE_EXTERNAL_READONLY` | externalReadonly.enabled |
| `ROLE_EXTERNAL_BASE_URL` | externalReadonly.baseUrl |

## 示例

```bash
# 临时禁用
ROLE_AUTO_MEMORY=false pi

# 自定义模型
ROLE_AUTO_MEMORY_MODEL=anthropic/claude-sonnet-4 pi

# 启用向量记忆
npm install @lancedb/lancedb && ROLE_VECTOR_MEMORY=true ROLE_VECTOR_API_KEY=sk-... pi
```
