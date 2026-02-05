# 并行优化系统 (Parallel Optimization System)

## 概述

并行优化系统自动分析任务依赖关系，识别可并行执行的任务组，最大化执行效率。

这借鉴了 Oh-My-OpenCode 的并行执行策略：自动识别独立任务，同时执行，减少总执行时间。

## 核心理念

### 问题：顺序执行浪费时间

```
任务 1: 查找认证代码 (10s)
  ↓
任务 2: 查找数据库代码 (10s)
  ↓
任务 3: 查找 API 代码 (10s)

总时间: 30s
```

### 解决方案：并行执行

```
任务 1: 查找认证代码 (10s) ┐
任务 2: 查找数据库代码 (10s) ├─ 并行执行
任务 3: 查找 API 代码 (10s)  ┘

总时间: 10s (3x 加速)
```

## 依赖分析

### 1. 文件冲突检测

如果两个任务修改相同文件，不能并行：

```typescript
任务 A: 修改 user.ts
任务 B: 修改 user.ts
→ 文件冲突，必须顺序执行
```

### 2. 依赖冲突检测

如果任务 B 依赖任务 A 的结果，不能并行：

```typescript
任务 A: 查找代码
任务 B: 修改代码 (依赖 A)
→ 依赖冲突，必须顺序执行
```

### 3. 传递依赖检测

检测间接依赖关系：

```typescript
任务 A → 任务 B → 任务 C
→ A 和 C 不能并行（传递依赖）
```

## 任务分组

### 拓扑排序

按依赖层级分组：

```
层级 1: [A, B, C]  (无依赖)
层级 2: [D, E]     (依赖层级 1)
层级 3: [F]        (依赖层级 2)
```

### 文件冲突分组

在同一层级内，按文件冲突进一步分组：

```
层级 1: [A, B, C]
  → 组 1: [A, C]  (无文件冲突，可并行)
  → 组 2: [B]     (与 A 有文件冲突)
```

## 使用方法

### 1. 链式模式中的并行标记

在链式执行中使用 `@parallel:` 标记：

```javascript
subagent({
  chain: [
    // 步骤 1: 并行探索
    { 
      agent: "scout", 
      task: "@parallel: scout:Find auth code, scout:Find db code, scout:Find api code" 
    },
    
    // 步骤 2: 使用前一步的结果
    { 
      agent: "worker", 
      task: "Based on the findings: {previous}, implement the feature" 
    }
  ]
})
```

### 2. 并行标记语法

```
@parallel: agent1:task1, agent2:task2, agent3:task3
```

**示例**：

```javascript
// 并行探索三个模块
"@parallel: scout:Find auth code, scout:Find db code, scout:Find api code"

// 并行实现三个功能
"@parallel: worker:Implement auth, worker:Implement db, worker:Implement api"

// 并行审查多个文件
"@parallel: reviewer:Review auth.ts, reviewer:Review db.ts, reviewer:Review api.ts"
```

### 3. 自动依赖分析（未来支持）

系统自动分析任务依赖，生成执行计划：

```javascript
const tasks = [
  { id: "task1", agent: "scout", task: "Find code" },
  { id: "task2", agent: "worker", task: "Modify code", dependencies: ["task1"] },
  { id: "task3", agent: "worker", task: "Write tests", dependencies: ["task1"] },
  { id: "task4", agent: "reviewer", task: "Review", dependencies: ["task2", "task3"] }
];

const plan = generateExecutionPlan(tasks);
// 步骤 1: [task1]
// 步骤 2: [task2, task3] (并行)
// 步骤 3: [task4]
```

## 执行计划

### 生成执行计划

```typescript
import { generateExecutionPlan } from "./utils/dependency.ts";

const plan = generateExecutionPlan(tasks);

console.log(`Total Steps: ${plan.totalSteps}`);
console.log(`Parallel Steps: ${plan.parallelSteps}`);
console.log(`Estimated Speedup: ${plan.estimatedSpeedup}x`);
```

### 执行计划格式

```markdown
## Execution Plan

**Total Steps**: 3
**Parallel Steps**: 2
**Estimated Speedup**: 2.33x

### Step 1: group-0
**Parallelizable**: Yes
**Tasks** (3):
  - [scout] Find auth code
  - [scout] Find db code
  - [scout] Find api code

### Step 2: group-1
**Parallelizable**: Yes
**Dependencies**: task1, task2, task3
**Tasks** (3):
  - [worker] Modify auth
  - [worker] Modify db
  - [worker] Modify api

### Step 3: group-2
**Parallelizable**: No
**Dependencies**: task4, task5, task6
**Tasks** (1):
  - [reviewer] Review all
```

## 示例场景

### 场景 1：并行代码探索

```javascript
subagent({
  chain: [
    {
      agent: "scout",
      task: "@parallel: scout:Find authentication code, scout:Find database code, scout:Find API endpoints"
    },
    {
      agent: "planner",
      task: "Based on the code structure: {previous}, create an implementation plan"
    }
  ]
})
```

**执行流程**：
1. 三个 scout 代理并行探索（10s）
2. planner 使用合并的结果创建计划（5s）
3. 总时间：15s（vs 顺序执行 35s）

### 场景 2：并行实现功能

```javascript
subagent({
  chain: [
    {
      agent: "scout",
      task: "Find the user module structure"
    },
    {
      agent: "worker",
      task: "@parallel: worker:Implement user registration, worker:Implement user login, worker:Implement password reset"
    },
    {
      agent: "reviewer",
      task: "Review all implementations: {previous}"
    }
  ]
})
```

**执行流程**：
1. scout 探索用户模块（10s）
2. 三个 worker 并行实现功能（20s）
3. reviewer 审查所有实现（5s）
4. 总时间：35s（vs 顺序执行 75s）

### 场景 3：并行测试

```javascript
subagent({
  chain: [
    {
      agent: "worker",
      task: "Implement the feature"
    },
    {
      agent: "worker",
      task: "@parallel: worker:Write unit tests, worker:Write integration tests, worker:Write e2e tests"
    }
  ]
})
```

## 并发控制

### 最大并发数

默认最大并发数：4

```typescript
const MAX_CONCURRENCY = 4;
```

### 并发限制原因

1. **资源限制**：避免过多并发导致系统资源耗尽
2. **API 限制**：避免触发 API 速率限制
3. **稳定性**：保持系统稳定性

### 自定义并发数（未来支持）

```javascript
subagent({
  chain: [...],
  maxConcurrency: 8  // 自定义最大并发数
})
```

## 技术实现

### 依赖分析流程

```
任务列表
    ↓
analyzeDependencies()
    ↓
构建依赖图
    ↓
topologicalSort()
    ↓
按层级分组
    ↓
groupByFileConflicts()
    ↓
按文件冲突细分
    ↓
生成任务组
```

### 并行执行流程

```
链式任务
    ↓
检测 @parallel: 标记
    ↓
parseParallelTasks()
    ↓
解析并行任务列表
    ↓
executeParallelGroup()
    ↓
mapWithConcurrencyLimit()
    ↓
并发执行（最多 4 个）
    ↓
mergeParallelResults()
    ↓
合并结果
```

## 优势

### 1. 自动加速

```
顺序执行: 任务1 → 任务2 → 任务3 (30s)
并行执行: 任务1 + 任务2 + 任务3 (10s)
加速比: 3x
```

### 2. 智能分组

自动识别可并行任务，无需手动指定。

### 3. 安全保证

- 文件冲突检测：避免并发修改同一文件
- 依赖冲突检测：确保依赖顺序正确
- 传递依赖检测：处理间接依赖

### 4. 灵活控制

- 支持手动并行标记
- 支持自动依赖分析
- 支持并发数限制

## 最佳实践

### 1. 识别独立任务

```javascript
// ✅ 好：独立任务
"@parallel: scout:Find auth, scout:Find db, scout:Find api"

// ❌ 坏：依赖任务
"@parallel: scout:Find code, worker:Modify code"  // worker 依赖 scout
```

### 2. 避免文件冲突

```javascript
// ✅ 好：不同文件
"@parallel: worker:Modify auth.ts, worker:Modify db.ts"

// ❌ 坏：相同文件
"@parallel: worker:Modify user.ts, worker:Modify user.ts"
```

### 3. 合理分组

```javascript
// ✅ 好：相似任务分组
"@parallel: scout:Find auth, scout:Find db, scout:Find api"

// ⚠️ 可以但不推荐：混合任务
"@parallel: scout:Find code, reviewer:Review code, worker:Write tests"
```

### 4. 控制并发数

```javascript
// ✅ 好：适度并发（3-4 个）
"@parallel: task1, task2, task3, task4"

// ⚠️ 注意：过多并发（8+ 个）
"@parallel: task1, task2, task3, task4, task5, task6, task7, task8"
// 可能触发并发限制
```

## 故障排除

### 并行任务失败

**原因**：某个并行任务失败。

**解决方案**：
1. 检查失败任务的错误信息
2. 确认任务是否真正独立
3. 检查是否有隐藏的依赖关系

### 并行标记未识别

**原因**：标记格式不正确。

**解决方案**：
1. 确保使用 `@parallel:` 前缀
2. 格式：`agent:task, agent:task`
3. 代理名和任务之间用冒号分隔
4. 多个任务用逗号分隔

### 执行顺序错误

**原因**：依赖关系未正确指定。

**解决方案**：
1. 检查任务的 `dependencies` 字段
2. 确认依赖任务的 ID 正确
3. 使用 `generateExecutionPlan()` 验证执行计划

## 相关文档

- [Subagent Extension README](./README.md) - 子代理扩展主文档
- [Oh-My-OpenCode Orchestration](https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/guide/understanding-orchestration-system.md) - 编排系统设计理念

## 版本历史

### v1.0.0 (2026-01-27)
- 初始实现
- 依赖分析工具
- 文件冲突检测
- 依赖冲突检测
- 拓扑排序
- 任务分组
- 并行标记支持
- Chain Mode 增强
