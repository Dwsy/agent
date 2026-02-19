# Concise-Mode 架构升级

## 升级概述

将提示词注入从**插件层**迁移到**系统层**（`system-prompts.ts`），遵循 Layer 2 Capability Prompt 架构。

---

## 架构对比

### Before（旧架构）

```
┌─────────────────────────────────────────────────────────────┐
│  concise-mode/index.ts (插件)                                │
│  - 提示词注入 ❌ (每次消息追加)                              │
│  - Hook 注册 ✅                                              │
│  - 状态管理 ✅                                               │
└─────────────────────────────────────────────────────────────┘
```

**问题：**
- ❌ 提示词每次消息追加，浪费 token
- ❌ 不符合 Gateway 架构规范
- ❌ 与 system-prompts.ts 职责重叠

---

### After（新架构）

```
┌─────────────────────────────────────────────────────────────┐
│  system-prompts.ts (系统层)                                  │
│  - CONCISE_MODE_SEGMENT (Layer 2 Capability Prompt)         │
│  - buildGatewaySystemPrompt() 条件注入                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  concise-mode/index.ts (插件层)                              │
│  - Hook 注册 ✅ (抑制自动回复)                               │
│  - 状态管理 ✅                                               │
│  - ❌ 提示词注入 (已移除)                                    │
└─────────────────────────────────────────────────────────────┘
```

**优势：**
- ✅ 提示词在 RPC 进程启动时注入一次
- ✅ 符合 Layer 2 Capability Prompt 架构
- ✅ 职责清晰：系统层管提示词，插件层管 Hook

---

## 注入流程

```
Gateway 启动
    ↓
读取 pi-gateway.jsonc
    ↓
config.plugins.config["concise-mode"].enabled = true
    ↓
buildGatewaySystemPrompt(config)
    ↓
检测 conciseModeEnabled = true
    ↓
注入 CONCISE_MODE_SEGMENT
    ↓
启动 RPC 进程：pi --mode rpc --append-system-prompt "完整提示词"
    ↓
pi 进程获得完整系统提示词（包含 concise-mode）
```

---

## 配置方式

```jsonc
// ~/.pi/agent/pi-gateway/pi-gateway.jsonc
{
  "plugins": {
    "config": {
      "concise-mode": {
        "enabled": true  // ← 触发 system-prompts.ts 注入
      }
    }
  }
}
```

---

## 提示词内容

```markdown
## Gateway: Concise Output Mode

You are in concise output mode. Follow these rules:

### 1. Proactive Progress Updates via send_message

Use the `send_message` tool to report progress at key milestones:

**Start:**
```
send_message({ text: "🚀 Starting [task name]..." })
```

**Progress (optional for long tasks):**
```
send_message({ text: "⏳ Progress: [status update]" })
```

**Completion Summary:**
```
send_message({ text: "✅ Completed [task name]\n\n**Summary:**\n- Result 1\n- Result 2\n\n**Next steps:** [if any]" })
```

### 2. Message Guidelines

- ✅ Use clear status indicators: 🚀 ⏳ ✅ ⚠️ ❌ 📊
- ✅ Keep messages short and actionable
- ✅ Use markdown formatting for readability
- ✅ Include summary at the end
- ❌ Do NOT send automatic follow-up replies like "还有其他问题吗？"

### 3. When to Use [NO_REPLY]

Output exactly `[NO_REPLY]` when:
- Task completed and summary already sent via send_message
- No user-facing message is needed
- You want to suppress automatic replies

### 4. Example Flow

```
User: 检查系统状态

AI: send_message("🚀 Starting system check...")
AI: [executes checks]
AI: send_message("✅ System check completed\n\n**Results:**\n- CPU: 45%\n- Memory: 2.3GB/8GB\n- Disk: 45% used\n\n**Status:** All systems normal")
AI: [NO_REPLY]  ← Suppresses automatic reply
```
```

---

## 组件职责

| 组件 | 职责 | 位置 |
|------|------|------|
| **提示词定义** | 定义 concise-mode 行为规范 | `system-prompts.ts` |
| **条件注入** | 根据配置决定是否注入 | `system-prompts.ts` |
| **Hook 逻辑** | 抑制自动回复 | `concise-mode/index.ts` |
| **流式抑制** | 禁用 streaming 输出 | `streaming.ts` |
| **配置触发** | 启用/禁用功能 | `pi-gateway.jsonc` |

---

## 升级步骤

1. ✅ 在 `system-prompts.ts` 中添加 `CONCISE_MODE_SEGMENT`
2. ✅ 在 `buildGatewaySystemPrompt()` 中添加条件注入逻辑
3. ✅ 从 `concise-mode/index.ts` 移除提示词注入
4. ✅ 清理 `streaming.ts` 中的重复定义
5. ✅ 编译验证
6. ✅ 重启 Gateway 测试

---

## 验证方法

### 1. 检查系统提示词

```bash
# 查看 RPC 进程启动日志
tail -f logs/gateway.log | grep "prompt"

# 应看到 concise-mode 提示词被注入
```

### 2. 测试行为

**发送消息：** "检查系统"

**预期行为：**
```
🚀 Starting system check...     ← send_message
⏳ Progress: Checking CPU...    ← send_message (可选)
✅ Completed...                 ← send_message
[无自动回复]                    ← Hook 抑制
```

---

## 设计原则

> "关注点分离是良好架构的基石。" — *软件架构原则*

### 单一职责

- `system-prompts.ts`: 系统提示词构建
- `concise-mode/index.ts`: Hook 逻辑
- `streaming.ts`: 流式输出控制

### 配置驱动

- 通过 `pi-gateway.jsonc` 控制行为
- 无需修改代码即可启用/禁用

### 架构一致

- 遵循 Layer 2 Capability Prompt 模式
- 与 heartbeat、cron 等能力保持一致

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v2.0 | 2026-02-18 | 迁移到 system-prompts.ts |
| v1.0 | 2026-02-17 | 初始实现（插件层注入） |

---

## 参考文档

- [system-prompts.ts](../../core/system-prompts.ts) - 系统提示词架构
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 插件架构设计
- [REFACTOR-SUMMARY.md](./REFACTOR-SUMMARY.md) - 重构总结
