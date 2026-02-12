# Telegram Bot /role 功能调研报告

> 调研人: PureWolf (pi-zero)
> 日期: 2026-02-12
> 状态: 完成

## 问题描述

Dwsy 反馈：Telegram bot 的 `/role` 命令不可用，没有任何效果，未与 `extensions/role-persona/` 深度集成。

## 调研结论

**`/role` 在 gateway 和 role-persona 是两套完全独立的系统，互不感知。** 这是根本原因。

---

## 两套 Role 系统对比

| 维度 | Gateway `/role` | Extension `role-persona` |
|------|----------------|--------------------------|
| 位置 | `src/gateway/command-handler.ts` | `extensions/role-persona/index.ts` |
| 触发方式 | Telegram `/role <name>` | pi CLI 启动时自动加载 |
| 角色来源 | `pi-gateway.jsonc` → `roles.workspaceDirs` + `roles.capabilities` | `~/.pi/roles/` 目录下的角色文件夹 |
| 切换机制 | `setSessionRole()` → 释放旧 RPC → 用新 CapabilityProfile 重新 acquire | `session_start` 事件 → 根据 cwd 映射自动选择角色 |
| 实际效果 | 切换 RPC 进程的 cwd/extensions/skills/model 配置 | 注入 SOUL.md/IDENTITY.md/MEMORY.md 到系统提示词 |
| 当前配置 | `"workspaceDirs": {}` (空) | 有 `~/.pi/roles/zero/` 等角色 |

## 为什么 `/role` 没效果

### 1. 配置为空

`pi-gateway.jsonc` 中：
```jsonc
"roles": {
  "workspaceDirs": {}
}
```

`listAvailableRoles()` 只返回 `["default"]`，所以 `/role <任何名字>` 都会回复 "Unknown role"。

### 2. 即使配置了 workspaceDirs，也不会加载 role-persona 的人格文件

Gateway 的 role 切换只改变 RPC 进程的 CapabilityProfile（cwd、extensions、skills、model），不会触发 role-persona 的 `session_start` 事件重新加载角色文件。

### 3. role-persona 不感知 gateway 的 role 切换

role-persona 在 `session_start` 时根据 `ctx.cwd` 查找 `~/.pi/roles/` 下的映射。Gateway 的 `setSessionRole()` 虽然会 dispatch `session_end` + `session_start` hooks，但这些是 gateway 内部的 plugin hooks，不是 pi-coding-agent 的 extension events。

### 4. TUI 命令被屏蔽

`/role info`、`/role create`、`/role map`、`/role list` 被 `TUI_COMMANDS` 列表拦截，在 gateway RPC 模式下直接返回 "requires interactive TUI" 错误。只有 `/role <name>` 能通过。

## role-persona 扩展分析

role-persona 是一个功能完整的人格系统：

- **角色文件结构**: AGENTS.md / IDENTITY.md / SOUL.md / USER.md / MEMORY.md / memory/
- **自动记忆**: agent_end 时自动提取记忆，支持关键词触发、批次触发、定时触发
- **记忆工具**: `memory` tool（add_learning/add_preference/reinforce/search/list/consolidate/repair/llm_tidy）
- **TUI 命令**: /role info/create/map/unmap/list、/memories、/memory-fix、/memory-tidy、/memory-tidy-llm、/memory-tags
- **系统提示注入**: `before_agent_start` 事件注入角色文件 + 记忆到系统提示词

但这些功能全部依赖 pi CLI 的 TUI 模式，在 gateway RPC 模式下：
- TUI 命令被屏蔽
- `ctx.ui` 不可用（无 SelectList、confirm 等交互）
- `session_start` 的 cwd 是 gateway 的工作目录，不是用户期望的角色目录

## 修复方案

### 方案 A: Gateway 侧适配（推荐，v3.6 可做）

1. **在 `pi-gateway.jsonc` 配置 role-persona 为 RPC 扩展**
   ```jsonc
   "extensions": [
     "~/.pi/agent/extensions/role-persona/index.ts"
   ]
   ```
   这样 RPC 进程启动时会加载 role-persona，根据 cwd 自动选择角色。

2. **配置 `roles.workspaceDirs` 映射角色到不同 cwd**
   ```jsonc
   "roles": {
     "workspaceDirs": {
       "zero": "~/.pi/agent",
       "dev": "~/projects"
     }
   }
   ```
   `/role zero` → RPC 进程 cwd 切换到 `~/.pi/agent` → role-persona 的 `session_start` 根据 cwd 映射加载 zero 角色。

3. **问题**: role-persona 的 TUI 命令（/role info 等）在 RPC 模式下仍然不可用。需要 role-persona 增加 headless 降级。

### 方案 B: role-persona 增加 RPC/headless 支持

1. role-persona 检测 `ctx.hasUI === false` 时跳过 TUI 交互，用文本回复替代
2. `/role info` 等命令在 headless 模式下返回纯文本而非 TUI 组件
3. 角色切换通过 `/role <name>` 文本命令完成，不依赖 SelectList

### 方案 C: Gateway 内置 role-persona 逻辑（不推荐）

在 gateway 的 command-handler 中直接读取 `~/.pi/roles/` 下的角色文件，注入到系统提示词。
不推荐原因：重复实现，且 role-persona 已经很成熟。

## 建议

**短期（v3.6）**: 方案 A — 配置 role-persona 为 RPC 扩展 + 配置 workspaceDirs。验证 role-persona 在 RPC 模式下的 `session_start` 是否正常触发。

**中期**: 方案 B — role-persona 增加 headless 降级，让 `/role info` 等命令在 Telegram 中可用。

**立即可做**: 在 `pi-gateway.jsonc` 的 `extensions` 数组中加入 role-persona 路径，测试效果。
