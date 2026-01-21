# {{TASK_ID}}: {{TASK_TITLE}}

**状态**: {{STATUS}}
**优先级**: {{PRIORITY}}
**预计时间**: {{ESTIMATED_TIME}}

**占用者**: {{LOCK_OWNER}}
**锁定时间**: {{LOCK_TIME}}
**锁定超时**: {{LOCK_TIMEOUT}}（超时后自动释放）

## 任务描述

{{DESCRIPTION}}

## 依赖任务

    {{DEPENDENCIES_LIST}}

**说明**: 只有所有标记的依赖任务状态为 Done 后，此任务才能开始执行。

## 验收标准

{{ACCEPTANCE_CRITERIA}}

## 实施步骤

{{IMPLEMENTATION_STEPS}}

## 阻塞原因

**如果状态为 Blocked，在此记录阻塞原因**：
- 等待任务XXX完成
- 等待外部资源（API密钥、审批等）
- 技术问题（需要解决XXX）

## 并行提示

{{PARALLEL_HINT}}

## 备注

[执行过程中的备注]

## 完成记录

- 开始时间: _______
- 完成时间: _______
- 耗时: _______