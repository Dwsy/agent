# Pi Session State Plugin

「記憶が人を形作る」— 让会话状态流转自然融入工作流。

与 `pi-session-manager` SQLite 数据库集成，提供会话标签管理功能。

## 功能

- **自动标签识别**: LLM 可通过 Tool 获取可用标签列表
- **状态流转**: 支持工作流标签（待处理 → 进行中 → 已完成）
- **系统标签**: 内置 5 个状态标签
  - `待处理` (todo) - 等待开始
  - `进行中` (wip) - 正在处理
  - `已完成` (done) - 任务完成
  - `重要` (important) - 高优先级
  - `归档` (archive) - 已归档
- **自定义标签**: 自动创建不存在的标签

## 安装

```bash
# 确保数据库目录存在
mkdir -p ~/.pi/agent/sessions

# 插件已自动放在 extensions 目录，直接加载
pi -e ~/.pi/agent/extensions/pi-session-state/mod.ts
```

## Tools (LLM 使用)

| Tool | 描述 |
|------|------|
| `get_session_tags` | 获取当前会话的标签状态 |
| `set_session_tag` | 设置/切换会话标签 |
| `remove_session_tag` | 移除标签 |
| `list_available_tags` | 列出所有可用标签 |

### 使用示例

```
[用户] 帮我开始处理这个任务

[LLM] 调用 set_session_tag({ tag: "进行中" })
✅ 已更新标签: 无 → 进行中

[用户] 完成了

[LLM] 调用 set_session_tag({ tag: "已完成", fromTag: "进行中" })
✅ 已更新标签: 进行中 → 已完成
```

## Commands

| 命令 | 描述 |
|------|------|
| `/state` | 显示当前会话状态 |
| `/state-set <tag>` | 设置标签 |
| `/state-list` | 列出所有标签 |
| `/state-clear` | 清除所有标签 |
| `/flow <action>` | 快速流转: start/done/hold |

### 快速流转

```
/flow start   # 待处理 → 进行中
/flow done    # 进行中 → 已完成
/flow hold    # 进行中 → 待处理
```

## 数据库

- **路径**: `~/.pi/agent/sessions/sessions.db`
- **表**: `tags`, `session_tags`
- **后端**: 优先使用 `sqlite3` CLI，回退到 `better-sqlite3`

## 技术细节

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Pi Session    │────▶│  SQLite DB   │────▶│ Session Manager  │
│   State Plugin  │     │  sessions.db │     │     (GUI)        │
└─────────────────┘     └──────────────┘     └──────────────────┘
```

Plugin 直接操作 SQLite，与 GUI 应用共享同一数据库，状态实时同步。
