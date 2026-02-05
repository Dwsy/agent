# 类别委托系统 (Category Delegation System)

## 概述

类别委托系统允许你按**语义类别**而非具体代理名称来委托任务，系统会自动路由到最合适的代理。

这借鉴了 Oh-My-OpenCode 的设计理念：使用语义类别（如 "architecture"、"security"）而非模型名称（如 "gpt-5.2"、"claude-opus"），避免分布偏差，让代理专注于任务本身。

## 为什么需要类别委托？

### 问题：模型名称创建分布偏差

```typescript
// ❌ 旧方式：模型知道自己的局限性
delegate_task(agent="gpt-5.2", prompt="...")  // 模型自我感知
delegate_task(agent="claude-opus-4.5", prompt="...")  // 不同的自我认知
```

### 解决方案：语义类别描述意图

```typescript
// ✅ 新方式：类别描述意图，而非实现
delegate_task(category="ultrabrain", prompt="...")     // "战略性思考"
delegate_task(category="visual-engineering", prompt="...")  // "设计美观"
delegate_task(category="quick", prompt="...")          // "快速完成"
```

## 配置文件

### 位置

`~/.pi/agent/categories.json`

### 结构

```json
{
  "$schema": "./categories.schema.json",
  "version": "1.0.0",
  "defaultModel": "proxypal/glm-4.7",
  "description": "类别委托配置 - 按语义类别自动路由到最合适的代理",
  "categories": {
    "architecture": {
      "agent": "oracle",
      "model": "proxypal/glm-4.7",
      "description": "架构决策、设计模式、技术选型、系统设计"
    },
    "security": {
      "agent": "security-reviewer",
      "model": "proxypal/glm-4.7",
      "description": "安全审查、漏洞检测、风险评估、代码安全"
    }
  }
}
```

## 内置类别

| 类别 | 代理 | 用途 |
|------|------|------|
| `architecture` | oracle | 架构决策、设计模式、技术选型 |
| `documentation` | librarian | 文档查阅、开源实现、代码库理解 |
| `exploration` | scout | 代码检索、文件定位、模式识别 |
| `planning` | planner | 任务规划、方案设计、风险评估 |
| `implementation` | worker | 代码实现、功能开发、Bug 修复 |
| `security` | security-reviewer | 安全审查、漏洞检测、风险评估 |
| `review` | reviewer | 代码审查、质量评估、改进建议 |
| `visual` | vision | 图像分析、视频处理、OCR 提取 |
| `frontend` | worker | 前端开发、UI/UX、样式设计 |
| `backend` | worker | 后端开发、API 设计、数据库操作 |
| `testing` | worker | 测试编写、测试策略、测试覆盖 |
| `refactoring` | worker | 代码重构、结构优化、性能改进 |

## 使用方法

### 1. 工具调用

```javascript
// 使用类别参数
subagent({
  category: "architecture",
  task: "审查此模块的架构设计，提出改进建议"
})

// 等价于
subagent({
  agent: "oracle",
  task: "审查此模块的架构设计，提出改进建议"
})
```

### 2. 命令行

```bash
# 列出所有类别
/categories

# 使用类别委托（通过工具调用）
subagent({ category: "security", task: "审查代码安全漏洞" })
```

### 3. 示例场景

#### 架构审查

```javascript
subagent({
  category: "architecture",
  task: "审查用户认证模块的架构设计，评估安全性和可扩展性"
})
```

#### 安全审计

```javascript
subagent({
  category: "security",
  task: "审查最近的代码变更，查找潜在的安全漏洞"
})
```

#### 代码探索

```javascript
subagent({
  category: "exploration",
  task: "查找所有与数据库连接相关的代码"
})
```

#### 任务规划

```javascript
subagent({
  category: "planning",
  task: "规划实现用户头像上传功能的详细方案"
})
```

## 自定义类别

### 添加新类别

编辑 `~/.pi/agent/categories.json`：

```json
{
  "categories": {
    "database": {
      "agent": "worker",
      "model": "proxypal/glm-4.7",
      "description": "数据库设计、SQL 优化、数据迁移"
    },
    "performance": {
      "agent": "oracle",
      "model": "proxypal/glm-4.7",
      "description": "性能分析、优化建议、瓶颈诊断"
    }
  }
}
```

### 修改现有类别

```json
{
  "categories": {
    "architecture": {
      "agent": "oracle",
      "model": "proxypal/deepseek-v3",  // 更换模型
      "temperature": 0.3,                // 添加参数
      "description": "架构决策、设计模式、技术选型"
    }
  }
}
```

## 优势

### 1. 语义清晰

```javascript
// ❌ 不清晰：需要知道哪个代理做什么
subagent({ agent: "oracle", task: "..." })

// ✅ 清晰：类别直接表达意图
subagent({ category: "architecture", task: "..." })
```

### 2. 易于维护

```json
// 只需修改配置文件，无需改代码
{
  "categories": {
    "architecture": {
      "agent": "new-architecture-agent"  // 切换代理
    }
  }
}
```

### 3. 避免偏差

类别名称不暴露底层模型，代理专注于任务本身，而非自我认知。

### 4. 灵活路由

可以根据任务类型自动选择最合适的代理，而无需记住每个代理的名称和用途。

## 命令参考

### `/categories`

列出所有可用的任务类别。

```bash
/categories
```

输出：

```markdown
## Available Task Categories

Categories provide semantic routing to the best agent for each task type.

### architecture
- **Agent**: oracle
- **Description**: 架构决策、设计模式、技术选型、系统设计

### security
- **Agent**: security-reviewer
- **Description**: 安全审查、漏洞检测、风险评估、代码安全

...
```

## 最佳实践

### 1. 优先使用类别

```javascript
// ✅ 推荐：使用类别
subagent({ category: "security", task: "审查代码" })

// ⚠️ 可以但不推荐：直接指定代理
subagent({ agent: "security-reviewer", task: "审查代码" })
```

### 2. 类别覆盖代理

如果同时提供 `category` 和 `agent`，`category` 优先：

```javascript
subagent({
  category: "architecture",  // 优先使用
  agent: "worker",           // 被忽略
  task: "审查架构"
})
// 实际使用 oracle 代理
```

### 3. 为项目定制类别

在项目根目录创建 `.pi/categories.json`（未来支持）：

```json
{
  "categories": {
    "unity-game-dev": {
      "agent": "worker",
      "model": "proxypal/glm-4.7",
      "description": "Unity 游戏开发、C# 脚本、场景设计"
    }
  }
}
```

## 故障排除

### 类别未找到

```
Unknown category: invalid. Use /categories to list available categories.
```

**解决方案**：
1. 运行 `/categories` 查看可用类别
2. 检查 `~/.pi/agent/categories.json` 是否存在
3. 确认类别名称拼写正确

### 代理未找到

如果类别配置的代理不存在，会触发动态代理生成。

**解决方案**：
1. 确认代理存在：`/sub`
2. 检查 `categories.json` 中的 `agent` 字段
3. 创建缺失的代理：`/create-agent <name> <description>`

## 相关文档

- [Subagent Extension README](./README.md) - 子代理扩展主文档
- [Oh-My-OpenCode Orchestration](https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/understanding-orchestration-system.md) - 编排系统设计理念

## 版本历史

### v1.0.0 (2026-01-27)
- 初始实现
- 12 个内置类别
- `/categories` 命令
- 类别解析和路由
