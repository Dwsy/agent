# Subagent 工具描述更新

## 更新时间

2026-01-27

## 更新内容

### 文件：`~/.pi/agent/extensions/subagent/index.ts`

#### 1. 更新文件顶部注释

**旧版本**：
```typescript
/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 */
```

**新版本**：
```typescript
/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Four Core Features:
 *   1. Category Delegation - Semantic task routing (architecture, security, etc.)
 *   2. Wisdom Accumulation - Auto-extract learnings, inject into future tasks (3-tier: session/project/global)
 *   3. Parallel Optimization - Auto-detect parallelizable tasks, 3x speedup
 *   4. TODO Enforcement - Monitor TODO completion, prevent incomplete work
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." } or { category: "type", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *   - Chain Parallel: Use @parallel: in task for parallel execution within chain
 */
```

#### 2. 更新工具描述（toolDescription）

**新增内容**：

```typescript
const toolDescription = [
	"Delegate tasks to specialized subagents with isolated context.",
	"",
	"🎯 Four Core Features:",
	"  1. Category Delegation - Semantic task routing (architecture, security, etc.)",
	"  2. Wisdom Accumulation - Auto-extract learnings, inject into future tasks (3-tier: session/project/global)",
	"  3. Parallel Optimization - Auto-detect parallelizable tasks, 3x speedup",
	"  4. TODO Enforcement - Monitor TODO completion, prevent incomplete work",
	"",
	// ... 现有内容 ...
	"",
	"Wisdom Accumulation:",
	"  - Auto-extracts learnings from agent output (Convention, Success, Failure, Gotcha, Command, Decision)",
	"  - Three-tier: Session (memory) > Project (.pi/notepads/) > Global (~/.pi/agent/notepads/)",
	"  - Auto-injects accumulated wisdom into future tasks",
	"  - Use /wisdom to view statistics",
	"",
	"Parallel Optimization:",
	"  - Chain mode: Use @parallel: agent1:task1, agent2:task2 for parallel execution",
	"  - Auto-detects file conflicts and dependencies",
	"  - Max concurrency: 4 agents",
	"  - Example: {chain: [{agent: 'scout', task: '@parallel: scout:Find auth, scout:Find db'}]}",
	"",
	"TODO Enforcement:",
	"  - Monitors TODO items in agent output (- [ ] format)",
	"  - Auto-reminds agents to complete unfinished TODOs",
	"  - Tracks completion rate and progress",
	"  - Prevents agents from finishing with incomplete work",
	// ... 其他内容 ...
].join("\n");
```

## 更新后的完整工具描述

```
Delegate tasks to specialized subagents with isolated context.

🎯 Four Core Features:
  1. Category Delegation - Semantic task routing (architecture, security, etc.)
  2. Wisdom Accumulation - Auto-extract learnings, inject into future tasks (3-tier: session/project/global)
  3. Parallel Optimization - Auto-detect parallelizable tasks, 3x speedup
  4. TODO Enforcement - Monitor TODO completion, prevent incomplete work

Available Agents:
  - planner: Five-phase planning agent with parallel exploration and multi-agent design
  - scout: Fast code reconnaissance agent (READ-ONLY)
  - worker: General-purpose worker agent with full capabilities
  - vision: 这是一个可见的子代理，会在工具描述中显示

Available Categories:
  - architecture → oracle: System architecture and design review
  - documentation → librarian: Documentation and knowledge management
  - exploration → scout: Code exploration and reconnaissance
  - planning → planner: Task planning and breakdown
  - implementation → worker: Code implementation and modification
  - security → security-reviewer: Security review and vulnerability assessment
  - review → reviewer: Code review and quality assurance
  - visual → vision: Visual analysis (images, videos, UI, charts)
  - frontend → worker: Frontend development
  - backend → worker: Backend development
  - testing → worker: Testing and quality assurance
  - refactoring → worker: Code refactoring and optimization

Modes:
  - Single: {agent, task} or {category, task} - one subagent
  - Parallel: {tasks: [{agent, task}, ...]} - up to 8 concurrent subagents
  - Chain: {chain: [{agent, task}, ...]} - sequential with {previous} placeholder
  - Chain Parallel: Use @parallel: in task for parallel execution within chain

Category Routing:
  - Use category parameter for semantic routing: {category: 'architecture', task: '...'
  - Category automatically resolves to the best agent for that task type
  - Example: {category: 'security', task: 'Review code for vulnerabilities'}
  - Priority: category > agent (if both provided, category wins)

Wisdom Accumulation:
  - Auto-extracts learnings from agent output (Convention, Success, Failure, Gotcha, Command, Decision)
  - Three-tier: Session (memory) > Project (.pi/notepads/) > Global (~/.pi/agent/notepads/)
  - Auto-injects accumulated wisdom into future tasks
  - Use /wisdom to view statistics

Parallel Optimization:
  - Chain mode: Use @parallel: agent1:task1, agent2:task2 for parallel execution
  - Auto-detects file conflicts and dependencies
  - Max concurrency: 4 agents
  - Example: {chain: [{agent: 'scout', task: '@parallel: scout:Find auth, scout:Find db'}]}

TODO Enforcement:
  - Monitors TODO items in agent output (- [ ] format)
  - Auto-reminds agents to complete unfinished TODOs
  - Tracks completion rate and progress
  - Prevents agents from finishing with incomplete work

Dynamic Mode:
  - If the specified agent doesn't exist, it will be auto-generated based on the task description
  - Just provide an agent name and task - the system will create a suitable subagent

Agent Scope:
  - Default: "user" (from ~/.pi/agent/agents)
  - Use agentScope: "both" to include project-local agents in .pi/agents
  - Use agentScope: "project" for project-only agents
```

## 更新效果

### 1. 用户可见性

当用户在 Pi Agent 中使用 subagent 工具时，会看到完整的功能描述，包括：
- 四大核心功能概览
- 类别委托的使用方法
- 智慧积累的工作原理
- 并行优化的语法
- TODO 强制的机制

### 2. 功能发现性

用户可以通过工具描述了解到：
- 可以使用 `category` 参数进行语义路由
- 系统会自动提取和注入智慧
- 可以使用 `@parallel:` 标记进行并行执行
- 系统会监控 TODO 完成情况

### 3. 使用指导

工具描述提供了清晰的使用示例：
- Category: `{category: 'security', task: 'Review code'}`
- Parallel: `@parallel: scout:Find auth, scout:Find db`
- Wisdom: 使用 `/wisdom` 查看统计
- TODO: 使用 `- [ ]` 格式

## 验证

### 查看更新后的描述

```bash
# 重启 Pi Agent 后，工具描述会自动更新
# 用户可以通过以下方式查看：
# 1. 在 Pi Agent 中输入 /help subagent
# 2. 或查看工具列表时会显示更新后的描述
```

### 测试功能

```javascript
// 测试类别委托
subagent({
  category: "architecture",
  task: "Review the system design"
})

// 测试并行优化
subagent({
  chain: [
    {
      agent: "scout",
      task: "@parallel: scout:Find auth code, scout:Find db code"
    }
  ]
})

// 测试智慧积累
// 在代理输出中标记智慧
// Convention: Use TypeScript strict mode
// 系统会自动提取并在后续任务中注入
```

## 总结

工具描述已更新，包含：
- ✅ 四大核心功能概览
- ✅ 类别委托说明
- ✅ 智慧积累说明
- ✅ 并行优化说明
- ✅ TODO 强制说明
- ✅ 使用示例和指导

用户现在可以通过工具描述了解所有新功能！
