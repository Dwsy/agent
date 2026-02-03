# 任务索引

**总任务数**: {{TOTAL_TASKS}}
**已完成**: {{COMPLETED}}
**进行中**: {{IN_PROGRESS}}
**待开始**: {{TODO}}
**已锁定**: {{LOCKED}}

**项目名称**: {{PROJECT_NAME}}
**创建时间**: {{CREATED_TIME}}

## 任务列表

| ID | 标题 | 状态 | 优先级 | 预计时间 | 依赖任务 | 占用者 | 锁定时间 |
|----|------|------|--------|----------|----------|--------|----------|
{{TASK_ROWS}}

## 依赖关系图

```
{{DEP_GRAPH}}
```

## 可并行任务分组

{{PARALLEL_GROUPS}}

{{GOALS_TABLE}}

{{EXECUTION_PLAN}}

## 执行建议

### Agent 调度方案

**3 Agent 并行执行**:
```
阶段 1: Agent A (任务001)
阶段 2: Agent A (任务002) + Agent B (任务003) + Agent C (任务004)
...
```

**2 Agent 并行执行**:
```
阶段 1: Agent A (任务001)
阶段 2: Agent A (任务002 + 任务003) + Agent B (任务004 + 任务005)
...
```

### 领用任务流程

1. 读取 `任务索引.md`
2. 查找状态为 `Todo` 的任务
3. 检查依赖任务是否都为 `Done`
4. 更新任务状态为 `Locked`，记录占用者和锁定时间
5. 更新 `任务索引.md` 中的任务状态
6. 开始执行任务

### 任务锁定规则

- 领用时立即锁定，状态: `Todo` → `Locked`
- 开始执行时，状态: `Locked` → `In Progress`
- 完成时，状态: `In Progress` → `Done`，移至 `completed/` 目录
- 阻塞时，状态: `In Progress` → `Blocked`，记录原因并释放锁定
- 锁定超时: 预计时间 × 2，超时后自动释放

## 进度概览

- 总体进度: {{PROGRESS_PERCENT}}%
- 已用时间: {{ELAPSED_TIME}} 小时
- 预计剩余时间: {{ESTIMATED_REMAINING}}