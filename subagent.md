# Subagent 原生集成

## 功能

仅做模型设置功能，支持通过环境变量覆盖每个代理的模型配置。

## 安装

```bash
# 代理定义
~/.pi/agent/agents/
├── scout.md
├── planner.md
├── reviewer.md
└── worker.md

# 扩展
~/.pi/agent/extensions/subagent/
├── index.ts
└── agents.ts
```

## 模型配置

### 默认模型

| 代理 | 默认模型 | 工具 | 用途 |
|------|---------|------|------|
| scout | glm-4.7 | read, grep, find, ls, bash, **ace-tool** | 快速代码库侦察（支持语义搜索） |
| planner | claude-opus-4-5-thinking | read, grep, find, ls | 创建实现计划（推理能力强） |
| reviewer | gemini-3-pro-high | read, grep, find, ls, bash | 代码审查（审查能力强） |
| worker | glm-4.7 | * (所有默认工具) | 通用任务执行 |

### 方式 1：环境变量（推荐）

```bash
export MODEL_SCOUT="glm-4.7"
export MODEL_PLANNER="claude-opus-4-5-thinking"
export MODEL_REVIEWER="gemini-3-pro-high"
export MODEL_WORKER="glm-4.7"
```

### 方式 2：YAML frontmatter

编辑 `~/.pi/agent/agents/scout.md`：

```markdown
---
name: scout
description: Fast codebase recon...
model: glm-4.7
tools: read, grep, find, ls, bash
---
```

### 优先级

环境变量 > YAML frontmatter > 默认值

## 使用

### 斜杠命令

```
/implement add Redis caching
/scout-and-plan refactor auth
/implement-and-review add validation
```

### 自然语言

```
Use scout to find all authentication code
Use subagent implement add feature
```

## 工作流

| 工作流 | 流程 |
|--------|------|
| `/implement` | scout → planner → worker |
| `/scout-and-plan` | scout → planner |
| `/implement-and-review` | worker → reviewer → worker |

## 可用模型

### ProxyPal (proxypal)
- glm-4.7
- gpt-5
- qwen3-max
- deepseek-r1
- minimax-m2.1

### Google Antigravity
- claude-opus-4-5-thinking
- claude-sonnet-4-5
- gemini-3-flash
- gemini-3-pro-high
- gemini-3-pro-low

### OpenAI Codex
- gpt-5
- gpt-5-codex
- gpt-5.1
- gpt-5.2

### NVIDIA
- minimaxai/minimax-m2.1
- z-ai/glm4.7

## 详细文档

参见：https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/subagent/README.md