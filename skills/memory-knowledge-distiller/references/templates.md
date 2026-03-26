# Templates

Use these templates to keep outputs sharp and comparable.

## Distillation report template

```md
# Distillation Report

## Summary
- Sources inspected: ...
- Candidates found: ...
- Proposed promotions: ...
- Executed writes: ...

## Candidate Decisions
| Candidate | Source | Type | Target | Action | Reason |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

## Drafted / Written Knowledge
- path: ...
- reason: ...

## Rejected or Deferred Items
- item: ...
- reason: ...

## Next Recommended Actions
- ...
```

## Knowledge entry template

```md
---
title: ...
description: ...
tags: [..]
version: 1
created: YYYY-MM-DD
updated: YYYY-MM-DD
scope: ...
author: ...
---

# Summary
One concise explanation of the durable pattern.

## When to use
List the trigger conditions and situations.

## Why
Explain the benefit or risk reduction.

## How
Describe the recommended procedure.

## Signals / Heuristics
List observable cues, thresholds, or decision signals.

## Anti-patterns
List what not to do and why it fails.

## Source notes
Describe the class of memory this was distilled from. Keep it anonymized.
```

## Candidate decision shorthand

Use these labels in tables or notes:
- `keep-memory`
- `promote-role`
- `promote-global`
- `promote-project`
- `defer`
- `reject`
- `merge`
- `update`
- `create`
- `skip`

## Rewrite examples

### Bad
- I should be more careful when fixing bugs.

### Better memory
- 声明完成前必须运行验证命令并读取输出，不能靠推测宣称修复完成。

### Good knowledge draft title
- Verification Before Declaring Completion

### Bad
- 用户今天很烦 build 总挂。

### Better memory
- 受限环境构建优先使用镜像源与重试，避免网络抖动导致误判。

### Good project/global draft title
- Build Reliability in Restricted Network Environments

## Project knowledge path suggestions

Use one of these categories when drafting `docs/knowledge/...` files:
- `architecture/`
- `workflow/`
- `conventions/`
- `debugging/`
- `glossary/`
- `integration/`
- `operations/`

Choose names that describe the concept, not the incident.

Bad slug:
- `fixed-that-weird-bug-again.md`

Good slug:
- `verification-before-completion.md`
- `memory-promotion-boundaries.md`
- `role-persona-knowledge-source-priority.md`
