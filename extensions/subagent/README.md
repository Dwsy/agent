# Subagent Extension

Pi Agent 的子代理扩展，支持将任务委托给专门的子代理，每个子代理拥有隔离的上下文窗口。

## 🎯 功能特性

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
│   ├── runner.ts          # 子代理进程执行器
│   └── parser.ts          # JSON 输出解析器
├── modes/
│   ├── base.ts            # 基础模式类
│   ├── single.ts          # 单一模式实现
│   ├── parallel.ts        # 并行模式实现
│   └── chain.ts           # 链式模式实现
├── ui/
│   ├── renderer.ts        # UI 渲染器
│   └── formatter.ts       # 输出格式化
├── utils/
│   ├── agent-creator.ts   # 代理创建工具
│   ├── concurrency.ts     # 并发控制
│   ├── formatter.ts       # 格式化工具
│   └── tempfiles.ts       # 临时文件管理
├── demo-dynamic-agent.ts  # 动态代理生成演示
├── dynamic-agent.test.ts  # 单元测试
├── FEATURES.md            # 功能特性文档
└── README.md              # 本文档
```

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

Pi Agent 提供了几个常用的内置代理：

| 代理 | 描述 | 工具 |
|------|------|------|
| `scout` | 快速代码侦察 | read, grep, find, ls, bash, ace-tool |
| `worker` | 通用工作代理 | read, bash, write, edit |
| `reviewer` | 代码审查 | read, bash |
| `vision` | 视觉分析 | read, bash, write, edit |

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

## 📚 相关文档

- [FEATURES.md](./FEATURES.md) - 详细功能特性
- [Pi Agent 文档](https://github.com/mariozechner/pi-coding-agent) - 主项目文档

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License