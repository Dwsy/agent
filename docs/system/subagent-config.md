# Subagent 模型配置

此文件用于配置 subagent 的模型设置。

## 环境变量

可以通过环境变量覆盖每个代理的模型：

```bash
export MODEL_SCOUT="glm-4.7"
export MODEL_PLANNER="claude-opus-4-5-thinking"
export MODEL_REVIEWER="gemini-3-pro-high"
export MODEL_WORKER="glm-4.7"
```

## 默认模型

如果没有设置环境变量和 YAML frontmatter，使用以下默认模型：

| 代理 | 默认模型 | 用途 |
|------|---------|------|
| scout | glm-4.7 | 快速代码库侦察 |
| planner | claude-opus-4-5-thinking | 创建实现计划（推理能力强） |
| reviewer | gemini-3-pro-high | 代码审查（审查能力强） |
| worker | glm-4.7 | 通用任务执行 |

## 代理定义

代理定义在 `~/.pi/agent/agents/*.md`，使用 YAML frontmatter 配置：

```markdown
---
name: scout
description: Fast codebase recon...
model: glm-4.7
tools: read, grep, find, ls, bash
---

System prompt...
```

**优先级**：环境变量 > YAML frontmatter > 默认值

## 可用模型

### ProxyPal (proxypal)
- glm-4.7
- gpt-5
- qwen3-max
- deepseek-r1
- minimax-m2.1
- qwen/qwen3-coder-plus

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
## Scout 代理工具

scout 代理现在支持 `ace-tool` 用于语义化搜索：

- **ace-tool**：语义化搜索（按功能、概念查找）
- **grep**：精确字符串/标识符搜索
- **find**：文件查找
- **read**：读取文件
- **ls**：列出目录
- **bash**：执行命令（只读）

### 使用示例

#### 语义化搜索（ace-tool）
```
查找用户认证相关的代码
搜索数据库连接的实现
```

#### 精确搜索（grep）
```
查找函数 authenticateUser 的定义
搜索字符串 "DATABASE_URL" 的出现位置
```
