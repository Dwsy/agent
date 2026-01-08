# Workhub

## Definition (定义)
> 工作文档枢纽，强制执行 SSOT（Single Source of Truth）原则，管理 Issues、PRs 和架构决策的文档化工作流。

## Context (上下文)
- **Domain**: 任务管理 / 文档治理
- **Role**: Pi Agent 的核心工作流工具，连接任务跟踪和代码变更

## Implementation (实现)
代码中可以在以下位置找到相关实现：
- `~/.pi/agent/skills/workhub/lib.ts`

```typescript
// 核心目录结构
const DOCS_ROOT = resolve(process.cwd(), "docs");
const REQUIRED_DIRS = ["adr", "architecture", "issues", "pr"];
```

## Core Principles (核心原则)

### 1. SSOT (Single Source of Truth)
- 每个知识领域只有一个权威文档
- Issues 是任务跟踪的唯一来源
- PRs 是变更记录的唯一来源

### 2. 文件系统即记忆
- 大输出内容保存到文件，而非堆砌到上下文
- 工作记忆中只保留文件路径
- 需要时通过 `workhub read` 读取

### 3. 状态管理
- **决策前读取 Issue**：刷新目标，保持注意力
- **行动后更新 Issue**：标记 [x]，更新 Status
- **错误记录**：在 Issue 的 "Errors Encountered" 中记录

### 4. 变更可追溯
- 每个 PR 必须关联 Issue
- Issue 记录完整决策过程
- PR 记录变更细节和回滚计划

## Common Misconceptions (常见误区)
> 记录新人容易理解错误的地方，解决"知识诅咒"。
- ❌ 误区：Workhub 就是 Git Issue/PR 的替代品
- ✅ 真相：Workhub 是本地文件系统的轻量级文档管理，与 GitHub 工作流兼容但不依赖
- ❌ 误区：Issue 必须完整填写所有字段才能开始工作
- ✅ 真相：Issue 是活文档，可以边工作边完善，关键是持续更新
- ❌ 误区：只有大型任务才需要创建 Issue
- ✅ 真相：任何需要跟踪的任务、决策或研究都应有 Issue

## Usage Flow (使用流程)

### 标准工作流
```
1. 创建 Issue
   bun ~/.pi/agent/skills/workhub/lib.ts create issue "任务描述" [分类]

2. 执行任务前读取 Issue
   bun ~/.pi/agent/skills/workhub/lib.ts read issues/xxx.md

3. 完成子任务后更新 Issue（标记 [x]）

4. 完成后创建 PR 并关联 Issue
   bun ~/.pi/agent/skills/workhub/lib.ts create pr "变更描述" [分类]
```

### 错误恢复模式
```
遇到错误时：
1. 读取 Issue
2. 在 "Errors Encountered" 表格中记录
3. 执行解决方案
4. 在 Notes 中更新
```

## Relationships (关联)
- Complements: [[KnowledgeBase]]
- Manages: [[Issue]], [[PR]]
- Location: `docs/` 目录

## References (参考)
- [Workhub 技能文档](~/.pi/agent/skills/workhub/SKILL.md)
- [SSOT 原则](https://en.wikipedia.org/wiki/Single_source_of_truth)
- [ADR (Architecture Decision Records)](https://adr.github.io/)