# TODO 强制完成系统 (TODO Enforcement System)

## 概述

TODO 强制完成系统监控代理输出中的 TODO 项，确保所有任务都完成后才结束，防止代理半途而废。

这借鉴了 Oh-My-OpenCode 的 Todo Continuation Enforcer：强制代理完成所有 TODO，像西西弗斯推石头一样持续工作直到完成。

## 核心理念

### 问题：代理半途而废

```
代理输出：
- [x] 读取文件
- [x] 创建服务
- [ ] 添加验证
- [ ] 编写测试

"我已完成任务！" ← 实际上还有 2 个 TODO 未完成
```

### 解决方案：强制完成

```
系统检测到未完成的 TODO

⚠️ TODO 强制完成提醒

你有 2 个未完成的 TODO！

未完成的 TODO：
1. [ ] 添加验证
2. [ ] 编写测试

继续完成剩余的 TODO！

代理继续工作...

- [x] 添加验证
- [x] 编写测试

✅ 所有 TODO 已完成，任务结束
```

## TODO 格式

### 标准 Markdown 格式

```markdown
- [ ] 未完成的 TODO
- [x] 已完成的 TODO
- [X] 已完成的 TODO（大写 X 也支持）
```

### 示例

```markdown
## 任务列表

- [ ] 读取用户模型文件
- [ ] 创建用户服务
- [ ] 添加验证逻辑
- [ ] 编写测试

执行中...

- [x] 读取用户模型文件
- [x] 创建用户服务
- [ ] 添加验证逻辑 ← 继续完成
- [ ] 编写测试 ← 继续完成

最终状态：

- [x] 读取用户模型文件
- [x] 创建用户服务
- [x] 添加验证逻辑
- [x] 编写测试 ← 全部完成
```

## 功能特性

### 1. TODO 提取

自动从代理输出中提取所有 TODO 项：

```typescript
const todos = extractTodos(content);
// [
//   { text: "Read file", completed: false },
//   { text: "Create service", completed: true },
//   { text: "Add validation", completed: false }
// ]
```

### 2. 完成率计算

计算 TODO 完成率：

```typescript
const rate = getTodoCompletionRate(content);
// 0.5 (50%)
```

### 3. 进度条生成

生成可视化进度条：

```typescript
const progressBar = generateTodoProgressBar(content);
// [██████████░░░░░░░░░░] 50.0%
```

### 4. 提醒生成

为未完成的 TODO 生成提醒：

```typescript
const reminder = generateTodoReminder(content);
// "⚠️ TODO 强制完成提醒\n你有 2 个未完成的 TODO！..."
```

### 5. 完成验证

验证所有 TODO 是否完成：

```typescript
const validation = validateTodoCompletion(content);
// {
//   valid: false,
//   message: "❌ 还有 2 个未完成的 TODO",
//   incompleteTodos: [...]
// }
```

## 使用方法

### 1. 在代理提示中添加 TODO 规则

已更新 `worker.md` 代理提示，包含：

```markdown
## 🚨 TODO 强制完成规则

**系统会监控你的 TODO 列表，未完成前不允许结束任务！**

### TODO 格式
- [ ] 未完成的 TODO
- [x] 已完成的 TODO

### 工作流程
1. 接收任务
2. 创建 TODO 列表
3. 逐个完成 TODO
4. 标记完成
5. 验证完成
6. 返回结果

### ⚠️ 重要提醒
- 不要在未完成所有 TODO 时返回结果
- 不要跳过任何 TODO
- 不要删除 TODO 来假装完成
```

### 2. 监控代理输出

```typescript
import { validateTodoCompletion, generateTodoReminder } from "./utils/todo.ts";

// 检查代理输出
const validation = validateTodoCompletion(agentOutput);

if (!validation.valid) {
	// 生成提醒
	const reminder = generateTodoReminder(agentOutput);
	
	// 发送提醒给代理
	console.log(reminder);
	
	// 要求代理继续工作
	// ...
}
```

### 3. 显示 TODO 统计

```typescript
import { formatTodoStats } from "./utils/todo.ts";

const stats = formatTodoStats(agentOutput);
console.log(stats);

// 输出：
// ## TODO 统计
// - **总数**: 4
// - **已完成**: 2
// - **未完成**: 2
// - **完成率**: 50.0%
```

## 工作流程

### 完整流程

```
1. 代理接收任务
    ↓
2. 代理创建 TODO 列表
    ↓
3. 代理开始执行
    ↓
4. 系统监控 TODO 状态
    ↓
5. 检测到未完成的 TODO
    ↓
6. 生成提醒消息
    ↓
7. 代理继续工作
    ↓
8. 重复 4-7 直到所有 TODO 完成
    ↓
9. 验证通过，任务结束
```

### 提醒机制

```
代理输出包含未完成的 TODO
    ↓
extractTodos()
    ↓
getIncompleteTodos()
    ↓
generateTodoReminder()
    ↓
发送提醒给代理
    ↓
代理继续工作
```

## 示例场景

### 场景 1：实现功能

```markdown
## 任务：实现用户注册功能

### TODO 列表
- [ ] 创建用户模型
- [ ] 实现注册逻辑
- [ ] 添加验证
- [ ] 编写测试

执行中...

- [x] 创建用户模型
- [x] 实现注册逻辑
- [ ] 添加验证
- [ ] 编写测试

⚠️ 系统提醒：还有 2 个未完成的 TODO

继续执行...

- [x] 创建用户模型
- [x] 实现注册逻辑
- [x] 添加验证
- [x] 编写测试

✅ 所有 TODO 已完成
```

### 场景 2：代码重构

```markdown
## 任务：重构认证模块

### TODO 列表
- [ ] 分析现有代码
- [ ] 设计新架构
- [ ] 实现新代码
- [ ] 迁移测试
- [ ] 更新文档

执行中...

- [x] 分析现有代码
- [x] 设计新架构
- [x] 实现新代码
- [ ] 迁移测试
- [ ] 更新文档

⚠️ 系统提醒：还有 2 个未完成的 TODO

继续执行...

- [x] 迁移测试
- [x] 更新文档

✅ 所有 TODO 已完成
```

## API 参考

### extractTodos(content: string): TodoItem[]

提取所有 TODO 项。

```typescript
const todos = extractTodos(content);
```

### hasIncompleteTodos(content: string): boolean

检查是否有未完成的 TODO。

```typescript
if (hasIncompleteTodos(content)) {
	console.log("还有未完成的 TODO");
}
```

### getIncompleteTodoCount(content: string): number

获取未完成的 TODO 数量。

```typescript
const count = getIncompleteTodoCount(content);
console.log(`未完成: ${count}`);
```

### getTodoCompletionRate(content: string): number

计算 TODO 完成率（0.0 - 1.0）。

```typescript
const rate = getTodoCompletionRate(content);
console.log(`完成率: ${(rate * 100).toFixed(1)}%`);
```

### generateTodoReminder(content: string): string | null

生成 TODO 提醒消息。如果所有 TODO 已完成，返回 null。

```typescript
const reminder = generateTodoReminder(content);
if (reminder) {
	console.log(reminder);
}
```

### formatTodoStats(content: string): string

格式化 TODO 统计信息。

```typescript
const stats = formatTodoStats(content);
console.log(stats);
```

### validateTodoCompletion(content: string): ValidationResult

验证 TODO 完成情况。

```typescript
const validation = validateTodoCompletion(content);
if (!validation.valid) {
	console.log(validation.message);
	console.log(`未完成: ${validation.incompleteTodos.length}`);
}
```

### generateTodoProgressBar(content: string, width?: number): string

生成进度条（默认宽度 20）。

```typescript
const progressBar = generateTodoProgressBar(content);
console.log(progressBar);
// [██████████░░░░░░░░░░] 50.0%
```

## 最佳实践

### 1. 创建清晰的 TODO

```markdown
✅ 好：具体明确
- [ ] 创建 User 模型（包含 name, email, password 字段）
- [ ] 实现 register() 方法（验证邮箱格式）
- [ ] 编写单元测试（覆盖率 >80%）

❌ 坏：模糊不清
- [ ] 做一些事情
- [ ] 修复问题
- [ ] 完成功能
```

### 2. 合理拆分 TODO

```markdown
✅ 好：适度拆分
- [ ] 读取配置文件
- [ ] 解析配置
- [ ] 验证配置
- [ ] 应用配置

❌ 坏：过度拆分
- [ ] 打开文件
- [ ] 读取第一行
- [ ] 读取第二行
- [ ] 关闭文件
```

### 3. 及时标记完成

```markdown
✅ 好：完成后立即标记
- [x] 创建模型
- [x] 实现逻辑
- [ ] 编写测试 ← 当前正在做

❌ 坏：最后一次性标记
- [ ] 创建模型 ← 实际已完成
- [ ] 实现逻辑 ← 实际已完成
- [ ] 编写测试 ← 当前正在做
```

### 4. 不要删除 TODO

```markdown
✅ 好：标记为完成
- [x] 创建模型
- [x] 实现逻辑
- [x] 编写测试

❌ 坏：删除 TODO
（没有 TODO 列表）
```

## 优势

### 1. 防止半途而废

强制代理完成所有任务，不允许提前结束。

### 2. 提高完成率

通过持续提醒，确保代理完成所有步骤。

### 3. 可视化进度

进度条和统计信息让进度一目了然。

### 4. 自动监控

无需人工检查，系统自动监控 TODO 状态。

## 故障排除

### TODO 未被识别

**原因**：格式不正确。

**解决方案**：
1. 确保使用 `- [ ]` 或 `- [x]` 格式
2. 方括号前后有空格
3. 使用 Markdown 列表格式

### 提醒未生成

**原因**：所有 TODO 已完成或没有 TODO。

**解决方案**：
1. 检查是否所有 TODO 都标记为 `[x]`
2. 确认内容中包含 TODO 项

### 完成率不正确

**原因**：TODO 格式混乱。

**解决方案**：
1. 统一使用小写 `[x]` 或大写 `[X]`
2. 确保每个 TODO 独占一行
3. 避免嵌套 TODO

## 相关文档

- [Subagent Extension README](./README.md) - 子代理扩展主文档
- [Oh-My-OpenCode Orchestration](https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/understanding-orchestration-system.md) - 编排系统设计理念

## 版本历史

### v1.0.0 (2026-01-27)
- 初始实现
- TODO 提取和监控
- 完成率计算
- 进度条生成
- 提醒生成
- 完成验证
- Worker 代理提示更新
