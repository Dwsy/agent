# Subagent Extension

Pi Agent 的子代理扩展，支持将任务委托给专门的子代理，每个子代理拥有隔离的上下文窗口。

## 🚀 快速开始

### 基础使用

```javascript
// 调用内置代理
subagent({
  agent: "scout",
  task: "查找认证相关的代码"
})
```

### 命令行调用

```bash
# 列出所有可用代理
/sub

# 调用特定代理
/sub:scout 查找认证相关的代码
```

### 查看输出

子代理输出包含：
- 思考过程（如果模型支持）
- 工具调用详情（时间、状态、结果）
- 最终输出
- 统计信息（token 数、执行时间）

按 `Ctrl+O` 展开/折叠查看详细信息。

## 📝 最近改进

### v1.5.0 - 输出格式优化 (2026-01-27)

#### 思考过程显示
- 完整展示子代理的推理过程
- 支持展开/折叠查看
- 折叠模式显示摘要

#### 工具调用详情
- 显示每个工具的执行时间
- 状态标识：`[OK]` `[FAIL]`
- JSON 结果自动美化格式化
- 清晰的视觉分隔

#### 输出格式改进
- 移除 emoji，使用纯文本和颜色区分
- 更清晰的视觉层次
- 更好的可读性

#### 示例对比

**之前：**
```
Tool Calls:
  -> bash "ls -la" (0.02s)
  Result: {"content":[{"type":"text","text":"..."}]}
```

**现在：**
```
Tool Calls (3):
  [OK] bash "ls -la"
     Time: 0.02s
     Result:
     {
       "content": [
         {
           "type": "text",
           "text": "..."
         }
       ]
     }
```

## 🎯 功能特性

### 输出格式改进

子代理输出经过全面优化，提供清晰易读的执行信息：

#### 思考过程显示
- 完整展示子代理的推理过程
- 支持展开/折叠查看
- 折叠模式显示摘要

#### 工具调用详情
- 显示每个工具的执行时间
- 状态标识：`[OK]` `[FAIL]`
- JSON 结果自动美化格式化
- 清晰的视觉分隔

#### 示例输出

```
[OK] scout (user)

Task: 查找认证相关的代码

Thinking Process:
  > Analyzing current directory structure...
  > Found README files and configuration
  > Reading documentation to understand project
  > Summary: Pi Agent is an enterprise-grade AI Agent system

Tool Calls (3):
  [OK] bash "ls -la"
     Time: 0.02s
     Result:
     {
       "content": [
         {
           "type": "text",
           "text": "total 3352..."
         }
       ]
     }

  [OK] read "/Users/.../README.md"
     Time: 0.00s
     Result:
     # Pi Agent

Output:
[最终输出内容]

Stats:
15.2K tokens • Duration: 0.08s
```

### 三种执行模式

### 三种执行模式

#### 1. 单一模式 (Single Mode)
调用一个子代理处理任务。

```javascript
subagent({
  agent: "scout",
  task: "查找认证相关的代码"
})
```

#### 2. 并行模式 (Parallel Mode)
同时调用多个子代理（最多 8 个），并行处理不同任务。

```javascript
subagent({
  tasks: [
    { agent: "scout", task: "查找数据库代码" },
    { agent: "reviewer", task: "审查最近的变更" },
    { agent: "worker", task: "生成文档" }
  ]
})
```

#### 3. 链式模式 (Chain Mode)
顺序执行多个子代理，支持 `{previous}` 占位符传递前一步的输出。

```javascript
subagent({
  chain: [
    { agent: "scout", task: "查找 API 端点定义" },
    { agent: "analyst", task: "分析以下代码: {previous}" },
    { agent: "reviewer", task: "审查分析结果: {previous}" }
  ]
})
```

### 动态代理生成

如果指定的代理不存在，系统会根据任务描述自动生成一个合适的子代理。

```javascript
// 自动生成一个名为 "code-cleaner" 的代理
subagent({
  agent: "code-cleaner",
  task: "清理 src/ 目录下的重复代码"
})
```

### 代理作用域

- **user** - 从 `~/.pi/agent/agents/` 加载（默认）
- **project** - 从 `.pi/agents/` 加载（项目特定）
- **both** - 同时包含用户和项目代理

```javascript
subagent({
  agent: "my-agent",
  task: "任务描述",
  agentScope: "both"  // 同时搜索用户和项目代理
})
```

## 📝 子代理配置

子代理通过 Markdown 文件定义，使用 YAML frontmatter 配置元数据。

### 文件位置

| 类型 | 路径 |
|------|------|
| 用户代理 | `~/.pi/agent/agents/*.md` |
| 项目代理 | `.pi/agents/*.md` |
| 动态代理 | `~/.pi/agent/agents/dynamic/*.md` |

### 配置字段

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ✅ | - | 代理名称 |
| `description` | string | ✅ | - | 代理描述 |
| `tools` | string | ❌ | - | 工具列表（逗号分隔） |
| `model` | string | ❌ | - | 使用的模型 |
| `provider` | string | ❌ | - | 模型提供商 |
| `showInTool` | boolean | ❌ | `false` | 是否在工具描述中显示 |
| `registerCommand` | boolean | ❌ | `true` | 是否注册命令 |

### 配置示例

#### 基础配置
```yaml
---
name: worker
description: 具有完整能力的通用子代理
tools: read, bash, write, edit
---

你是一名具有完整能力的 worker 代理...
```

#### 高级配置
```yaml
---
name: vision
description: 视觉分析代理，使用 Qwen3-VL 模型进行图像分析
tools: read, bash, write, edit
model: Qwen/Qwen3-VL-235B-A22B-Instruct
provider: modelscope
showInTool: true
registerCommand: true
---

你是一名视觉分析代理...
```

### 显示控制

#### 默认行为（隐藏在工具描述中）
```yaml
---
name: my-agent
description: 我的代理
---
```
- ❌ 不在 `subagent` 工具描述中显示
- ✅ 注册 `/sub:my-agent` 命令

#### 显示在工具描述中
```yaml
---
name: public-agent
description: 公开的代理
showInTool: true
---
```
- ✅ 在 `subagent` 工具描述中显示
- ✅ 注册 `/sub:public-agent` 命令

#### 完全隐藏
```yaml
---
name: secret-agent
description: 秘密代理
registerCommand: false
---
```
- ❌ 不在 `subagent` 工具描述中显示
- ❌ 不注册命令（只能通过 `subagent` 工具调用）

## 🚀 可用命令

| 命令 | 功能 |
|------|------|
| `/sub` | 列出所有可用子代理 |
| `/sub:<agent-name>` | 调用特定子代理执行任务 |
| `/create-agent` | 创建新代理 |
| `/list-agents` | 按作用域列出代理 |
| `/delete-agent` | 删除代理 |
| `/create-agent-interview` | 使用 AI 交互式表单创建代理 |
| `/list-promotable-agents` | 列出可提升的动态代理 |
| `/promote-agent` | 将动态代理提升到用户作用域 |

### 命令示例

```bash
# 列出所有子代理
/sub

# 调用 scout 代理
/sub:scout 查找认证相关的代码

# 创建新代理
/create-agent myagent "我的代理描述" --scope user --template worker

# 列出用户作用域的代理
/list-agents user

# 删除代理
/delete-agent myagent --scope user
```

## 📂 项目结构

```
extensions/subagent/
├── agents.ts              # 代理发现和配置解析
├── index.ts               # 扩展入口，注册工具和命令
├── types.ts               # TypeScript 类型定义
├── dynamic-agent.ts       # 动态代理生成逻辑
├── executor/
│   ├── runner.ts          # 子代理进程执行器（含 thinking 处理）
│   └── parser.ts          # JSON 输出解析器
├── modes/
│   ├── base.ts            # 基础模式类
│   ├── single.ts          # 单一模式实现
│   ├── parallel.ts        # 并行模式实现
│   └── chain.ts           # 链式模式实现
├── ui/
│   ├── renderer.ts        # UI 渲染器（输出格式化）
│   ├── formatter.ts       # 输出格式化工具（JSON 美化）
│   └── status-formatter.ts # 状态格式化
├── utils/
│   ├── agent-creator.ts   # 代理创建工具
│   ├── concurrency.ts     # 并发控制
│   ├── formatter.ts       # 格式化工具
│   └── tempfiles.ts       # 临时文件管理
├── demo-dynamic-agent.ts  # 动态代理生成演示
├── dynamic-agent.test.ts  # 单元测试
├── FEATURES.md            # 功能特性文档
├── OBSERVABILITY.md       # 可观测性文档
└── README.md              # 本文档
```

### 核心组件说明

#### UI 渲染层
- **renderer.ts** - 主要渲染逻辑，处理展开/折叠视图
- **formatter.ts** - 输出格式化，包含 JSON 美化和工具结果格式化
- **status-formatter.ts** - 状态格式化

#### 执行层
- **runner.ts** - 进程执行器，处理 thinking 事件和工具调用
- **parser.ts** - JSON 事件解析器

#### 模式层
- **single.ts** - 单一模式
- **parallel.ts** - 并行模式
- **chain.ts** - 链式模式

## 🔒 安全特性

### 项目代理确认

当运行项目本地代理（`.pi/agents/`）时，系统会提示用户确认：

```
Run project-local agents?
Agents: my-agent, custom-tool
Source: /path/to/project/.pi/agents

Project agents are repo-controlled. Only continue for trusted repositories.
[Yes/No]
```

可以通过 `confirmProjectAgents` 参数控制：

```javascript
subagent({
  agent: "project-agent",
  task: "任务",
  agentScope: "both",
  confirmProjectAgents: false  // 跳过确认
})
```

## 🎨 内置代理

### 显示在工具描述中的代理

以下代理默认显示在 `subagent` 工具的描述中：

| 代理 | 描述 | 特性 |
|------|------|------|
| **planner** | Five-phase planning agent with parallel exploration and multi-agent design | 复杂任务规划 |
| **scout** | Fast code reconnaissance agent (READ-ONLY) | 快速代码搜索 |
| **worker** | General-purpose worker agent with full capabilities | 通用任务处理 |

### 其他可用代理

以下代理通过命令 `/sub:<agent-name>` 调用：

| 代理 | 描述 |
|------|------|
| `web-browser` | Web browser interaction agent |
| `analyze` | Code analysis agent |
| `brainstormer` | Brainstorming agent |
| `codemap` | Code map visualization agent |
| `joke-teller` | Joke telling agent |
| `llm-learning` | LLM learning agent |
| `myagent` | Custom agent example |
| `research` | Research agent |
| `researcher` | Researcher agent |
| `reviewer` | Code reviewer agent |
| `security-reviewer` | Security reviewer agent |
| `simplifier` | Text simplifier agent |
| `system-design` | System design agent |
| `vision` | Vision/image processing agent |

## 📖 使用场景

### 场景 1: 代码审查

```javascript
// 1. 查找变更
subagent({
  agent: "scout",
  task: "查找最近修改的文件"
})

// 2. 审查代码
subagent({
  agent: "reviewer",
  task: "审查以下文件的代码质量: {previous}"
})
```

### 场景 2: 并行任务处理

```javascript
subagent({
  tasks: [
    { agent: "scout", task: "查找测试文件" },
    { agent: "scout", task: "查找配置文件" },
    { agent: "scout", task: "查找文档文件" }
  ]
})
```

### 场景 3: 复杂任务链

```javascript
subagent({
  chain: [
    { agent: "scout", task: "查找 API 定义" },
    { agent: "analyst", task: "分析 API 设计模式: {previous}" },
    { agent: "worker", task: "生成 API 文档: {previous}" },
    { agent: "reviewer", task: "审查文档: {previous}" }
  ]
})
```

## 🔧 开发指南

### 创建新代理

#### 方式 1: 手动创建

1. 在 `~/.pi/agent/agents/` 目录创建 `.md` 文件
2. 添加 YAML frontmatter 配置
3. 编写系统提示词

#### 方式 2: 使用命令

```bash
/create-agent myagent "代理描述" --scope user --template worker
```

#### 方式 3: 使用 AI 生成

```bash
/create-agent-interview
```

### 自定义模板

支持四种模板类型：
- `worker` - 通用工作代理
- `scout` - 代码侦察代理
- `reviewer` - 代码审查代理
- `custom` - 自定义代理

```bash
/create-agent myagent "代理描述" --template worker
```

### 测试代理

创建后立即测试：

```bash
/sub:myagent 测试任务
```

或使用工具调用：

```javascript
subagent({
  agent: "myagent",
  task: "测试任务"
})
```

## 🐛 故障排除

### 子代理找不到

检查：
1. 文件是否在正确的目录（`~/.pi/agent/agents/` 或 `.pi/agents/`）
2. YAML `name` 字段是否正确
3. 文件扩展名是否为 `.md`

### 命令未注册

检查：
1. YAML `registerCommand` 是否设置为 `false`
2. 是否重启了 Pi Agent

### 工具描述中未显示

检查：
1. YAML `showInTool` 是否设置为 `true`
2. 是否重启了 Pi Agent

### 动态代理未生成

检查：
1. 代理名称是否有效
2. 任务描述是否清晰
3. 查看错误日志

### 思考过程未显示

检查：
1. 模型是否支持 thinking 功能（如 Claude 3.7 Sonnet）
2. thinking level 是否设置正确（使用 `/thinking` 命令）
3. 查看是否在 JSON 模式下运行

### JSON 输出未美化

检查：
1. 确保使用的是最新版本的 subagent 扩展
2. 检查输出是否在展开模式下（按 Ctrl+O 展开）
3. 验证工具结果是否为有效的 JSON 格式

## 📚 相关文档

- [FEATURES.md](./FEATURES.md) - 详细功能特性
- [OBSERVABILITY.md](./OBSERVABILITY.md) - 可观测性和监控
- [QUICK-REF.md](./QUICK-REF.md) - 快速参考
- [README-EXAMPLES.md](./README-EXAMPLES.md) - 使用示例
- [Pi Agent 文档](https://github.com/mariozechner/pi-coding-agent) - 主项目文档

### 改进日志

- [OBSERVABILITY_SUMMARY.md](./OBSERVABILITY_SUMMARY.md) - 可观测性改进总结
- [OBSERVABILITY_IMPLEMENTATION.md](./OBSERVABILITY_IMPLEMENTATION.md) - 可观测性实现细节
- [OBSERVABILITY_FIXES.md](./OBSERVABILITY_FIXES.md) - 修复内容
- [OBSERVABILITY_FINAL-SUMMARY.md](./OBSERVABILITY_FINAL-SUMMARY.md) - 最终总结

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📋 版本历史

### v1.5.0 (2026-01-27)
- 输出格式优化
  - 添加思考过程显示
  - JSON 结果自动美化
  - 工具调用详情展示
  - 移除 emoji，改进可读性
- 新增思考事件处理
- 改进 UI 渲染逻辑

### v1.4.0 (2026-01-20)
- 动态代理生成改进
- 可观测性增强
- 工具调用历史记录

### v1.3.0 (2026-01-15)
- 并行模式优化
- 链式模式支持
- 项目代理确认机制

### v1.2.0 (2026-01-10)
- 代理作用域支持
- 项目本地代理
- 命令注册控制

### v1.1.0 (2026-01-05)
- 动态代理生成
- 代理模板系统
- 交互式代理创建

### v1.0.0 (2026-01-01)
- 初始版本
- 三种执行模式
- 基础代理管理