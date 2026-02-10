# 智慧积累系统 (Wisdom Accumulation System) - 三层架构

## 概述

智慧积累系统自动从子代理执行中提取学习、模式、约定和经验，并在后续任务中自动注入这些智慧，实现累积学习。

**重要更新**：系统现在支持三层架构，实现会话、项目和全局智慧的隔离和优先级管理。

这借鉴了 Oh-My-OpenCode 的 Wisdom Accumulation 设计理念：每次任务执行后提取学习，传递给后续任务，避免重复错误，保持一致性。

## 🏗️ 三层架构

### 层次结构

```
会话智慧 (Session) - 内存中
├── 当前会话的临时学习
├── 会话结束后可选保存到项目或全局
└── 优先级：最高

项目智慧 (Project) - .pi/notepads/
├── 项目特定的约定和决策
├── 项目架构和模式
└── 优先级：中等

全局智慧 (Global) - ~/.pi/agent/notepads/
├── 通用编程约定
├── 通用工具使用
└── 优先级：最低
```

### 优先级规则

```
会话智慧 > 项目智慧 > 全局智慧
```

当不同层次的智慧冲突时，优先级高的覆盖优先级低的。

## 核心理念

### 问题：全局智慧混乱

```
❌ 旧设计（全局混合）：
~/.pi/agent/notepads/learnings.md
├── 项目 A：使用 Vue 3
├── 项目 B：使用 React
├── 项目 C：使用 Svelte
└── 冲突！智慧混乱！
```

### 解决方案：三层隔离

```
✅ 新设计（三层隔离）：

全局智慧 (~/.pi/agent/notepads/)
├── Convention: 使用 TypeScript strict mode
└── Command: 使用 bat 读取文件

项目 A 智慧 (projectA/.pi/notepads/)
├── Convention: 使用 Vue 3 Composition API
└── Decision: 使用 Pinia 状态管理

项目 B 智慧 (projectB/.pi/notepads/)
├── Convention: 使用 React Hooks
└── Decision: 使用 Redux 状态管理

会话智慧 (内存)
├── 当前任务：实现登录功能
└── 临时学习：使用 JWT 认证

→ 项目 A 加载：全局 + 项目 A + 会话
→ 项目 B 加载：全局 + 项目 B + 会话
→ 互不干扰！
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

### 完整流程

```
1. 子代理执行任务
    ↓
2. 系统扫描输出，提取智慧
    ↓
3. 智慧默认保存到会话（内存）
    ↓
4. 下一个任务自动加载智慧
   （会话 + 项目 + 全局）
    ↓
5. 智慧注入到任务提示
    ↓
6. 子代理遵循智慧执行
    ↓
7. 提取新的智慧
    ↓
8. 会话结束时提示保存
   （保存到项目或全局）
```

### 智慧加载流程

```
loadAllWisdom(cwd)
    ↓
loadGlobalWisdom()
    ↓
loadProjectWisdom(cwd)
    ↓
loadSessionWisdom()
    ↓
合并（会话 > 项目 > 全局）
    ↓
formatWisdomForPrompt()
    ↓
注入到任务提示
```

## 使用方法

### 1. 初始化项目智慧

```typescript
import { initProjectWisdom } from "./utils/wisdom.ts";

// 在项目根目录初始化
initProjectWisdom(process.cwd());

// 创建 .pi/notepads/ 目录和文件
```

### 2. 在代理输出中标记智慧

```markdown
## Task Complete

Convention: Use TypeScript strict mode
Success: ✅ Implemented async/await pattern
Failure: ❌ Don't use any type
Gotcha: ⚠️ Remember to handle Promise rejection
Command: `npm run test`
Decision: Use Bun instead of Node.js
```

### 3. 自动提取和保存

```typescript
import { extractWisdom, appendWisdom } from "./utils/wisdom.ts";

// 提取智慧（默认会话作用域）
const notes = extractWisdom(result, "session");

// 保存到会话（内存）
appendWisdom(notes, cwd);

// 或指定作用域
const projectNotes = extractWisdom(result, "project");
appendWisdom(projectNotes, cwd);

const globalNotes = extractWisdom(result, "global");
appendWisdom(globalNotes);
```

### 4. 加载智慧

```typescript
import { loadAllWisdom, formatWisdomForPrompt } from "./utils/wisdom.ts";

// 加载所有智慧（三层合并）
const wisdom = loadAllWisdom(cwd);

// 格式化用于提示
const formatted = formatWisdomForPrompt(wisdom);

// 注入到任务
const enhancedTask = `${task}\n\n${formatted}`;
```

### 5. 会话结束时保存

```typescript
import { getSessionWisdomNotes, saveSessionWisdomTo } from "./utils/wisdom.ts";

// 获取会话智慧
const sessionNotes = getSessionWisdomNotes();

if (sessionNotes.length > 0) {
	// 提示用户选择保存位置
	console.log(`你在本次会话中学到了 ${sessionNotes.length} 条智慧`);
	console.log("保存到：");
	console.log("1. 项目级别（仅此项目）");
	console.log("2. 全局级别（所有项目）");
	console.log("3. 不保存（丢弃）");
	
	// 根据用户选择保存
	saveSessionWisdomTo("project", cwd);  // 或 "global"
}
```

### 6. 查看智慧统计

```typescript
import { getWisdomStats } from "./utils/wisdom.ts";

const stats = getWisdomStats(cwd);

console.log("会话智慧:", stats.session.totalNotes);
console.log("项目智慧:", stats.project.totalNotes);
console.log("全局智慧:", stats.global.totalNotes);
```

## 目录结构

### 全局智慧

```
~/.pi/agent/notepads/
├── learnings.md       # 累积的智慧
├── decisions.md       # 架构决策
├── issues.md          # 问题和阻塞
├── verification.md    # 验证结果
└── problems.md        # 未解决问题
```

### 项目智慧

```
<project-root>/.pi/notepads/
├── learnings.md       # 项目特定智慧
├── decisions.md       # 项目架构决策
├── issues.md          # 项目问题
├── verification.md    # 项目验证
└── problems.md        # 项目未解决问题
```

### 会话智慧

```
内存中（WisdomNote[]）
├── 当前会话的临时智慧
└── 会话结束后可选保存
```

## 示例场景

### 场景 1：多项目隔离

```
项目 A：Vue 3 项目
├── 全局智慧：使用 TypeScript
├── 项目智慧：使用 Vue 3 Composition API
└── 会话智慧：实现用户登录

项目 B：React 项目
├── 全局智慧：使用 TypeScript
├── 项目智慧：使用 React Hooks
└── 会话智慧：实现数据可视化

→ 项目 A 和 B 的智慧互不干扰
→ 全局智慧在两个项目中共享
```

### 场景 2：智慧优先级

```
全局智慧: "使用 ESLint"
项目智慧: "使用 Biome（覆盖 ESLint）"
会话智慧: "当前任务禁用 linter（临时覆盖）"

→ 最终生效：禁用 linter（会话优先级最高）
```

### 场景 3：会话智慧保存

```
会话中学到：
1. Convention: 使用 Zod 验证
2. Success: ✅ 使用 tRPC 简化 API
3. Gotcha: ⚠️ 注意 Zod 的性能开销

会话结束时：
→ 选择保存到项目（项目特定）
→ 或保存到全局（通用知识）
→ 或不保存（临时学习）
```

## API 参考

### initProjectWisdom(cwd: string): void

初始化项目智慧目录。

```typescript
initProjectWisdom(process.cwd());
```

### extractWisdom(result: SingleResult, scope?: WisdomScope): WisdomNote[]

从子代理输出中提取智慧。

```typescript
const notes = extractWisdom(result, "session");
```

### loadGlobalWisdom(): string

加载全局智慧。

```typescript
const global = loadGlobalWisdom();
```

### loadProjectWisdom(cwd: string): string

加载项目智慧。

```typescript
const project = loadProjectWisdom(process.cwd());
```

### loadSessionWisdom(): string

加载会话智慧。

```typescript
const session = loadSessionWisdom();
```

### loadAllWisdom(cwd?: string): string

加载所有智慧（三层合并）。

```typescript
const all = loadAllWisdom(process.cwd());
```

### appendWisdom(notes: WisdomNote[], cwd?: string): void

追加智慧（根据作用域）。

```typescript
appendWisdom(notes, process.cwd());
```

### formatWisdomForPrompt(wisdom: string, maxLength?: number): string

格式化智慧用于注入到提示。

```typescript
const formatted = formatWisdomForPrompt(wisdom, 2000);
```

### getWisdomStats(cwd?: string): WisdomStats

获取智慧统计。

```typescript
const stats = getWisdomStats(process.cwd());
```

### clearSessionWisdom(): void

清除会话智慧。

```typescript
clearSessionWisdom();
```

### getSessionWisdomNotes(): WisdomNote[]

获取会话智慧笔记。

```typescript
const notes = getSessionWisdomNotes();
```

### saveSessionWisdomTo(scope: "project" | "global", cwd?: string): void

将会话智慧保存到项目或全局。

```typescript
saveSessionWisdomTo("project", process.cwd());
```

## 最佳实践

### 1. 选择合适的作用域

```
✅ 全局智慧：通用编程约定
- Convention: 使用 TypeScript strict mode
- Command: 使用 bat 读取文件

✅ 项目智慧：项目特定约定
- Convention: 使用 Vue 3 Composition API
- Decision: 使用 Pinia 状态管理

✅ 会话智慧：临时学习
- 当前任务的特定发现
- 实验性的尝试
```

### 2. 及时标记智慧

```markdown
✅ 好：在任务完成时标记
## Task Complete

Convention: Use Zod for validation
Success: ✅ Implemented type-safe API

❌ 坏：事后回忆
（容易遗漏重要学习）
```

### 3. 清晰描述智慧

```markdown
✅ 好：具体明确
Convention: Use camelCase for variable names, PascalCase for class names
Success: ✅ Using async/await with try-catch improves error handling

❌ 坏：模糊不清
Convention: Use good naming
Success: ✅ It works
```

### 4. 定期清理智慧

```
- 删除过时的智慧
- 合并重复的智慧
- 更新不准确的智慧
```

## 优势

### 1. 项目隔离

不同项目的智慧互不干扰，避免冲突。

### 2. 优先级管理

会话 > 项目 > 全局，灵活覆盖。

### 3. 累积学习

每次任务都积累经验，持续改进。

### 4. 知识传递

新代理自动获得经验，保持一致性。

### 5. 灵活保存

会话智慧可选保存到项目或全局。

## 故障排除

### 项目智慧未加载

**原因**：项目目录未初始化。

**解决方案**：
```typescript
initProjectWisdom(process.cwd());
```

### 智慧冲突

**原因**：不同层次的智慧冲突。

**解决方案**：
- 检查优先级（会话 > 项目 > 全局）
- 修改低优先级的智慧
- 或在高优先级中明确覆盖

### 会话智慧丢失

**原因**：会话结束时未保存。

**解决方案**：
- 在会话结束前调用 `saveSessionWisdomTo()`
- 或实现自动保存提示

## 相关文档

- [Subagent Extension README](./README.md) - 子代理扩展主文档
- [Oh-My-OpenCode Orchestration](https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/understanding-orchestration-system.md) - 编排系统设计理念

## 版本历史

### v2.0.0 (2026-01-27)
- **重大更新**：实现三层架构
- 会话智慧（内存）
- 项目智慧（.pi/notepads/）
- 全局智慧（~/.pi/agent/notepads/）
- 优先级管理
- 项目隔离
- 会话智慧保存

### v1.0.0 (2026-01-27)
- 初始实现
- 全局智慧系统
- 6 种智慧类型
- 自动提取和注入
