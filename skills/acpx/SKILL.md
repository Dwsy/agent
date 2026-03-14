---
name: acpx
description: Headless ACP CLI for agent-to-agent communication. Use when running coding agents (pi/qwen/codex/claude/gemini) headlessly, managing persistent sessions, queueing prompts, or consuming structured agent output from scripts. 触发词：acpx, ACP, agent communication, headless agent, session management, agent orchestration, 代理通信, 无头代理
---

# acpx - Headless ACP CLI

ACP (Agent Client Protocol) 的无头 CLI 客户端，专为 agent-to-agent 通信设计，避免 PTY 抓取问题。

## 安装

```bash
npm i -g acpx
```

## 核心能力

| 能力 | 说明 |
|------|------|
| 持久会话 | 多轮对话，按 repo/cwd 自动恢复 |
| 一次性执行 | `exec` 模式，单次执行不保存状态 |
| 并行会话 | `-s/--session` 命名会话，同仓库多对话 |
| 队列管理 | 多个 prompt 自动排队，`--no-wait` 异步提交 |
| 权限控制 | `--approve-all`/`--approve-reads`/`--deny-all` |
| 结构化输出 | `text`/`json`/`quiet` 三种格式 |
| 优雅取消 | `cancel` 命令或 Ctrl+C 发送 ACP session/cancel |

## 内置 Agent 注册表

| 名称 | 命令 |
|------|------|
| `pi` | `npx pi-acp` |
| `qwen` | `qwen --acp` |
| `codex` | `npx @zed-industries/codex-acp` |
| `claude` | `npx -y @zed-industries/claude-agent-acp` |
| `gemini` | `gemini --acp` |
| `cursor` | `cursor-agent acp` |
| `copilot` | `copilot --acp --stdio` |
| `openclaw` | `openclaw acp` |
| `droid` | `droid exec --output-format acp` |
| `kimi` | `kimi acp` |
| `opencode` | `npx -y opencode-ai acp` |
| `kiro` | `kiro-cli acp` |
| `kilocode` | `npx -y @kilocode/cli acp` |

默认 agent 是 `codex`。

## 命令模型

```bash
# 基本用法
acpx <agent> '<prompt>'              # 持久会话模式
acpx <agent> exec '<prompt>'         # 一次性执行
acpx <agent> -s <name> '<prompt>'    # 命名会话

# 会话管理
acpx <agent> sessions                # 列出会话
acpx <agent> sessions new            # 新建会话
acpx <agent> sessions show [name]    # 显示会话详情
acpx <agent> sessions history [name] # 查看历史
acpx <agent> sessions close [name]   # 关闭会话

# 控制
acpx <agent> cancel                  # 取消当前任务
acpx <agent> set-mode <mode>         # 设置模式
acpx <agent> set <key> <value>       # 设置选项
acpx <agent> status                  # 查看状态
```

## 全局选项

| 选项 | 说明 |
|------|------|
| `--agent <cmd>` | 原始 ACP agent 命令（逃逸口） |
| `--cwd <dir>` | 工作目录（影响会话作用域） |
| `--approve-all` | 自动批准所有权限请求 |
| `--approve-reads` | 批准读取，写入需确认（默认） |
| `--deny-all` | 拒绝所有权限请求 |
| `--format <fmt>` | 输出格式：`text`/`json`/`quiet` |
| `--timeout <s>` | 最大等待时间 |
| `--ttl <s>` | 队列所有者空闲 TTL（默认 300s） |
| `--verbose` | 详细日志 |

## 输出格式

### text（默认）
人类可读的流式输出，带更新和工具状态。

### json
NDJSON 事件流，适合自动化：

```bash
acpx --format json qwen 'review code' | jq -r 'select(.type=="tool_call") | [.status, .title] | @tsv'
```

### quiet
仅输出最终结果，适合脚本：

```bash
result=$(acpx --format quiet qwen exec 'summarize repo')
```

## 实用工作流

### 持久仓库助手

```bash
# 第一次：分析问题
acpx qwen 'inspect failing tests and propose a fix plan'

# 后续：继续同一会话
acpx qwen 'apply the smallest safe fix and run tests'
```

### 并行命名流

```bash
acpx qwen -s backend 'fix API pagination bug'
acpx qwen -s docs 'draft changelog entry for release'
```

### 队列异步提交

```bash
# 启动任务
acpx qwen 'run full test suite and investigate failures'

# 不等待，排队执行
acpx qwen --no-wait 'after tests, summarize root causes'
```

### 一次性脚本步骤

```bash
summary=$(acpx --format quiet exec 'summarize repo purpose in 3 lines')
echo "Summary: $summary"
```

### 机器可读输出用于编排

```bash
acpx --format json qwen 'review current branch changes' > events.ndjson
```

### 使用自定义 adapter

```bash
acpx --agent './bin/custom-acp-server --profile ci' 'run validation checks'
```

### 指定工作目录

```bash
acpx --cwd ~/repos/myproject --approve-all qwen -s pr-842 \
  'review PR #842 for regressions and propose minimal patch'
```

## 会话行为

会话作用域由以下决定：
- `agentCommand`（agent 命令）
- 绝对 `cwd`（工作目录）
- 可选的 session `name`

持久化：
- 会话记录存储在 `~/.acpx/sessions/*.json`
- `-s/--session` 在同一仓库创建并行命名对话
- 关闭的会话保留 `closed: true` 和 `closedAt` 时间戳
- 自动恢复跳过已关闭的会话

## 队列机制

每个持久会话有独立队列：
- 当前运行的 `acpx` 进程成为队列所有者
- 其他调用通过本地 IPC 提交 prompt
- Unix 使用 `~/.acpx/queues/<hash>.sock`
- Windows 使用命名管道
- 所有者空闲 TTL 后自动关闭（默认 300s）

## 配置文件

配置合并顺序（后优先）：
1. 全局：`~/.acpx/config.json`
2. 项目：`<cwd>/.acpxrc.json`

支持配置：
- `defaultAgent`：默认 agent
- `defaultPermissions`：权限模式
- `ttl`：空闲 TTL
- `timeout`：超时
- `format`：输出格式
- `agents`：agent 名称映射
- `auth`：认证凭据

```bash
acpx config show   # 查看配置
acpx config init   # 初始化全局配置模板
```

## 错误处理

- `NO_SESSION`：无持久会话，需先 `sessions new`
- 权限被拒绝：所有权限请求被拒绝时退出
- 超时：超过 `--timeout` 时退出
- Ctrl+C：发送 ACP `session/cancel`，等待后强制终止
