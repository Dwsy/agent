# KnowledgeBase

## Definition (定义)
> 用于存储、组织、检索和共享项目领域知识的结构化文档系统，旨在消除"知识诅咒"和认知偏差。

## Context (上下文)
- **Domain**: 知识管理 / 文档系统
- **Role**: 作为项目的"第二大脑"，显式化隐性知识

## Implementation (实现)
代码中可以在以下位置找到相关实现：
- `~/.pi/agent/skills/knowledge-base/lib.ts`

```typescript
// 核心目录结构
const REQUIRED_DIRS = [
  "concepts",   // 领域概念
  "guides",     // 操作指南
  "decisions",  // 架构决策
  "external"    // 行业共识
];
```

## Common Misconceptions (常见误区)
> 记录新人容易理解错误的地方，解决"知识诅咒"。
- ❌ 误区：知识库就是代码注释的堆砌
- ✅ 真相：知识库关注"为什么"（Why）和"是什么"（What），代码注释关注"怎么做"（How）
- ❌ 误区：只有架构师才需要写知识库
- ✅ 真相：所有团队成员都有责任记录他们发现的"隐性知识"
- ❌ 误区：知识库是静态的，写完就不管了
- ✅ 真相：知识库是活文档，随着项目演进不断更新

## Relationships (关联)
- Contains: [[Concept]], [[Guide]], [[Decision]]
- Related to: [[Workhub]]
- Depends on: [[AceTool]]

## References (参考)
- [Curse of Knowledge - Wikipedia](https://en.wikipedia.org/wiki/Curse_of_knowledge)
- [ADR (Architecture Decision Records)](https://adr.github.io/)