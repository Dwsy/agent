# 智慧积累系统 (Wisdom Accumulation System)

## 概述

智慧积累系统自动从子代理执行中提取学习、模式、约定和经验，并在后续任务中自动注入这些智慧，实现累积学习。

这借鉴了 Oh-My-OpenCode 的 Wisdom Accumulation 设计理念：每次任务执行后提取学习，传递给后续任务，避免重复错误，保持一致性。

## 核心理念

### 问题：代理没有记忆

```
任务 1: 实现功能 A
  → 学到：使用 TypeScript strict mode

任务 2: 实现功能 B
  → 忘记了任务 1 的学习
  → 没有使用 strict mode
```

### 解决方案：累积智慧

```
任务 1: 实现功能 A
  → 学到：使用 TypeScript strict mode
  → 记录到 learnings.md

任务 2: 实现功能 B
  → 自动注入任务 1 的智慧
  → 遵循 strict mode 约定
  → 学到新的经验
  → 追加到 learnings.md

任务 3: 实现功能 C
  → 自动注入任务 1 和 2 的智慧
  → 保持一致性
```

## 智慧类型

### 1. Convention（约定）📋
项目中的编码约定、模式、风格

**示例**：
```
Convention: Always use TypeScript strict mode for better type safety
Convention: Use camelCase for variable names, PascalCase for classes
```

### 2. Success（成功）✅
成功的方法、有效的解决方案

**示例**：
```
Success: ✅ Using async/await makes code more readable than callbacks
Success: ✅ Implementing retry logic with exponential backoff improved reliability
```

### 3. Failure（失败）❌
失败的尝试、应避免的做法

**示例**：
```
Failure: ❌ Don't use any type, it defeats the purpose of TypeScript
Failure: ❌ Synchronous file operations block the event loop
```

### 4. Gotcha（陷阱）⚠️
容易出错的地方、需要注意的细节

**示例**：
```
Gotcha: ⚠️ Remember to handle promise rejections to avoid unhandled errors
Gotcha: ⚠️ Array.sort() mutates the original array
```

### 5. Command（命令）💻
有用的命令、脚本、工具使用

**示例**：
```
Command: `npm run test -- --coverage` to generate coverage reports
Command: `git log --oneline --graph` to visualize commit history
```

### 6. Decision（决策）🎯
架构决策和理由

**示例**：
```
Decision: We decided to use Bun instead of Node.js for better performance
Decision: Chose PostgreSQL over MongoDB for ACID compliance requirements
```

## 工作流程

### 1. 自动提取

子代理执行完成后，系统自动扫描输出，提取包含特定标记的智慧：

```typescript
// 代理输出
"Convention: Always use TypeScript strict mode
Success: ✅ Using async/await improves readability
Gotcha: ⚠️ Remember to handle promise rejections"

// 自动提取为
[
  { type: "convention", content: "Always use TypeScript strict mode" },
  { type: "success", content: "Using async/await improves readability" },
  { type: "gotcha", content: "Remember to handle promise rejections" }
]
```

### 2. 自动追加

提取的智慧自动追加到 `~/.pi/agent/notepads/learnings.md`：

```markdown
## 📋 Convention (patterns)
**Date**: 2026-01-27
**Agent**: worker
**Task**: Implement user authentication

Always use TypeScript strict mode for better type safety

---
```

### 3. 自动注入

后续任务自动加载累积的智慧并注入到提示中：

```javascript
// 原始任务
subagent({
  agent: "worker",
  task: "Implement user registration"
})

// 自动增强为
subagent({
  agent: "worker",
  task: `Implement user registration

## 累积智慧 (Accumulated Wisdom)

以下是从之前的任务中提取的学习、模式和经验。请遵循这些约定和最佳实践：

## 📋 Convention (patterns)
Always use TypeScript strict mode for better type safety

## ✅ Success (solutions)
Using async/await makes code more readable than callbacks

...
`
})
```

## 使用方法

### 1. 在代理输出中标记智慧

代理在输出中使用特定标记：

```markdown
我已完成任务。以下是一些学习：

Convention: 项目使用 ESLint + Prettier 进行代码格式化
Success: ✅ 使用 Zod 进行运行时类型验证非常有效
Failure: ❌ 不要在循环中使用 await，会导致性能问题
Gotcha: ⚠️ 记得在 async 函数中捕获错误
Command: `bun test --watch` 用于开发时持续测试
Decision: 决定使用 Bun 而非 Node.js 以获得更好的性能
```

### 2. 查看累积的智慧

```bash
# 查看智慧统计
/wisdom

# 直接查看文件
bat ~/.pi/agent/notepads/learnings.md
```

### 3. 禁用智慧注入（可选）

```javascript
// 默认启用智慧注入
subagent({ agent: "worker", task: "..." })

// 禁用智慧注入
subagent({ agent: "worker", task: "...", injectWisdom: false })
```

## 文件结构

```
~/.pi/agent/notepads/
├── learnings.md      # 累积智慧（主文件）
├── decisions.md      # 架构决策记录
├── issues.md         # 问题与阻塞
├── verification.md   # 验证结果
└── problems.md       # 未解决问题
```

### learnings.md 格式

```markdown
# 累积智慧 (Accumulated Wisdom)

## 使用说明
...

## 智慧记录

## 📋 Convention (patterns)
**Date**: 2026-01-27
**Agent**: worker
**Task**: Implement user authentication

Always use TypeScript strict mode for better type safety

---

## ✅ Success (solutions)
**Date**: 2026-01-27
**Agent**: worker
**Task**: Implement user authentication

Using async/await makes code more readable than callbacks

---
```

## 命令参考

### `/wisdom`

查看累积的智慧统计和最近的智慧条目。

```bash
/wisdom
```

输出：

```markdown
## Accumulated Wisdom

**Total Notes**: 12
**Last Update**: 2026-01-27 15:09:41

### By Type

- 📋 **convention**: 2
- ✅ **success**: 2
- ❌ **failure**: 2
- ⚠️ **gotcha**: 2
- 💻 **command**: 2
- 🎯 **decision**: 2

### Recent Wisdom
...

### Full Wisdom
View full wisdom at: `~/.pi/agent/notepads/learnings.md`
```

## 最佳实践

### 1. 在代理提示中鼓励标记智慧

在代理的系统提示中添加：

```markdown
## 智慧标记

在完成任务后，请标记你学到的经验：

- `Convention:` - 项目约定和模式
- `Success: ✅` - 成功的方法
- `Failure: ❌` - 失败的尝试
- `Gotcha: ⚠️` - 需要注意的陷阱
- `Command:` - 有用的命令
- `Decision:` - 架构决策

这些智慧会自动提取并在后续任务中使用。
```

### 2. 定期审查智慧

```bash
# 查看智慧统计
/wisdom

# 审查完整智慧
bat ~/.pi/agent/notepads/learnings.md
```

### 3. 清理过时的智慧

手动编辑 `learnings.md`，删除过时或不再相关的智慧条目。

### 4. 项目特定智慧

为不同项目维护独立的智慧文件（未来支持）：

```
project-a/.pi/notepads/learnings.md
project-b/.pi/notepads/learnings.md
```

## 优势

### 1. 累积学习

```
任务 1 → 学习 A
任务 2 → 学习 A + 学习 B
任务 3 → 学习 A + 学习 B + 学习 C
```

### 2. 保持一致性

所有代理遵循相同的约定和模式，代码风格一致。

### 3. 避免重复错误

失败的尝试被记录，后续任务自动避免。

### 4. 知识传递

新代理自动获得之前任务的经验，无需重新学习。

## 技术实现

### 提取流程

```
子代理输出
    ↓
extractWisdom()
    ↓
解析标记（Convention:, Success:, 等）
    ↓
创建 WisdomNote 对象
    ↓
appendWisdom()
    ↓
追加到 learnings.md
```

### 注入流程

```
新任务
    ↓
loadWisdom()
    ↓
读取 learnings.md
    ↓
formatWisdomForPrompt()
    ↓
格式化为提示
    ↓
增强任务提示
    ↓
执行子代理
```

## 示例场景

### 场景 1：保持编码约定

```javascript
// 任务 1
subagent({
  agent: "worker",
  task: "实现用户认证"
})
// 输出: Convention: 使用 bcrypt 进行密码哈希

// 任务 2（自动注入智慧）
subagent({
  agent: "worker",
  task: "实现用户注册"
})
// 自动遵循 bcrypt 约定
```

### 场景 2：避免重复错误

```javascript
// 任务 1
subagent({
  agent: "worker",
  task: "实现文件上传"
})
// 输出: Failure: ❌ 不要在内存中缓存大文件，会导致 OOM

// 任务 2（自动注入智慧）
subagent({
  agent: "worker",
  task: "实现图片上传"
})
// 自动避免内存缓存，使用流式处理
```

### 场景 3：传递有用命令

```javascript
// 任务 1
subagent({
  agent: "worker",
  task: "设置测试环境"
})
// 输出: Command: `bun test --watch` 用于开发时持续测试

// 任务 2（自动注入智慧）
subagent({
  agent: "worker",
  task: "编写单元测试"
})
// 自动知道使用 `bun test --watch`
```

## 故障排除

### 智慧未提取

**原因**：代理输出中没有使用正确的标记格式。

**解决方案**：
1. 确保使用 `Convention:`、`Success:`、`Failure:` 等标记
2. 标记后跟冒号和空格
3. 中文标记也支持：`约定:`、`成功:`、`失败:` 等

### 智慧未注入

**原因**：智慧注入被禁用或智慧文件为空。

**解决方案**：
1. 检查是否设置了 `injectWisdom: false`
2. 确认 `~/.pi/agent/notepads/learnings.md` 存在且有内容
3. 运行 `/wisdom` 查看智慧统计

### 智慧过多导致提示过长

**原因**：累积的智慧超过了上下文窗口限制。

**解决方案**：
1. 智慧自动截断到最近的 2000 字符
2. 手动清理过时的智慧条目
3. 调整 `formatWisdomForPrompt()` 的 `maxLength` 参数

## 相关文档

- [Subagent Extension README](./README.md) - 子代理扩展主文档
- [Oh-My-OpenCode Orchestration](https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/understanding-orchestration-system.md) - 编排系统设计理念

## 版本历史

### v1.0.0 (2026-01-27)
- 初始实现
- 6 种智慧类型
- 自动提取和注入
- `/wisdom` 命令
- Notepad 文件系统
