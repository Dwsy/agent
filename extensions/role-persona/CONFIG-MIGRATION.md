# Role Persona Extension - 配置迁移说明

## 变更概要

将原本硬编码的配置统一提取为 JSONC 配置文件，同时保持环境变量的覆盖能力。

---

## 新增文件

### 1. `pi-role-persona.jsonc`
主配置文件，包含所有可调参数：
- `autoMemory`: 自动记忆相关配置
- `logging`: 日志配置
- `memory`: 记忆管理配置
- `ui`: UI 相关配置
- `advanced`: 高级配置

### 2. `config.ts`
配置加载模块，提供：
- `loadConfig()`: 加载配置（带缓存）
- `reloadConfig()`: 重新加载配置
- `getConfig()`: 获取当前配置
- `config`: 便捷访问代理对象

---

## 修改的文件

### `index.ts`
- 移除硬编码常量定义
- 改为从 `config.ts` 导入
- 更新 spinner 帧和间隔使用配置值
- 更新 shutdown flush timeout 使用配置值
- 更新 evolution reminder turns 使用配置值

### `memory-md.ts`
- 导入 `config.ts`
- `DEFAULT_MEMORY_CATEGORIES` 从配置读取
- 去重阈值使用 `config.memory.dedupeThreshold`
- 搜索默认值使用 `config.memory.searchDefaults`

### `memory-llm.ts`
- 导入 `config.ts`
- `reserveTokens` 默认值使用配置
- `maxItems` 和 `maxText` 默认值使用配置

### `memory-tags.ts`
- 导入 `config.ts`
- `TAG_MODEL` 从配置读取

### `logger.ts`
- `ENABLED` 从 `config.logging.enabled` 读取

---

## 配置优先级

```
1. 环境变量 (ROLE_*)
   ↓
2. pi-role-persona.jsonc 配置文件
   ↓
3. 内置默认值 (config.ts 中的 DEFAULT_CONFIG)
```

---

## 环境变量清单

| 变量 | 说明 | 配置键 |
|------|------|--------|
| `ROLE_AUTO_MEMORY` | 自动记忆总开关 | `autoMemory.enabled` |
| `ROLE_AUTO_MEMORY_MODEL` | 自动记忆模型 | `autoMemory.model` |
| `ROLE_TAG_MODEL` | 标签提取模型 | `autoMemory.tagModel` |
| `ROLE_AUTO_MEMORY_RESERVE_TOKENS` | Token 预留 | `autoMemory.reserveTokens` |
| `ROLE_LOG` | 日志开关 | `logging.enabled` |
| `RHO_SUBAGENT` | 子代理检测（禁用自动记忆） | - |

---

## 使用示例

### 修改配置文件
```jsonc
// ~/.pi/agent/extensions/role-persona/pi-role-persona.jsonc
{
  "autoMemory": {
    "enabled": true,
    "maxItems": 5,        // 从 3 改为 5
    "intervalMs": 600000  // 从 30min 改为 10min
  }
}
```

### 环境变量覆盖
```bash
# 临时禁用自动记忆
ROLE_AUTO_MEMORY=0 pi

# 使用自定义模型
ROLE_AUTO_MEMORY_MODEL=anthropic/claude-sonnet-4-20250514 pi
```

---

## 注意事项

1. JSONC 支持注释和尾部逗号
2. 配置文件不存在时会使用内置默认值
3. 环境变量优先级最高，适合临时覆盖
4. 修改配置后需要重启 pi 生效
