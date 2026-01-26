# 子代理配置功能

## 新增字段

### 1. `showInTool` - 控制是否在工具描述中显示

控制子代理是否出现在 `subagent` 工具的描述列表中。

- **默认值**: `false`（隐藏）
- **可选值**: `true`, `yes` - 显示；`false`, `no` - 隐藏

**示例**:
```yaml
---
name: my-agent
description: 我的代理
showInTool: true  # 明确显示在工具描述中
---
```

### 2. `registerCommand` - 控制是否注册为命令

控制是否为子代理注册 `/sub:agentname` 命令。

- **默认值**: `true`（注册）
- **可选值**: `false`, `no` - 不注册；其他值 - 注册

**示例**:
```yaml
---
name: my-agent
description: 我的代理
registerCommand: false  # 不注册命令
---
```

## 使用场景

### 场景 1: 仅在工具描述中显示（默认）

```yaml
---
name: scout
description: 快速代码侦察
showInTool: true
registerCommand: true
---
```

- ✅ 在 `subagent` 工具描述中显示
- ✅ 可以通过 `/sub:scout` 命令调用

### 场景 2: 隐藏在工具描述中，但保留命令

```yaml
---
name: internal-helper
description: 内部辅助工具
showInTool: false
registerCommand: true
---
```

- ❌ 不在 `subagent` 工具描述中显示
- ✅ 仍然可以通过 `/sub:internal-helper` 命令调用

**用途**: 适用于内部工具、调试工具或高级用户工具。

### 场景 3: 完全隐藏

```yaml
---
name: secret-agent
description: 秘密代理
showInTool: false
registerCommand: false
---
```

- ❌ 不在 `subagent` 工具描述中显示
- ❌ 不注册 `/sub:secret-agent` 命令
- ✅ 只能通过直接调用 `subagent` 工具使用

**用途**: 适用于仅供程序内部调用的代理。

## 完整示例

### 示例 1: 标准子代理
```yaml
---
name: worker
description: 具有完整能力的通用子代理
tools: read, bash, write, edit
showInTool: true
registerCommand: true
---

你是一名具有完整能力的 worker 代理...
```

### 示例 2: 隐藏的调试工具
```yaml
---
name: debug-helper
description: 调试辅助工具，仅在需要时调用
showInTool: false
registerCommand: true
---

你是一个调试辅助工具...
```

### 示例 3: 完全隐藏的内部代理
```yaml
---
name: internal-processor
description: 内部数据处理代理
showInTool: false
registerCommand: false
tools: read, write
---

你是一个内部数据处理代理...
```

## 工具描述格式

`subagent` 工具的描述会自动包含所有 `showInTool: true` 的子代理：

```
Delegate tasks to specialized subagents with isolated context.

Available Agents:
  - scout: 快速代码侦察，返回压缩的上下文
  - worker: 具有完整能力的通用子代理
  - reviewer: 代码审查代理

Modes:
  - Single: {agent, task} - one subagent
  ...
```

## 注意事项

1. **默认行为**: 如果不指定这两个字段，默认都是 `true`
2. **布尔值解析**: 支持 `true`/`false` 和 `yes`/`no`
3. **项目代理**: 项目级代理（`.pi/agents/`）也支持这些字段
4. **动态生成**: 动态生成的代理默认不设置这些字段（即默认显示和注册）